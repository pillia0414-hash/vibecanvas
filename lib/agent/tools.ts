import "server-only";

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

import { safeTitle } from "@/lib/api";
import { addSignedUrls } from "@/lib/assets";
import {
  buildKieFlareRequest,
  createKieFlareTask,
  type KieFlareAspectRatio,
  type KieFlareBackground,
  type KieFlareResolution,
} from "@/lib/kie-flare";

interface ToolContext {
  supabase: SupabaseClient;
  userId: string;
  projectId: string;
  conversationId: string;
  runId: string;
  userMessageId: string;
}

interface OwnedAsset {
  id: string;
  project_id: string;
  bucket: string;
  object_path: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  kind: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

const imageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function createAgentTools(context: ToolContext): AgentTool[] {
  const viewedAssetIds = new Set<string>();

  async function ownedAsset(assetId: string, imageOnly = false): Promise<OwnedAsset> {
    const { data, error } = await context.supabase
      .from("assets")
      .select("id,project_id,bucket,object_path,mime_type,width,height,kind,metadata,created_at")
      .eq("id", assetId)
      .eq("project_id", context.projectId)
      .eq("user_id", context.userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(`读取素材失败：${error.message}`);
    if (!data) throw new Error("素材不存在或不属于当前项目");
    if (imageOnly && !imageMimeTypes.has(data.mime_type)) throw new Error("该素材不是支持的图片");
    return data as OwnedAsset;
  }

  const listAssets: AgentTool = {
    name: "list_assets",
    label: "列出素材",
    description: "列出当前项目可使用的图片和 Markdown 素材。需要先找到素材 ID 时使用。",
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: "返回数量，默认 50，最大 100" })),
    }),
    executionMode: "parallel",
    async execute(_toolCallId, params) {
      const input = params as { limit?: number };
      const limit = Math.max(1, Math.min(100, Math.floor(Number(input.limit) || 50)));
      const { data, error } = await context.supabase
        .from("assets")
        .select("id,kind,mime_type,width,height,metadata,created_at")
        .eq("project_id", context.projectId)
        .eq("user_id", context.userId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(`列出素材失败：${error.message}`);
      const assets = (data || [])
        .filter((asset) => (asset.metadata as { skill?: unknown } | null)?.skill !== true)
        .map((asset) => ({
        id: asset.id,
        name: typeof asset.metadata?.originalName === "string" ? asset.metadata.originalName : undefined,
        kind: asset.kind,
        mimeType: asset.mime_type,
        width: asset.width,
        height: asset.height,
        createdAt: asset.created_at,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify({ assets }, null, 2) }],
        details: { count: assets.length, assets },
      };
    },
  };

  const viewImage: AgentTool = {
    name: "view_image",
    label: "查看图片",
    description: "真正读取并查看当前项目中的一张图片。引用图一、图二等素材前必须先调用此工具。",
    parameters: Type.Object({
      asset_id: Type.String({ description: "要查看的图片素材 UUID" }),
    }),
    executionMode: "parallel",
    async execute(_toolCallId, params, signal) {
      const input = params as { asset_id: string };
      if (signal?.aborted) throw new Error("操作已取消");
      const asset = await ownedAsset(String(input.asset_id), true);
      const { data: blob, error } = await context.supabase.storage
        .from(asset.bucket)
        .download(asset.object_path);
      if (error || !blob) throw new Error(`读取图片文件失败：${error?.message || "未知错误"}`);
      if (signal?.aborted) throw new Error("操作已取消");
      const original = Buffer.from(await blob.arrayBuffer());
      const visionImage = await sharp(original, { failOn: "error" })
        .rotate()
        .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 86 })
        .toBuffer();
      viewedAssetIds.add(asset.id);
      const name = typeof asset.metadata?.originalName === "string" ? asset.metadata.originalName : asset.id;
      return {
        content: [
          { type: "text", text: `已查看图片 ${name}（asset_id: ${asset.id}）。请根据实际画面内容继续规划。` },
          { type: "image", data: visionImage.toString("base64"), mimeType: "image/webp" },
        ],
        details: { assetId: asset.id, name, width: asset.width, height: asset.height },
      };
    },
  };

  const readCanvas: AgentTool = {
    name: "read_canvas",
    label: "读取画布",
    description: "读取当前项目共享画布的节点、位置、尺寸和素材关联。",
    parameters: Type.Object({}),
    executionMode: "parallel",
    async execute() {
      const { data, error } = await context.supabase
        .from("canvas_documents")
        .select("nodes,edges,viewport,revision")
        .eq("project_id", context.projectId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (error) throw new Error(`读取画布失败：${error.message}`);
      if (!data) throw new Error("当前项目没有画布");
      const nodes = Array.isArray(data.nodes) ? data.nodes.map((raw) => {
        const node = raw as Record<string, unknown>;
        const nodeData = (node.data || {}) as Record<string, unknown>;
        return {
          id: node.id,
          type: node.type,
          position: node.position,
          style: node.style,
          assetId: nodeData.assetId,
          jobId: nodeData.jobId,
          status: nodeData.status,
        };
      }) : [];
      const summary = { revision: data.revision, viewport: data.viewport, nodes, edgeCount: Array.isArray(data.edges) ? data.edges.length : 0 };
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }], details: summary };
    },
  };

  const placeAsset: AgentTool = {
    name: "place_asset_on_canvas",
    label: "放入画布",
    description: "把当前项目的一张已有图片素材放到共享画布指定位置。",
    parameters: Type.Object({
      asset_id: Type.String({ description: "图片素材 UUID" }),
      x: Type.Optional(Type.Number({ description: "画布 X 坐标" })),
      y: Type.Optional(Type.Number({ description: "画布 Y 坐标" })),
    }),
    executionMode: "sequential",
    async execute(_toolCallId, params) {
      const input = params as { asset_id: string; x?: number; y?: number };
      const asset = await ownedAsset(String(input.asset_id), true);
      const width = asset.width || 1024;
      const height = asset.height || 1024;
      const scale = Math.min(1, 320 / Math.max(width, height));
      const node = {
        id: `asset-${asset.id}-${crypto.randomUUID()}`,
        type: "imageCard",
        position: {
          x: Number.isFinite(input.x) ? Number(input.x) : 120,
          y: Number.isFinite(input.y) ? Number(input.y) : 120,
        },
        data: { assetId: asset.id, status: "success" },
        style: { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) },
      };
      const { data, error } = await context.supabase.rpc("append_canvas_node", {
        p_project_id: context.projectId,
        p_node: node,
      });
      if (error) throw new Error(`将素材放入画布失败：${error.message}`);
      const revision = Array.isArray(data) ? data[0]?.revision : undefined;
      return {
        content: [{ type: "text", text: `素材 ${asset.id} 已放入画布。` }],
        details: { assetId: asset.id, nodeId: node.id, revision },
      };
    },
  };

  const generateImage: AgentTool = {
    name: "generate_image",
    label: "生成图片",
    description: "使用 KIE GPT Image 2.5 Flare 创建真实生图任务。有参考图时按数组顺序传入，且每张图必须先用 view_image 查看。",
    parameters: Type.Object({
      prompt: Type.String({ description: "完整生图提示词，最多 20000 字符" }),
      reference_asset_ids: Type.Optional(Type.Array(Type.String(), { maxItems: 16, description: "有序参考图素材 ID；第一项是图一" })),
      aspect_ratio: Type.Optional(Type.String({ description: "auto、1:1、3:2、2:3、4:3、3:4、16:9、9:16、21:9、27:16、16:27、9:8 或 8:9" })),
      resolution: Type.Optional(Type.String({ description: "1K、2K 或 4K" })),
      background: Type.Optional(Type.String({ description: "auto、transparent 或 opaque" })),
      x: Type.Optional(Type.Number({ description: "生成占位节点 X 坐标" })),
      y: Type.Optional(Type.Number({ description: "生成占位节点 Y 坐标" })),
    }),
    executionMode: "sequential",
    async execute(toolCallId, params, signal, onUpdate) {
      const input = params as {
        prompt: string;
        reference_asset_ids?: string[];
        aspect_ratio?: string;
        resolution?: string;
        background?: string;
        x?: number;
        y?: number;
      };
      const prompt = String(input.prompt || "");
      const referenceAssetIds: string[] = Array.isArray(input.reference_asset_ids)
        ? input.reference_asset_ids.map(String)
        : [];
      if (new Set(referenceAssetIds).size !== referenceAssetIds.length) throw new Error("参考图列表不能包含重复素材");
      const notViewed = referenceAssetIds.filter((assetId) => !viewedAssetIds.has(assetId));
      if (notViewed.length) {
        throw new Error(`生成前必须先调用 view_image 查看这些参考图：${notViewed.join(", ")}`);
      }

      const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
      const { count } = await context.supabase
        .from("generation_jobs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .gte("created_at", oneMinuteAgo);
      if ((count || 0) >= 5) throw new Error("生图请求过于频繁，请稍后再试");

      const references: OwnedAsset[] = [];
      for (const assetId of referenceAssetIds) references.push(await ownedAsset(assetId, true));
      const signed = await addSignedUrls(context.supabase, references, 3600);
      const referenceUrls = signed.map((asset) => asset.url).filter((url): url is string => Boolean(url));
      if (referenceUrls.length !== references.length) throw new Error("无法为参考图创建安全访问地址");

      const requested = {
        prompt,
        referenceUrls,
        aspectRatio: (input.aspect_ratio || "auto") as KieFlareAspectRatio,
        resolution: (input.resolution || "1K") as KieFlareResolution,
        background: (input.background || "auto") as KieFlareBackground,
        signal,
      };
      const exact = buildKieFlareRequest(requested);
      const persistedProviderInput = {
        ...exact.input,
        ...(referenceAssetIds.length ? { input_urls: referenceAssetIds.map((assetId) => `asset:${assetId}`) } : {}),
      };
      const config = {
        aspectRatio: requested.aspectRatio,
        resolution: requested.resolution,
        background: requested.background,
      };
      const { data: job, error: jobError } = await context.supabase
        .from("generation_jobs")
        .insert({
          project_id: context.projectId,
          conversation_id: context.conversationId,
          user_id: context.userId,
          user_message_id: context.userMessageId,
          provider: "kie",
          model: "gpt-image-2-5-flare",
          provider_model: exact.model,
          source: "agent",
          agent_run_id: context.runId,
          agent_tool_call_id: toolCallId,
          status: "submitting",
          request: {
            prompt,
            config,
            providerModel: exact.model,
            providerInput: persistedProviderInput,
            orderedReferenceAssetIds: referenceAssetIds,
          },
        })
        .select("id,status,model,provider_model,source,created_at,updated_at")
        .single();
      if (jobError || !job) throw new Error(`创建生图任务记录失败：${jobError?.message || "未知错误"}`);

      if (referenceAssetIds.length) {
        const { error } = await context.supabase.from("generation_job_assets").insert(
          referenceAssetIds.map((assetId, position) => ({ job_id: job.id, asset_id: assetId, position, role: "reference" })),
        );
        if (error) {
          await context.supabase.from("generation_jobs").update({ status: "fail", error_message: error.message }).eq("id", job.id);
          throw new Error(`保存有序参考素材失败：${error.message}`);
        }
      }

      const placeholder = {
        id: `job-${job.id}`,
        type: "imageCard",
        position: {
          x: Number.isFinite(input.x) ? Number(input.x) : 100,
          y: Number.isFinite(input.y) ? Number(input.y) : 100,
        },
        data: { jobId: job.id, status: "submitting", label: prompt.slice(0, 80) },
        style: { width: 300, height: 240 },
      };
      const { error: canvasError } = await context.supabase.rpc("append_canvas_node", {
        p_project_id: context.projectId,
        p_node: placeholder,
      });
      if (canvasError) {
        await context.supabase.from("generation_jobs").update({ status: "fail", error_message: canvasError.message }).eq("id", job.id);
        throw new Error(`创建画布占位节点失败：${canvasError.message}`);
      }

      onUpdate?.({
        content: [{ type: "text", text: "正在向 KIE GPT Image 2.5 Flare 提交任务…" }],
        details: { jobId: job.id, status: "submitting", providerModel: exact.model },
      });

      try {
        const created = await createKieFlareTask(requested);
        const { data: updated, error: updateError } = await context.supabase
          .from("generation_jobs")
          .update({
            provider_task_id: created.taskId,
            provider_model: created.providerModel,
            status: "waiting",
          })
          .eq("id", job.id)
          .select("id,status,model,provider_model,source,created_at,updated_at")
          .single();
        if (updateError || !updated) throw new Error(`更新生图任务失败：${updateError?.message || "未知错误"}`);
        const title = safeTitle(prompt);
        await Promise.all([
          context.supabase.from("projects").update({ title }).eq("id", context.projectId).eq("title", "Untitled"),
          context.supabase.from("conversations").update({ title }).eq("id", context.conversationId).eq("title", "新对话"),
        ]);
        return {
          content: [{ type: "text", text: `已创建 GPT Image 2.5 Flare 生图任务 ${job.id}。任务会在后台生成并自动进入素材库和画布。` }],
          details: {
            jobId: job.id,
            status: updated.status,
            providerModel: created.providerModel,
            referenceAssetIds,
            config,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "提交 KIE 生图任务失败";
        await context.supabase
          .from("generation_jobs")
          .update({ status: "fail", error_code: "agent_submit_error", error_message: message, completed_at: new Date().toISOString() })
          .eq("id", job.id);
        throw error;
      }
    },
  };

  return [listAssets, viewImage, readCanvas, placeAsset, generateImage];
}
