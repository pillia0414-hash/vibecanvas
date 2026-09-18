import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { addSignedPreviewUrls, browserAssetPreviewUrl, browserAssetUrl, isImageMime } from "@/lib/assets";
import { reconcileGeneratedNodes } from "@/lib/canvas";
import { isSkillMetadata, skillSummaryFromAsset } from "@/lib/skills";
import { withBuiltinSkills } from "@/lib/skills-server";

export class WorkspaceLoadError extends Error {
  constructor(message: string, public readonly status: number, public readonly details?: unknown) {
    super(message);
    this.name = "WorkspaceLoadError";
  }
}

export async function loadProjectWorkspace(supabase: SupabaseClient, projectId: string) {
  // All reads are protected by RLS, so the project lookup does not need to be
  // a serial gate in front of the remaining workspace queries.
  const [projectResult, conversationsResult, canvasResult, messagesResult, assetsResult, jobsResult, linksResult, runsResult, eventsResult, jobAssetsResult] = await Promise.all([
    supabase
      .from("projects")
      .select("id,title,cover_asset_id,created_at,updated_at")
      .eq("id", projectId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("conversations")
      .select("id,project_id,title,created_at,updated_at")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("canvas_documents")
      .select("nodes,edges,viewport,revision")
      .eq("project_id", projectId)
      .maybeSingle(),
    supabase
      .from("messages")
      .select("id,conversation_id,project_id,role,content,model,config,reference_asset_id,mode,status,metadata,created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
    supabase
      .from("assets")
      .select("id,project_id,kind,bucket,object_path,mime_type,width,height,metadata,created_at")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("generation_jobs")
      .select("id,project_id,conversation_id,user_message_id,model,provider_model,source,agent_run_id,agent_tool_call_id,request,status,result,error_code,error_message,created_at,updated_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
    supabase.from("message_assets").select("message_id,asset_id,position,relation_type"),
    supabase
      .from("agent_runs")
      .select("id,project_id,conversation_id,user_message_id,assistant_message_id,provider,model,status,error_message,created_at,updated_at,completed_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
    supabase
      .from("agent_events")
      .select("id,run_id,sequence,event_type,tool_call_id,tool_name,payload,created_at")
      .eq("project_id", projectId)
      .order("id", { ascending: true }),
    supabase.from("generation_job_assets").select("job_id,asset_id,position,role"),
  ]);

  const { data: project, error: projectError } = projectResult;
  if (projectError) throw new WorkspaceLoadError("加载项目失败", 500, projectError.message);
  if (!project) throw new WorkspaceLoadError("项目不存在", 404);

  const firstError = [conversationsResult, canvasResult, messagesResult, assetsResult, jobsResult, linksResult, runsResult, eventsResult, jobAssetsResult].find(
    (result) => result.error,
  )?.error;
  if (firstError) throw new WorkspaceLoadError("加载工作区失败", 500, firstError.message);

  const rawAssets = assetsResult.data || [];
  const skillAssets = rawAssets.filter((asset) => isSkillMetadata(asset.metadata));
  const contentAssets = rawAssets.filter((asset) => !isSkillMetadata(asset.metadata));
  const signedPreviews = await addSignedPreviewUrls(
    supabase,
    contentAssets.filter((asset) => isImageMime(asset.mime_type)),
  );
  const previewById = new Map(signedPreviews.map((asset) => [asset.id, asset.previewUrl]));
  const assets = contentAssets.map((asset) => {
    const url = browserAssetUrl(asset.id);
    const metadata = (asset.metadata || {}) as Record<string, unknown>;
    const markdown = asset.mime_type === "text/markdown" || asset.mime_type === "text/plain";
    return {
      ...asset,
      url,
      previewUrl: markdown
        ? `${url}?preview=1`
        : previewById.get(asset.id) || browserAssetPreviewUrl(asset.id),
      downloadUrl: `${url}?download=1`,
      fileName: typeof metadata.originalName === "string" ? metadata.originalName : asset.id,
      size: typeof metadata.size === "number" ? metadata.size : null,
    };
  });
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const rawCanvas = canvasResult.data || { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, revision: 0 };
  const hydratedNodes = (Array.isArray(rawCanvas.nodes) ? rawCanvas.nodes : []).map((node) => {
    const value = node as Record<string, unknown>;
    const data = (value.data || {}) as Record<string, unknown>;
    const asset = typeof data.assetId === "string" ? assetById.get(data.assetId) : undefined;
    return { ...value, data: { ...data, imageUrl: asset?.previewUrl || asset?.url } };
  });
  const nodes = reconcileGeneratedNodes(
    hydratedNodes,
    (jobsResult.data || []) as Array<{ id: string; status: "submitting" | "waiting" | "queuing" | "generating" | "processing_result" | "success" | "fail" | "timeout"; result?: { assetIds?: string[] } }>,
    assets,
  );
  const projectMessageIds = new Set((messagesResult.data || []).map((message) => message.id));
  const linksByMessage = new Map<string, Array<{ assetId: string; position: number; relationType: string }>>();
  for (const link of linksResult.data || []) {
    if (!projectMessageIds.has(link.message_id)) continue;
    const existing = linksByMessage.get(link.message_id) || [];
    existing.push({ assetId: link.asset_id, position: link.position, relationType: link.relation_type });
    linksByMessage.set(link.message_id, existing);
  }
  const messages = (messagesResult.data || []).map((message) => ({
    ...message,
    referenceAsset: message.reference_asset_id ? assetById.get(message.reference_asset_id) : undefined,
    assets: (linksByMessage.get(message.id) || [])
      .sort((a, b) => a.position - b.position)
      .map((link) => {
        const asset = assetById.get(link.assetId);
        return asset ? { ...asset, relationType: link.relationType, position: link.position } : undefined;
      })
      .filter(Boolean),
  }));

  const projectJobIds = new Set((jobsResult.data || []).map((job) => job.id));
  const jobAssets = (jobAssetsResult.data || []).filter((link) => projectJobIds.has(link.job_id));

  return {
    project,
    conversations: conversationsResult.data || [],
    canvas: { ...rawCanvas, nodes },
    messages,
    assets,
    jobs: jobsResult.data || [],
    jobAssets,
    agentRuns: runsResult.data || [],
    agentEvents: eventsResult.data || [],
    skills: await withBuiltinSkills(
      projectId,
      skillAssets.map(skillSummaryFromAsset).filter((skill): skill is NonNullable<typeof skill> => Boolean(skill)),
    ),
  };
}
