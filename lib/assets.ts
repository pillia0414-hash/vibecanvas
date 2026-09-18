import type { SupabaseClient } from "@supabase/supabase-js";

import type { AssetRecord } from "@/lib/app-types";

export const ASSET_BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET || "project-assets";

export function browserAssetUrl(assetId: string) {
  return `/api/assets/${assetId}/content`;
}

export function browserAssetPreviewUrl(assetId: string) {
  return `${browserAssetUrl(assetId)}?variant=preview`;
}

export function previewObjectPath(asset: { metadata?: unknown }) {
  const metadata = (asset.metadata || {}) as Record<string, unknown>;
  return typeof metadata.previewObjectPath === "string" && metadata.previewObjectPath
    ? metadata.previewObjectPath
    : undefined;
}

export function assetStoragePaths(asset: { object_path: string; metadata?: unknown }) {
  const previewPath = previewObjectPath(asset);
  return previewPath && previewPath !== asset.object_path
    ? [asset.object_path, previewPath]
    : [asset.object_path];
}

type PreviewAsset = Pick<AssetRecord, "id" | "bucket" | "object_path"> & {
  metadata?: unknown;
};

const signedPreviewCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Signs all previews in one Storage request per bucket and reuses the exact
 * signed URL while it is valid. Supabase treats every signed token as a
 * separate CDN cache key, so producing a new token on every page visit defeats
 * CDN caching even when the underlying object never changes.
 */
export async function addSignedPreviewUrls<T extends PreviewAsset>(
  supabase: SupabaseClient,
  assets: T[],
  expiresIn = 3600,
) {
  const now = Date.now();
  for (const [key, entry] of signedPreviewCache) {
    if (entry.expiresAt <= now) signedPreviewCache.delete(key);
  }

  const resolved = new Map<string, string>();
  const missingByBucket = new Map<string, Array<{ key: string; path: string }>>();

  for (const asset of assets) {
    const path = previewObjectPath(asset) || asset.object_path;
    const key = `${asset.bucket}:${path}`;
    const cached = signedPreviewCache.get(key);
    if (cached && cached.expiresAt > now) {
      resolved.set(asset.id, cached.url);
      continue;
    }
    const entries = missingByBucket.get(asset.bucket) || [];
    if (!entries.some((entry) => entry.key === key)) entries.push({ key, path });
    missingByBucket.set(asset.bucket, entries);
  }

  await Promise.all([...missingByBucket.entries()].map(async ([bucket, entries]) => {
    const { data } = await supabase.storage
      .from(bucket)
      .createSignedUrls(entries.map((entry) => entry.path), expiresIn);
    for (const [index, signed] of (data || []).entries()) {
      const entry = entries[index];
      if (!entry || !signed.signedUrl) continue;
      signedPreviewCache.set(entry.key, {
        url: signed.signedUrl,
        // Refresh before token expiry; this also avoids returning a URL whose
        // remaining lifetime is too short during a slow navigation.
        expiresAt: now + Math.max(30, expiresIn - 300) * 1000,
      });
    }
  }));

  for (const asset of assets) {
    const path = previewObjectPath(asset) || asset.object_path;
    const cached = signedPreviewCache.get(`${asset.bucket}:${path}`);
    if (cached) resolved.set(asset.id, cached.url);
  }

  return assets.map((asset) => ({
    ...asset,
    previewUrl: resolved.get(asset.id) || browserAssetPreviewUrl(asset.id),
  }));
}

export async function addSignedUrls<T extends Pick<AssetRecord, "id" | "bucket" | "object_path">>(
  supabase: SupabaseClient,
  assets: T[],
  expiresIn = 3600,
) {
  const hydrated = await Promise.all(
    assets.map(async (asset) => {
      const { data } = await supabase.storage
        .from(asset.bucket)
        .createSignedUrl(asset.object_path, expiresIn);
      return { ...asset, url: data?.signedUrl };
    }),
  );
  return hydrated;
}

export function extensionForMime(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "text/markdown" || mime === "text/plain") return "md";
  return "jpg";
}

export function isImageMime(mime: string) {
  return mime === "image/jpeg" || mime === "image/png" || mime === "image/webp";
}

export function mimeFromResponse(contentType: string | null, url: string) {
  if (contentType?.includes("png") || /\.png(?:\?|$)/i.test(url)) return "image/png";
  if (contentType?.includes("webp") || /\.webp(?:\?|$)/i.test(url)) return "image/webp";
  return "image/jpeg";
}
