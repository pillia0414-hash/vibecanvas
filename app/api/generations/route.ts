import { NextRequest, NextResponse } from "next/server";

import { apiError, getRequestContext, safeTitle } from "@/lib/api";
import type { GenerationConfig, GenerationModel } from "@/lib/app-types";
import { addSignedUrls } from "@/lib/assets";
import { createKieTask, KieError } from "@/lib/kie";

const MODELS = new Set<GenerationModel>(["gpt-image-2", "nano-banana-2"]);
const RESOLUTIONS = new Set(["1K", "2K", "4K"]);
const GPT_RATIOS = new Set(["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "3:1", "1:3", "21:9", "9:21"]);
const NANO_RATIOS = new Set(["auto", "1:1", "2:3", "3:2", "1:4", "4:1", "3:4", "4:3", "4:5", "5:4", "1:8", "8:1", "9:16", "16:9", "21:9"]);

function validateConfig(model: GenerationModel, value: unknown): GenerationConfig | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.resolution !== "string" || !RESOLUTIONS.has(raw.resolution)) return null;
  if (typeof raw.aspectRatio !== "string") return null;
  const resolution = raw.resolution as GenerationConfig["resolution"];
  const aspectRatio = raw.aspectRatio;
  if (model === "nano-banana-2") {
    if (!NANO_RATIOS.has(aspectRatio) || !["jpg", "png"].includes(String(raw.outputFormat))) return null;
    return { resolution, aspectRatio, outputFormat: raw.outputFormat as "jpg" | "png" };
  }
  if (!GPT_RATIOS.has(aspectRatio)) return null;
  if (aspectRatio === "auto" && resolution !== "1K") return null;
  const blocked2K = ["5:4", "4:5", "3:1", "1:3", "9:21"];
  const blocked4K = ["1:1", "3:1", "1:3", "9:21"];
  if ((resolution === "2K" && blocked2K.includes(aspectRatio)) || (resolution === "4K" && blocked4K.includes(aspectRatio))) return null;
  const background = ["auto", "transparent", "opaque"].includes(String(raw.background))
    ? (raw.background as "auto" | "transparent" | "opaque")
    : "auto";
  return { resolution, aspectRatio, ...(resolution === "1K" ? { background } : {}) };
}

