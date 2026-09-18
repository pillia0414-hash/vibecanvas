import { apiError, getRequestContext } from "@/lib/api";
import { previewObjectPath } from "@/lib/assets";

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const REDIRECT_CACHE_SECONDS = 55 * 60;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getRequestContext();
  if (!context) return apiError("请先登录", 401);
  const { id } = await params;
  const { data: asset, error } = await context.supabase
    .from("assets")
    .select("id,bucket,object_path,mime_type,metadata")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return apiError("读取图片失败", 500, error.message);
  if (!asset) return apiError("图片不存在", 404);

  const searchParams = new URL(request.url).searchParams;
  const download = searchParams.get("download") === "1";
  const preview = searchParams.get("preview") === "1";
  const imagePreview = searchParams.get("variant") === "preview";
  const isMarkdown = asset.mime_type === "text/markdown" || asset.mime_type === "text/plain";

  if (preview && isMarkdown) {
    const { data: file, error: downloadError } = await context.supabase.storage
      .from(asset.bucket)
      .download(asset.object_path);
    if (downloadError || !file) return apiError("读取附件失败", 502, downloadError?.message);
    if (file.size > 1024 * 1024) return apiError("Markdown 文件超过预览限制", 413);
    return new Response(await file.text(), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=300",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
        Vary: "Cookie",
      },
    });
  }

  const metadata = (asset.metadata || {}) as Record<string, unknown>;
  const originalName = typeof metadata.originalName === "string" ? metadata.originalName : asset.id;
  const storagePath = !download && imagePreview
    ? previewObjectPath(asset) || asset.object_path
    : asset.object_path;
  const { data, error: signedUrlError } = await context.supabase.storage
    .from(asset.bucket)
    .createSignedUrl(
      storagePath,
      SIGNED_URL_TTL_SECONDS,
      download ? { download: originalName.replace(/[\r\n"]/g, "_") } : undefined,
    );
  if (signedUrlError || !data?.signedUrl) {
    return apiError("读取图片失败", 502, signedUrlError?.message);
  }

  // Keep this stable, authenticated URL as the browser cache key, but let the
  // Storage CDN stream the bytes directly. Buffering the complete original in
  // Next.js made every cache miss wait for two full network hops.
  return new Response(null, {
    status: 307,
    headers: {
      Location: data.signedUrl,
      "Cache-Control": `private, max-age=${REDIRECT_CACHE_SECONDS}, stale-while-revalidate=300`,
      Vary: "Cookie",
    },
  });
}
