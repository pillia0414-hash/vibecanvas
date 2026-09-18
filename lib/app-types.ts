export type GenerationModel = "gpt-image-2" | "nano-banana-2";

export type JobStatus =
  | "submitting"
  | "waiting"
  | "queuing"
  | "generating"
  | "processing_result"
  | "success"
  | "fail"
  | "timeout";

export interface GenerationConfig {
  resolution: "1K" | "2K" | "4K";
  aspectRatio: string;
  background?: "auto" | "transparent" | "opaque";
  outputFormat?: "jpg" | "png";
}

export interface AssetRecord {
  id: string;
  project_id: string;
  kind: "upload" | "generated";
  bucket: string;
  object_path: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  url?: string;
  previewUrl?: string;
  downloadUrl?: string;
  fileName?: string;
  size?: number | null;
  relationType?: "attachment" | "reference" | "output";
  position?: number;
}

export interface ProjectSummary {
  id: string;
  title: string;
  cover_asset_id: string | null;
  created_at: string;
  updated_at: string;
  coverUrl?: string;
}

export interface CanvasNodeData extends Record<string, unknown> {
  assetId?: string;
  imageUrl?: string;
  jobId?: string;
  status?: JobStatus;
  label?: string;
}

export interface ProjectSkillSummary {
  id: string;
  project_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  builtin?: boolean;
}

export interface WorkspaceData {
  project: ProjectSummary;
  conversations: Array<{
    id: string;
    project_id: string;
    title: string;
    created_at: string;
    updated_at: string;
  }>;
  canvas: {
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
    viewport: { x: number; y: number; zoom: number };
    revision: number;
  };
  messages: Array<Record<string, unknown>>;
  assets: AssetRecord[];
  jobs: Array<Record<string, unknown>>;
  jobAssets: Array<Record<string, unknown>>;
  agentRuns: Array<Record<string, unknown>>;
  agentEvents: Array<Record<string, unknown>>;
  skills?: ProjectSkillSummary[];
}
