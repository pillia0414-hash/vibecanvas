import { NextRequest, NextResponse } from "next/server";

import { apiError, getRequestContext } from "@/lib/api";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getRequestContext();
  if (!context) return apiError("请先登录", 401);
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : "新对话";
  const { data: project } = await context.supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) return apiError("项目不存在", 404);
  const { data, error } = await context.supabase
    .from("conversations")
    .insert({ project_id: id, user_id: context.userId, title })
    .select("id,project_id,title,created_at,updated_at")
    .single();
  if (error) return apiError("创建对话失败", error.code === "23503" ? 404 : 500, error.message);
  return NextResponse.json({ conversation: data }, { status: 201 });
}
