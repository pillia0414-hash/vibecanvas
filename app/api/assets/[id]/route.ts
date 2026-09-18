import { NextResponse } from "next/server";

import { apiError, getRequestContext } from "@/lib/api";
import { assetStoragePaths } from "@/lib/assets";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getRequestContext();
  if (!context) return apiError("请先登录", 401);
  const { id } = await params;
  const { data: asset, error } = await context.supabase
    .from("assets")
    .select("id,bucket,object_path,project_id,metadata")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return apiError("删除图片失败", 500, error.message);
  if (!asset) return apiError("图片不存在", 404);
  const { error: canvasError } = await context.supabase.rpc("remove_canvas_asset_nodes", {
    p_project_id: asset.project_id,
    p_asset_id: asset.id,
  });
  if (canvasError) return apiError("从画布移除图片失败", 500, canvasError.message);
  const { error: deleteError } = await context.supabase
    .from("assets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);
  if (deleteError) return apiError("删除图片失败", 500, deleteError.message);
  await context.supabase.storage.from(asset.bucket).remove(assetStoragePaths(asset));
  if (asset.project_id) {
    await context.supabase
      .from("projects")
      .update({ cover_asset_id: null })
      .eq("id", asset.project_id)
      .eq("cover_asset_id", id);
  }
  return NextResponse.json({ ok: true });
}
