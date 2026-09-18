import { NextRequest, NextResponse } from "next/server";

import { apiError, getRequestContext } from "@/lib/api";
import { addSignedUrls } from "@/lib/assets";
import {
  createKieFlareTask,
  KieFlareError,
  type KieFlareAspectRatio,
  type KieFlareBackground,
  type KieFlareResolution,
} from "@/lib/kie-flare";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getRequestContext();
  if (!context) return apiError("请先登录", 401);
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { data: sourceJob, error } = await context.supabase
    .from("generation_jobs")
    .select("*")
    .eq("id", id)
    .eq("user_id", context.userId)
    .eq("source", "agent")
    .maybeSingle();
  if (error) return apiError("读取原任务失败", 500, error.message);
  if (!sourceJob) return apiError("Agent 生图任务不存在", 404);

  const saved = (sourceJob.request || {}) as Record<string, unknown>;
  const config = (saved.config || {}) as Record<string, unknown>;
  const prompt = typeof saved.prompt === "string" ? saved.prompt : "";
  const referenceAssetIds = Array.isArray(saved.orderedReferenceAssetIds)
    ? saved.orderedReferenceAssetIds.filter((value): value is string => typeof value === "string")
    : [];
  const providerModel = typeof sourceJob.provider_model === "string"
    ? sourceJob.provider_model
    : typeof saved.providerModel === "string"
      ? saved.providerModel
      : "";
  if (!prompt || ![
    "gpt-image-2-5-flare-text-to-image",
    "gpt-image-2-5-flare-image-to-image",
  ].includes(providerModel)) {
    return apiError("原任务缺少可重试的 GPT Image 2.5 Flare 参数", 409);
  }

  const { data: references, error: referenceError } = referenceAssetIds.length
    ? await context.supabase
        .from("assets")
        .select("id,bucket,object_path,mime_type")
        .eq("project_id", sourceJob.project_id)
        .eq("user_id", context.userId)
        .is("deleted_at", null)
        .in("id", referenceAssetIds)
    : { data: [], error: null };
  if (referenceError) return apiError("读取参考图失败", 500, referenceError.message);
  const byId = new Map((references || []).map((asset) => [asset.id, asset]));
  if (referenceAssetIds.some((assetId) => !byId.has(assetId))) return apiError("原任务的参考素材已不可用", 409);
  const orderedReferences = referenceAssetIds.map((assetId) => byId.get(assetId)!);
  const signed = await addSignedUrls(context.supabase, orderedReferences, 3600);
  const referenceUrls = signed.map((asset) => asset.url).filter((url): url is string => Boolean(url));
  if (referenceUrls.length !== referenceAssetIds.length) return apiError("无法读取原任务参考图", 500);

  const { data: job, error: insertError } = await context.supabase
    .from("generation_jobs")
    .insert({
      project_id: sourceJob.project_id,
      conversation_id: sourceJob.conversation_id,
      user_id: context.userId,
      user_message_id: sourceJob.user_message_id,
      provider: "kie",
      model: "gpt-image-2-5-flare",
      provider_model: providerModel,
      source: "agent",
      agent_run_id: sourceJob.agent_run_id,
      agent_tool_call_id: `retry:${crypto.randomUUID()}`,
      request: saved,
      status: "submitting",
    })
    .select("*")
    .single();
  if (insertError || !job) return apiError("创建重试任务失败", 500, insertError?.message);

  if (referenceAssetIds.length) {
    const { error: linkError } = await context.supabase.from("generation_job_assets").insert(
      referenceAssetIds.map((assetId, position) => ({ job_id: job.id, asset_id: assetId, position, role: "reference" })),
    );
    if (linkError) {
      await context.supabase.from("generation_jobs").delete().eq("id", job.id);
      return apiError("恢复参考图顺序失败", 500, linkError.message);
    }
  }

  const requestedX = Number(body?.x);
  const requestedY = Number(body?.y);
  const placeholder = {
    id: `job-${job.id}`,
    type: "imageCard",
    position: {
      x: Number.isFinite(requestedX) ? requestedX : 140,
      y: Number.isFinite(requestedY) ? requestedY : 140,
    },
    data: { jobId: job.id, status: "submitting", label: prompt.slice(0, 80) },
    style: { width: 300, height: 240 },
  };
  const { error: canvasError } = await context.supabase.rpc("append_canvas_node", {
    p_project_id: sourceJob.project_id,
    p_node: placeholder,
  });
  if (canvasError) {
    await context.supabase.from("generation_jobs").update({ status: "fail", error_message: canvasError.message }).eq("id", job.id);
    return apiError("创建画布占位节点失败", 500, canvasError.message);
  }

  try {
    const created = await createKieFlareTask({
      prompt,
      referenceUrls,
      aspectRatio: (config.aspectRatio || "auto") as KieFlareAspectRatio,
      resolution: (config.resolution || "1K") as KieFlareResolution,
      background: (config.background || "auto") as KieFlareBackground,
    });
    if (created.providerModel !== providerModel) {
      throw new Error("原任务模型与参考素材不一致，已拒绝回退或切换模型");
    }
    const { data: updated, error: updateError } = await context.supabase
      .from("generation_jobs")
      .update({ provider_task_id: created.taskId, status: "waiting" })
      .eq("id", job.id)
      .select("*")
      .single();
    if (updateError || !updated) throw new Error(updateError?.message || "更新重试任务失败");
    return NextResponse.json({ job: updated, node: placeholder }, { status: 201 });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "重新提交生图任务失败";
    await context.supabase
      .from("generation_jobs")
      .update({ status: "fail", error_code: "retry_submit_error", error_message: message, completed_at: new Date().toISOString() })
      .eq("id", job.id);
    return apiError(message, caught instanceof KieFlareError ? caught.status : 502, { jobId: job.id });
  }
}
