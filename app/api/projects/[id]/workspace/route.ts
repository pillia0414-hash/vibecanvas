import { NextResponse } from "next/server";

import { apiError, getRequestContext } from "@/lib/api";
import { loadProjectWorkspace, WorkspaceLoadError } from "@/lib/workspace";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getRequestContext();
  if (!context) return apiError("请先登录", 401);
  const { id } = await params;

  try {
    return NextResponse.json(await loadProjectWorkspace(context.supabase, id));
  } catch (caught) {
    if (caught instanceof WorkspaceLoadError) {
      return apiError(caught.message, caught.status, caught.details);
    }
    throw caught;
  }
}