export async function POST(request: NextRequest) {
  const context = await getRequestContext();
  if (!context) return apiError("请先登录", 401);
  const body = await request.json().catch(() => null);
  if (!body) return apiError("请求数据无效");

  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const model = body.model as GenerationModel;
  const referenceAssetId = typeof body.referenceAssetId === "string" ? body.referenceAssetId : undefined;
  const requestedPosition = body.canvasPosition as { x?: unknown; y?: unknown } | undefined;
  if (!projectId || !conversationId) return apiError("缺少项目或对话参数");
  if (!prompt) return apiError("请输入生图提示词");
  if (prompt.length > 20_000) return apiError("提示词不能超过 20,000 个字符");
  if (!MODELS.has(model)) return apiError("不支持的生图模型");
  const config = validateConfig(model, body.config);
  if (!config) return apiError("模型配置无效");

  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count } = await context.supabase
    .from("generation_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", context.userId)
    .gte("created_at", oneMinuteAgo);
  if ((count || 0) >= 5) return apiError("请求过于频繁，请稍后再试", 429);

  const { data: conversation } = await context.supabase
    .from("conversations")
    .select("id,project_id")
    .eq("id", conversationId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!conversation) return apiError("对话不存在", 404);

  let referenceUrl: string | undefined;
  if (referenceAssetId) {
    const { data: reference } = await context.supabase
      .from("assets")
      .select("id,bucket,object_path")
      .eq("id", referenceAssetId)
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!reference) return apiError("参考图不存在", 404);
    const [signed] = await addSignedUrls(context.supabase, [reference], 3600);
    referenceUrl = signed.url;
    if (!referenceUrl) return apiError("无法读取参考图", 500);
  }

  const { data: message, error: messageError } = await context.supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      project_id: projectId,
      user_id: context.userId,
      role: "user",
      content: prompt,
      mode: "image",
      status: "completed",
      model,
      config,
      reference_asset_id: referenceAssetId || null,
    })
    .select("id,conversation_id,project_id,role,content,model,config,reference_asset_id,created_at")
    .single();
  if (messageError || !message) return apiError("保存消息失败", 500, messageError?.message);
  if (referenceAssetId) {
    const { error: linkError } = await context.supabase.from("message_assets").insert({
      message_id: message.id,
      asset_id: referenceAssetId,
      position: 0,
      relation_type: "reference",
    });
    if (linkError) {
      await context.supabase.from("messages").delete().eq("id", message.id);
      return apiError("保存参考图失败", 500, linkError.message);
    }
  }

  const { data: job, error: jobError } = await context.supabase
    .from("generation_jobs")
    .insert({
      project_id: projectId,
      conversation_id: conversationId,
      user_id: context.userId,
      user_message_id: message.id,
      model,
      source: "direct",
      request: { prompt, config, referenceAssetId: referenceAssetId || null },
      status: "submitting",
    })
    .select("id,project_id,conversation_id,user_message_id,model,status,created_at,updated_at")
    .single();
  if (jobError || !job) return apiError("创建任务记录失败", 500, jobError?.message);

  const { data: canvas } = await context.supabase
    .from("canvas_documents")
    .select("nodes,edges,viewport")
    .eq("project_id", projectId)
    .maybeSingle();
  const nodes = Array.isArray(canvas?.nodes) ? [...canvas.nodes] : [];
  const position = requestedPosition
    && Number.isFinite(requestedPosition.x)
    && Number.isFinite(requestedPosition.y)
    ? { x: Number(requestedPosition.x), y: Number(requestedPosition.y) }
    : { x: 80 + (nodes.length % 4) * 340, y: 100 + Math.floor(nodes.length / 4) * 300 };
  const placeholderNode = {
    id: `job-${job.id}`,
    type: "imageCard",
    position,
    data: { jobId: job.id, status: "submitting", label: prompt.slice(0, 80) },
    style: { width: 300, height: 240 },
  };
  const { error: canvasError } = await context.supabase.rpc("append_canvas_node", {
    p_project_id: projectId,
    p_node: placeholderNode,
  });
  if (canvasError) {
    await context.supabase
      .from("generation_jobs")
      .update({ status: "fail", error_code: "canvas_error", error_message: canvasError.message, completed_at: new Date().toISOString() })
      .eq("id", job.id);
    return apiError("创建画布占位节点失败", 500, canvasError.message);
  }

  try {
    const created = await createKieTask({ model, prompt, config, referenceUrl });
    const { data: updated } = await context.supabase
      .from("generation_jobs")
      .update({
        provider_task_id: created.taskId,
        provider_model: created.providerModel,
        status: "waiting",
        request: { prompt, config, referenceAssetId: referenceAssetId || null, providerModel: created.providerModel, providerInput: created.providerInput },
      })
      .eq("id", job.id)
      .select("id,project_id,conversation_id,user_message_id,model,status,created_at,updated_at")
      .single();
    const titled = safeTitle(prompt);
    await Promise.all([
      context.supabase.from("projects").update({ title: titled }).eq("id", projectId).eq("title", "Untitled"),
      context.supabase.from("conversations").update({ title: titled }).eq("id", conversationId).eq("title", "新对话"),
    ]);
    return NextResponse.json({ job: updated || { ...job, status: "waiting" }, message, node: placeholderNode }, { status: 201 });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "创建生图任务失败";
    const status = error instanceof KieError ? error.status : 502;
    await context.supabase
      .from("generation_jobs")
      .update({ status: "fail", error_code: error instanceof KieError ? String(error.code || status) : String(status), error_message: messageText, completed_at: new Date().toISOString() })
      .eq("id", job.id);
    return apiError(messageText, status >= 400 && status < 600 ? status : 502, { jobId: job.id });
  }
}
