import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: assets, error } = await supabase
  .from("assets")
  .select("id,bucket,object_path,mime_type,width,height,metadata")
  .is("deleted_at", null)
  .in("mime_type", ["image/jpeg", "image/png", "image/webp"]);

if (error) throw error;

let updated = 0;
for (const asset of assets || []) {
  const metadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {};
  if (metadata.previewObjectPath && asset.width && asset.height) continue;

  const { data: original, error: downloadError } = await supabase.storage
    .from(asset.bucket)
    .download(asset.object_path);
  if (downloadError || !original) {
    throw new Error(`下载素材 ${asset.id} 失败：${downloadError?.message || "未知错误"}`);
  }

  const bytes = Buffer.from(await original.arrayBuffer());
  const source = await sharp(bytes, { failOn: "error" }).metadata();
  if (!source.width || !source.height) throw new Error(`无法读取素材 ${asset.id} 的尺寸`);
  const swapsAxes = [5, 6, 7, 8].includes(source.orientation || 1);
  const width = swapsAxes ? source.height : source.width;
  const height = swapsAxes ? source.width : source.height;
  const { data: previewBytes, info } = await sharp(bytes, { failOn: "error" })
    .rotate()
    .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, alphaQuality: 90, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  const previewObjectPath = asset.object_path.replace(/\.[^./]+$/, "") + ".preview.webp";
  const { error: uploadError } = await supabase.storage
    .from(asset.bucket)
    .upload(previewObjectPath, previewBytes, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: true,
    });
  if (uploadError) throw new Error(`上传素材 ${asset.id} 的预览失败：${uploadError.message}`);

  const { error: updateError } = await supabase
    .from("assets")
    .update({
      width,
      height,
      metadata: {
        ...metadata,
        previewObjectPath,
        previewMimeType: "image/webp",
        previewSize: previewBytes.byteLength,
        previewWidth: info.width,
        previewHeight: info.height,
      },
    })
    .eq("id", asset.id);
  if (updateError) throw new Error(`更新素材 ${asset.id} 失败：${updateError.message}`);

  updated += 1;
  console.log(`已更新素材 ${asset.id}：${bytes.byteLength}B -> ${previewBytes.byteLength}B`);
}

console.log(`预览图回填完成，共更新 ${updated} 个素材。`);
