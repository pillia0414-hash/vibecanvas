import { NextRequest, NextResponse } from "next/server";

import { apiError, getRequestContext } from "@/lib/api";
import { reconcileGeneratedNodes } from "@/lib/canvas";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getRequestContext();
  if (!context) return apiError("请先登录", 401);
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.nodes) || !Array.isArray(body.edges)) return apiError("画布数据无效");
  const baseRevision = Number(body.baseRevision);
  if (!Number.isInteger(baseRevision) || baseRevision < 0) return apiError("画布版本无效");
  const viewport = body.viewport;
  if (!viewport || ![viewport.x, viewport.y, viewport.zoom].every(Number.isFinite)) return apiError("画布视口无效");

  const sanitizedNodes = body.nodes.slice(0, 500).map((node: Record<string, unknown>) => {
    const data = (node.data || {}) as Record<string, unknown>;
    const persistedData = { ...data };
    delete persistedData.imageUrl;
    return { ...node, data: persistedData };
  });
  const jobIds = sanitizedNodes
    .map((node: Record<string, unknown>) => ((node.data || {}) as Record<string, unknown>).jobId)
    .filter((jobId: unknown): jobId is string => typeof jobId === "string");
  const [{ data: jobs }, { data: assets }] = await Promise.all([
    jobIds.length
      ? context.supabase
          .from("generation_jobs")
          .select("id,status,result")
          .eq("project_id", id)
          .in("id", jobIds)
      : Promise.resolve({ data: [] }),
    context.supabase
      .from("assets")
      .select("id")
      .eq("project_id", id)
      .is("deleted_at", null),
  ]);
  const reconciledNodes = reconcileGeneratedNodes(
    sanitizedNodes,
    (jobs || []) as Array<{ id: string; status: "submitting" | "waiting" | "queuing" | "generating" | "processing_result" | "success" | "fail" | "timeout"; result?: { assetIds?: string[] } }>,
    assets || [],
  );
  const { data, error } = await context.supabase.rpc("save_canvas_document", {
    p_project_id: id,
    p_base_revision: baseRevision,
    p_nodes: reconciledNodes,
    p_edges: body.edges.slice(0, 500),
    p_viewport: viewport,
  });
  if (error) return apiError("保存画布失败", error.code === "23503" ? 404 : 500, error.message);
  const result = Array.isArray(data) ? data[0] : undefined;
  if (!result) return apiError("画布不存在", 404);
  if (!result.saved) {
    return NextResponse.json({
      error: "画布已在其他操作中更新",
      code: "revision_conflict",
      canvas: { nodes: result.nodes, edges: result.edges, viewport: result.viewport, revision: result.revision },
    }, { status: 409 });
  }
  await context.supabase.from("projects").update({ updated_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ok: true, revision: result.revision });
}
