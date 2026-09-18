import { notFound } from "next/navigation";

import { CanvasWorkspace } from "@/components/canvas/canvas-workspace";
import type { WorkspaceData } from "@/lib/app-types";
import { createClient } from "@/lib/supabase/server";
import { loadProjectWorkspace, WorkspaceLoadError } from "@/lib/workspace";

export const instant = false;

export default async function CanvasPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const { projectId } = await searchParams;
  if (!projectId) notFound();
  const supabase = await createClient();
  let workspace: Awaited<ReturnType<typeof loadProjectWorkspace>>;
  try {
    workspace = await loadProjectWorkspace(supabase, projectId);
  } catch (caught) {
    if (caught instanceof WorkspaceLoadError && caught.status === 404) notFound();
    throw caught;
  }
  return (
    <CanvasWorkspace
      key={workspace.project.id}
      projectId={workspace.project.id}
      initialTitle={workspace.project.title}
      initialWorkspace={workspace as WorkspaceData}
    />
  );
}
