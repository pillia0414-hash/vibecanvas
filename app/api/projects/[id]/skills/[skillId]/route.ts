import { NextRequest, NextResponse } from "next/server";

import { apiError, getRequestContext } from "@/lib/api";
import { assetStoragePaths } from "@/lib/assets";
import { isBuiltinSkillId, isSkillMetadata } from "@/lib/skills";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; skillId: string }> }) {
  const context = await getRequestContext();
  if (!context) return apiError("请先登录", 401);
  const { id: projectId, skillId } = await params;
  if (!skillId) return apiError("缺少技能参数");
  if (isBuiltinSkillId(skillId)) return apiError("内置技能不能删除，上传同名 SKILL.md 可覆盖", 400);

  const { data: asset, error } = await context.supabase
    .from("assets")
    .select("id,bucket,object_path,project_id,metadata")
    .eq("id", skillId)
    .eq("project_id", projectId)
    .eq("user_id", context.userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return apiError("删除技能失败", 500, error.message);
  if (!asset || !isSkillMetadata(asset.metadata)) return apiError("技能不存在", 404);

  const { error: deleteError } = await context.supabase
    .from("assets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", asset.id)
    .is("deleted_at", null);
  if (deleteError) return apiError("删除技能失败", 500, deleteError.message);
  await context.supabase.storage.from(asset.bucket).remove(assetStoragePaths(asset));
  return NextResponse.json({ ok: true });
}
