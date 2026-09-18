import "server-only";

import sharp from "sharp";

export const IMAGE_PREVIEW_MAX_SIZE = 1280;
export const IMAGE_PREVIEW_MIME = "image/webp";

export function imagePreviewObjectPath(objectPath: string) {
  return objectPath.replace(/\.[^./]+$/, "") + ".preview.webp";
}

export async function createImagePreview(bytes: Buffer) {
  const { data, info } = await sharp(bytes, { failOn: "error" })
    .rotate()
    .resize({
      width: IMAGE_PREVIEW_MAX_SIZE,
      height: IMAGE_PREVIEW_MAX_SIZE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82, alphaQuality: 90, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  if (!info.width || !info.height) throw new Error("无法读取图片尺寸");

  return {
    bytes: data,
    width: info.width,
    height: info.height,
    size: data.byteLength,
    mimeType: IMAGE_PREVIEW_MIME,
  };
}
