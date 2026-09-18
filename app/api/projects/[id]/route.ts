import { NextRequest, NextResponse } from "next/server";

import { apiError, getRequestContext } from "@/lib/api";
import { assetStoragePaths } from "@/lib/assets";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  const context = await getRequestContext();
  if (!context) return apiError("请先登录", 401);
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  if (!title) return apiError("项目名称不能为空");

  const { data, error } = await context.supabase
    .from("projects")
    .update({ title })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id,title,updated_at")
    .maybeSingle();
  if (error) return apiError("重命名失败", 500, error.message);
  if (!data) return apiError("项目不存在", 404);
  return NextResponse.json({ project: data });
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  const context = await getRequestContext();
  if (!context) return apiError("请先登录", 401);
  const { id } = await params;
  const { data: assets } = await context.supabase
    .from("assets")
    .select("bucket,object_path,metadata")
    .eq("project_id", id)
    .is("deleted_at", null);
  const { data, error } = await context.supabase
    .from("projects")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) return apiError("删除项目失败", 500, error.message);
  if (!data) return apiError("项目不存在", 404);

  if (assets?.length) {
    const byBucket = new Map<string, typeof assets>();
    for (const asset of assets) {
      const bucketAssets = byBucket.get(asset.bucket) || [];
      bucketAssets.push(asset);
      byBucket.set(asset.bucket, bucketAssets);
    }
    await Promise.all(
      Array.from(byBucket.entries()).map(([bucket, rows]) =>
        context.supabase.storage.from(bucket).remove(rows.flatMap(assetStoragePaths)),
      ),
    );
  }
  return NextResponse.json({ ok: true });
}
