import { NextResponse } from "next/server";
import sharp from "sharp";

import { apiError, getRequestContext } from "@/lib/api";
import { ASSET_BUCKET, assetStoragePaths, browserAssetPreviewUrl, browserAssetUrl, extensionForMime, mimeFromResponse } from "@/lib/assets";
import { createImagePreview, imagePreviewObjectPath } from "@/lib/image-preview";
import { getKieTask, KieError, resultUrls } from "@/lib/kie";

const ACTIVE = new Set(["submitting", "waiting", "queuing", "generating", "processing_result"]);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getRequestContext();
  if (!context) return apiError("请先登录", 401);
  const { id } = await params;
  const { data: job, error } = await context.supabase
    .from("generation_jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return apiError("查询任务失败", 500, error.message);
  if (!job) return apiError("任务不存在", 404);

  const manualRefresh = new URL(request.url).searchParams.get("refresh") === "1";
  if (job.status === "success") return completedResponse(context.supabase, job);
  if (job.status === "processing_result") {
    if (Date.now() - new Date(job.updated_at).getTime() < 2 * 60_000) return NextResponse.json({ job });
    const { data: partialAssets } = await context.supabase
      .from("assets")
      .select("id,bucket,object_path,metadata")
      .eq("project_id", job.project_id)
      .contains("metadata", { jobId: job.id })
      .is("deleted_at", null);
    if (partialAssets?.length) {
      await context.supabase
        .from("assets")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", partialAssets.map((asset) => asset.id));
      for (const asset of partialAssets) {
        await context.supabase.storage.from(asset.bucket).remove(assetStoragePaths(asset));
      }
    }
    const { data: failed } = await context.supabase
      .from("generation_jobs")
      .update({ status: "fail", error_code: "processing_timeout", error_message: "生成结果转存超时，请重新生成", completed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "processing_result")
      .select("*")
      .single();
    return NextResponse.json({ job: failed });
  }
  if (!ACTIVE.has(job.status) && !(manualRefresh && job.status === "timeout")) return NextResponse.json({ job });
  if (!job.provider_task_id) return NextResponse.json({ job });

  if (!manualRefresh && Date.now() - new Date(job.created_at).getTime() > 15 * 60_000) {
    const { data: timedOut } = await context.supabase
      .from("generation_jobs")
      .update({ status: "timeout", error_message: "任务等待已超过 15 分钟，可手动重新查询或重新生成", completed_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    return NextResponse.json({ job: timedOut });
  }

  try {
    const remote = await getKieTask(job.provider_task_id);
    if (["waiting", "queuing", "generating"].includes(remote.state)) {
      const { data: updated } = await context.supabase
        .from("generation_jobs")
        .update({ status: remote.state })
        .eq("id", id)
        .select("*")
        .single();
      return NextResponse.json({ job: updated });
    }
    if (remote.state === "fail") {
      const { data: failed } = await context.supabase
        .from("generation_jobs")
        .update({
          status: "fail",
          error_code: remote.failCode || null,
          error_message: remote.failMsg || "图片生成失败",
          completed_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .single();
      return NextResponse.json({ job: failed });
    }
    if (remote.state !== "success") return NextResponse.json({ job });

    const urls = resultUrls(remote.resultJson);
    if (!urls.length) throw new Error("生成任务完成，但没有返回图片地址");
    const { data: claimed } = await context.supabase
      .from("generation_jobs")
      .update({ status: "processing_result" })
      .eq("id", id)
      .in("status", ["waiting", "queuing", "generating", "timeout"])
      .select("id")
      .maybeSingle();
    if (!claimed) {
      const { data: current } = await context.supabase.from("generation_jobs").select("*").eq("id", id).single();
      return NextResponse.json({ job: current });
    }
    const assets = [];
    for (const [index, url] of urls.entries()) {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`下载第 ${index + 1} 张生成图片失败`);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("生成图片超过 Storage 10MB 限制");
      const mime = mimeFromResponse(response.headers.get("content-type"), url);
      const imageBytes = Buffer.from(bytes);
      const imageMetadata = await sharp(imageBytes, { failOn: "error" }).metadata();
      if (!imageMetadata.width || !imageMetadata.height) throw new Error("无法读取生成图片尺寸");
      const swapsAxes = [5, 6, 7, 8].includes(imageMetadata.orientation || 1);
      const width = swapsAxes ? imageMetadata.height : imageMetadata.width;
      const height = swapsAxes ? imageMetadata.width : imageMetadata.height;
      const preview = await createImagePreview(imageBytes);
      const assetId = crypto.randomUUID();
      const objectPath = `${job.user_id}/${job.project_id}/${assetId}.${extensionForMime(mime)}`;
      const previewPath = imagePreviewObjectPath(objectPath);
      const { error: uploadError } = await context.supabase.storage
        .from(ASSET_BUCKET)
        .upload(objectPath, bytes, { contentType: mime, cacheControl: "31536000", upsert: false });
      if (uploadError) throw new Error(`转存生成图片失败：${uploadError.message}`);
      const { error: previewUploadError } = await context.supabase.storage
        .from(ASSET_BUCKET)
        .upload(previewPath, preview.bytes, { contentType: preview.mimeType, cacheControl: "31536000", upsert: false });
      if (previewUploadError) {
        await context.supabase.storage.from(ASSET_BUCKET).remove([objectPath]);
        throw new Error(`保存图片预览失败：${previewUploadError.message}`);
      }
      const { data: asset, error: assetError } = await context.supabase
        .from("assets")
        .insert({
          id: assetId,
          project_id: job.project_id,
          user_id: job.user_id,
          kind: "generated",
          bucket: ASSET_BUCKET,
          object_path: objectPath,
          mime_type: mime,
          width,
          height,
          metadata: {
            source: "kie",
            jobId: job.id,
            resultIndex: index,
            size: bytes.byteLength,
            previewObjectPath: previewPath,
            previewMimeType: preview.mimeType,
            previewSize: preview.size,
            previewWidth: preview.width,
            previewHeight: preview.height,
          },
        })
        .select("id,project_id,kind,bucket,object_path,mime_type,width,height,metadata,created_at")
        .single();
      if (assetError || !asset) {
        await context.supabase.storage.from(ASSET_BUCKET).remove([objectPath, previewPath]);
        throw new Error(`保存生成图片失败：${assetError?.message || "未知错误"}`);
      }
      assets.push(asset);
    }

    const requestData = (job.request || {}) as Record<string, unknown>;
    const { data: assistant, error: assistantError } = await context.supabase
      .from("messages")
      .insert({
        conversation_id: job.conversation_id,
        project_id: job.project_id,
        user_id: job.user_id,
        role: "assistant",
        content: "图片已生成",
        mode: job.source === "agent" ? "agent" : "image",
        status: "completed",
        model: job.model,
        config: requestData.config || {},
        metadata: { jobId: job.id, ...(job.agent_run_id ? { runId: job.agent_run_id } : {}) },
      })
      .select("id")
      .single();
    if (assistantError || !assistant) throw new Error(`保存生成结果消息失败：${assistantError?.message || "未知错误"}`);
    await context.supabase.from("message_assets").insert(
      assets.map((asset, position) => ({ message_id: assistant.id, asset_id: asset.id, position, relation_type: "output" })),
    );
    await context.supabase.from("generation_job_assets").insert(
      assets.map((asset, position) => ({ job_id: job.id, asset_id: asset.id, position, role: "output" })),
    );

    const { data: canvas } = await context.supabase
      .from("canvas_documents")
      .select("nodes")
      .eq("project_id", job.project_id)
      .maybeSingle();
    const rawNodes = Array.isArray(canvas?.nodes) ? canvas.nodes : [];
    const placeholderIndex = rawNodes.findIndex((node) => (node as { id?: string }).id === `job-${job.id}`);
    const placeholder = placeholderIndex >= 0 ? (rawNodes[placeholderIndex] as Record<string, unknown>) : undefined;
    const position = (placeholder?.position as { x: number; y: number } | undefined) || { x: 100, y: 100 };
    const replacement = assets.map((asset, index) => {
      const width = asset.width || 1024;
      const height = asset.height || 1024;
      const scale = Math.min(1, 320 / Math.max(width, height));
      const displayWidth = Math.max(1, Math.round(width * scale));
      const displayHeight = Math.max(1, Math.round(height * scale));
      return {
        id: `asset-${asset.id}`,
        type: "imageCard",
        position: { x: position.x + index * (displayWidth + 30), y: position.y },
        data: { assetId: asset.id, jobId: job.id, status: "success" },
        style: { width: displayWidth, height: displayHeight },
      };
    });
    const { error: canvasError } = await context.supabase.rpc("replace_canvas_job_node", {
      p_project_id: job.project_id,
      p_job_id: job.id,
      p_nodes: replacement,
    });
    if (canvasError) throw new Error(`更新画布失败：${canvasError.message}`);
    await context.supabase
      .from("projects")
      .update({ cover_asset_id: assets[0].id })
      .eq("id", job.project_id);
    const { data: completed } = await context.supabase
      .from("generation_jobs")
      .update({
        status: "success",
        result: { assetIds: assets.map((asset) => asset.id) },
        completed_at: new Date().toISOString(),
        error_code: null,
        error_message: null,
      })
      .eq("id", job.id)
      .select("*")
      .single();
    const hydrated = assets.map((asset) => ({
      ...asset,
      url: browserAssetUrl(asset.id),
      previewUrl: browserAssetPreviewUrl(asset.id),
      downloadUrl: `${browserAssetUrl(asset.id)}?download=1`,
    }));
    return NextResponse.json({ job: completed, assets: hydrated });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "处理生成结果失败";
    const status = caught instanceof KieError ? caught.status : 502;
    const { data: failed } = await context.supabase
      .from("generation_jobs")
      .update({
        status: "fail",
        error_code: caught instanceof KieError ? String(caught.code || status) : "processing_error",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    return NextResponse.json({ job: failed }, { status: status >= 400 && status < 600 ? status : 502 });
  }
}

async function completedResponse(supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>, job: Record<string, unknown>) {
  const result = (job.result || {}) as { assetIds?: string[] };
  const ids = Array.isArray(result.assetIds) ? result.assetIds : [];
  const { data } = ids.length
    ? await supabase
        .from("assets")
        .select("id,project_id,kind,bucket,object_path,mime_type,width,height,metadata,created_at")
        .in("id", ids)
        .is("deleted_at", null)
    : { data: [] };
  return NextResponse.json({
    job,
    assets: (data || []).map((asset) => ({
      ...asset,
      url: browserAssetUrl(asset.id),
      previewUrl: browserAssetPreviewUrl(asset.id),
      downloadUrl: `${browserAssetUrl(asset.id)}?download=1`,
    })),
  });
}
