import { NextRequest, NextResponse } from "next/server";

import { apiError, getRequestContext } from "@/lib/api";
import { ASSET_BUCKET } from "@/lib/assets";
import {
  isSafeSkillName,
  isSkillMarkdownFileName,
  isSkillMetadata,
  MAX_SKILL_SOURCE_BYTES,
  parseSkillMarkdown,
  skillSummaryFromAsset,
  SkillParseError,
} from "@/lib/skills";
import { withBuiltinSkills } from "@/lib/skills-server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getRequestContext();
  if (!context) return apiError("请先登录", 401);
  const { id: projectId } = await params;
  const { data: project } = await context.supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) return apiError("项目不存在", 404);

  const { data, error } = await context.supabase
    .from("assets")
    .select("id,project_id,metadata,created_at")
    .eq("project_id", projectId)
    .eq("user_id", context.userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) return apiError("读取技能失败", 500, error.message);
  const projectSkills = (data || [])
    .map(skillSummaryFromAsset)
    .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill));
  return NextResponse.json({ skills: await withBuiltinSkills(projectId, projectSkills) });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getRequestContext();
  if (!context) return apiError("请先登录", 401);
  const { id: projectId } = await params;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return apiError("请选择 SKILL.md 文件");
  if (!isSkillMarkdownFileName(file.name)) return apiError("请上传标准 SKILL.md 文件");
  if (file.size > MAX_SKILL_SOURCE_BYTES) return apiError("SKILL.md 不能超过 100KB");

  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    return apiError("SKILL.md 必须使用 UTF-8 编码");
  }
  if (source.includes("\0")) return apiError("SKILL.md 内容无效");

  let parsed;
  try {
    parsed = parseSkillMarkdown(source);
  } catch (error) {
    return apiError(error instanceof SkillParseError ? error.message : "无法解析 SKILL.md");
  }
  if (!isSafeSkillName(parsed.name)) return apiError("技能名无效");

  const { data: project } = await context.supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) return apiError("项目不存在", 404);

  const { data: assetRows, error: listError } = await context.supabase
    .from("assets")
    .select("id,project_id,bucket,object_path,metadata,created_at")
    .eq("project_id", projectId)
    .eq("user_id", context.userId)
    .is("deleted_at", null);
  if (listError) return apiError("读取技能失败", 500, listError.message);
  const skillAssets = (assetRows || []).filter((asset) => isSkillMetadata(asset.metadata));
  const existing = skillAssets.find((asset) => (asset.metadata as { skillName?: string }).skillName === parsed.name);
  if (!existing && skillAssets.length >= 50) return apiError("每个项目最多保存 50 个技能");

  const bytes = Buffer.from(parsed.source, "utf8");
  const objectPath = `${context.userId}/${projectId}/skills/${parsed.name}/SKILL.md`;
  const { error: uploadError } = await context.supabase.storage
    .from(ASSET_BUCKET)
    .upload(objectPath, bytes, { contentType: "text/markdown", cacheControl: "0", upsert: true });
  if (uploadError) return apiError("上传技能失败", 500, uploadError.message);

  const metadata = {
    skill: true,
    skillName: parsed.name,
    description: parsed.description,
    originalName: "SKILL.md",
    size: bytes.length,
  };

  const saved = existing
    ? await context.supabase
        .from("assets")
        .update({ object_path: objectPath, mime_type: "text/markdown", metadata })
        .eq("id", existing.id)
        .select("id,project_id,metadata,created_at")
        .single()
    : await context.supabase
        .from("assets")
        .insert({
          project_id: projectId,
          user_id: context.userId,
          kind: "upload",
          bucket: ASSET_BUCKET,
          object_path: objectPath,
          mime_type: "text/markdown",
          width: null,
          height: null,
          metadata,
        })
        .select("id,project_id,metadata,created_at")
        .single();
  if (saved.error || !saved.data) {
    if (!existing) await context.supabase.storage.from(ASSET_BUCKET).remove([objectPath]);
    return apiError("保存技能失败", 500, saved.error?.message);
  }
  const skill = skillSummaryFromAsset(saved.data);
  if (!skill) return apiError("保存技能失败", 500);
  return NextResponse.json({ skill }, { status: existing ? 200 : 201 });
}
