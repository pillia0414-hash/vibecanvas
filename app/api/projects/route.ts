import { NextRequest, NextResponse } from "next/server";

import { apiError, getRequestContext } from "@/lib/api";
import { addSignedPreviewUrls, browserAssetPreviewUrl } from "@/lib/assets";

export async function GET(request: NextRequest) {
  const context = await getRequestContext();
  if (!context) return apiError("请先登录", 401);

  const offset = Math.max(0, Number(request.nextUrl.searchParams.get("offset")) || 0);
  const limit = Math.min(24, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 24));
  const { data: projects, error } = await context.supabase
    .from("projects")
    .select("id,title,cover_asset_id,created_at,updated_at")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return apiError("加载项目失败", 500, error.message);
  const coverIds = projects.map((item) => item.cover_asset_id).filter(Boolean) as string[];
  const { data: covers } = coverIds.length
    ? await context.supabase
        .from("assets")
        .select("id,bucket,object_path,metadata")
        .in("id", coverIds)
        .is("deleted_at", null)
    : { data: [] };
  const signedCovers = await addSignedPreviewUrls(context.supabase, covers || []);
  const urlById = new Map(signedCovers.map((asset) => [
    asset.id,
    asset.previewUrl || browserAssetPreviewUrl(asset.id),
  ]));

  return NextResponse.json({
    projects: projects.map((project) => ({
      ...project,
      coverUrl: project.cover_asset_id ? urlById.get(project.cover_asset_id) : undefined,
    })),
    hasMore: projects.length === limit,
  });
}

export async function POST(request: NextRequest) {
  const context = await getRequestContext();
  if (!context) return apiError("请先登录", 401);
  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : "Untitled";

  const { data: project, error } = await context.supabase
    .from("projects")
    .insert({ user_id: context.userId, title })
    .select("id,title,cover_asset_id,created_at,updated_at")
    .single();
  if (error || !project) return apiError("创建项目失败", 500, error?.message);

  const [{ data: conversation, error: conversationError }, { error: canvasError }] = await Promise.all([
    context.supabase
      .from("conversations")
      .insert({ project_id: project.id, user_id: context.userId, title: "新对话" })
      .select("id,title,created_at,updated_at")
      .single(),
    context.supabase.from("canvas_documents").insert({
      project_id: project.id,
      user_id: context.userId,
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    }),
  ]);
  if (conversationError || canvasError || !conversation) {
    await context.supabase.from("projects").delete().eq("id", project.id);
    return apiError("初始化项目失败", 500, conversationError?.message || canvasError?.message);
  }

  return NextResponse.json({ project, conversation }, { status: 201 });
}
