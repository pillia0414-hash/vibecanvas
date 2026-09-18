import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

import { apiError, getRequestContext } from "@/lib/api";
import { ASSET_BUCKET, browserAssetUrl, extensionForMime, isImageMime } from "@/lib/assets";
import { createImagePreview, imagePreviewObjectPath } from "@/lib/image-preview";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_MARKDOWN_SIZE = 1024 * 1024;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getRequestContext();
  if (!context) return apiError("请先登录", 401);
  const { id: projectId } = await params;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return apiError("请选择附件");

  const markdown = file.name.toLowerCase().endsWith(".md")
    && ["", "text/plain", "text/markdown", "text/x-markdown"].includes(file.type);
  const mimeType = markdown ? "text/markdown" : file.type;
  if (!markdown && !ALLOWED_TYPES.has(mimeType)) {
    return apiError("仅支持 JPEG、PNG、WebP 图片或 Markdown 文件");
  }
  if (file.size > (markdown ? MAX_MARKDOWN_SIZE : MAX_FILE_SIZE)) {
    return apiError(markdown ? "Markdown 文件不能超过 1MB" : "图片不能超过 10MB");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  let width: number | null = null;
  let height: number | null = null;
  let preview: Awaited<ReturnType<typeof createImagePreview>> | null = null;
  if (markdown) {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (text.includes("\0")) return apiError("Markdown 文件内容无效");
    } catch {
      return apiError("Markdown 文件必须使用 UTF-8 编码");
    }
  } else {
    try {
      const metadata = await sharp(bytes, { failOn: "error" }).metadata();
      if (!metadata.width || !metadata.height || !["jpeg", "png", "webp"].includes(metadata.format || "")) {
        return apiError("图片文件内容无效");
      }
      const swapsAxes = [5, 6, 7, 8].includes(metadata.orientation || 1);
      width = swapsAxes ? metadata.height : metadata.width;
      height = swapsAxes ? metadata.width : metadata.height;
      preview = await createImagePreview(bytes);
    } catch {
      return apiError("无法读取图片，请确认文件未损坏");
    }
  }

  const { data: project } = await context.supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) return apiError("项目不存在", 404);

  const assetId = crypto.randomUUID();
  const objectPath = `${context.userId}/${projectId}/${assetId}.${extensionForMime(mimeType)}`;
  const previewPath = preview ? imagePreviewObjectPath(objectPath) : null;
  const { error: uploadError } = await context.supabase.storage
    .from(ASSET_BUCKET)
    .upload(objectPath, bytes, { contentType: mimeType, cacheControl: "31536000", upsert: false });
  if (uploadError) return apiError("上传附件失败", 500, uploadError.message);
  if (preview && previewPath) {
    const { error: previewUploadError } = await context.supabase.storage
      .from(ASSET_BUCKET)
      .upload(previewPath, preview.bytes, { contentType: preview.mimeType, cacheControl: "31536000", upsert: false });
    if (previewUploadError) {
      await context.supabase.storage.from(ASSET_BUCKET).remove([objectPath]);
      return apiError("创建图片预览失败", 500, previewUploadError.message);
    }
  }

  const { data: asset, error: assetError } = await context.supabase
    .from("assets")
    .insert({
      id: assetId,
      project_id: projectId,
      user_id: context.userId,
      kind: "upload",
      bucket: ASSET_BUCKET,
      object_path: objectPath,
      mime_type: mimeType,
      width,
      height,
      metadata: {
        originalName: file.name,
        size: file.size,
        ...(preview && previewPath ? {
          previewObjectPath: previewPath,
          previewMimeType: preview.mimeType,
          previewSize: preview.size,
          previewWidth: preview.width,
          previewHeight: preview.height,
        } : {}),
      },
    })
    .select("id,project_id,kind,bucket,object_path,mime_type,width,height,metadata,created_at")
    .single();
  if (assetError || !asset) {
    await context.supabase.storage.from(ASSET_BUCKET).remove([objectPath, ...(previewPath ? [previewPath] : [])]);
    return apiError("保存图片信息失败", 500, assetError?.message);
  }

  let node: Record<string, unknown> | undefined;
  if (isImageMime(mimeType) && width && height) {
    const requestedX = Number(form?.get("x"));
    const requestedY = Number(form?.get("y"));
    const scale = Math.min(1, 320 / Math.max(width, height));
    const displayWidth = Math.max(1, Math.round(width * scale));
    const displayHeight = Math.max(1, Math.round(height * scale));
    node = {
      id: `asset-${asset.id}`,
      type: "imageCard",
      position: {
        x: Number.isFinite(requestedX) ? requestedX : 100,
        y: Number.isFinite(requestedY) ? requestedY : 100,
      },
      data: { assetId: asset.id, status: "success" },
      style: { width: displayWidth, height: displayHeight },
    };
    const { error: canvasError } = await context.supabase.rpc("append_canvas_node", {
      p_project_id: projectId,
      p_node: node,
    });
    if (canvasError) {
      await Promise.all([
        context.supabase.from("assets").delete().eq("id", asset.id),
        context.supabase.storage.from(ASSET_BUCKET).remove([objectPath, ...(previewPath ? [previewPath] : [])]),
      ]);
      return apiError("将图片加入画布失败", 500, canvasError.message);
    }
  }

  const url = browserAssetUrl(asset.id);
  return NextResponse.json({
    asset: {
      ...asset,
      url,
      previewUrl: markdown ? `${url}?preview=1` : `${url}?variant=preview`,
      downloadUrl: `${url}?download=1`,
    },
    node,
  }, { status: 201 });
}
