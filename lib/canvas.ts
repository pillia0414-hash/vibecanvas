import type { AssetRecord, JobStatus } from "@/lib/app-types";

interface CanvasJob {
  id: string;
  status: JobStatus;
  result?: { assetIds?: string[] } | null;
}

type CanvasAsset = Pick<AssetRecord, "id"> & Partial<Pick<AssetRecord, "url">>;

export function reconcileGeneratedNodes(
  nodes: Array<Record<string, unknown>>,
  jobs: CanvasJob[],
  assets: CanvasAsset[],
) {
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const handledJobs = new Set<string>();
  const reconciled: Array<Record<string, unknown>> = [];

  for (const node of nodes) {
    const data = (node.data || {}) as Record<string, unknown>;
    const jobId = typeof data.jobId === "string" ? data.jobId : undefined;
    const job = jobId ? jobsById.get(jobId) : undefined;

    if (!jobId || !job) {
      reconciled.push(node);
      continue;
    }

    const assetIds = job.status === "success" && Array.isArray(job.result?.assetIds)
      ? job.result.assetIds.filter((assetId) => assetsById.has(assetId))
      : [];

    if (!assetIds.length) {
      reconciled.push({ ...node, data: { ...data, status: job.status } });
      continue;
    }

    if (handledJobs.has(jobId)) continue;
    handledJobs.add(jobId);
    const position = (node.position || { x: 100, y: 100 }) as { x: number; y: number };
    const style = (node.style || { width: 300, height: 260 }) as Record<string, unknown>;
    for (const [index, assetId] of assetIds.entries()) {
      const asset = assetsById.get(assetId);
      reconciled.push({
        ...node,
        id: `asset-${assetId}`,
        position: { x: position.x + index * 330, y: position.y },
        style,
        data: {
          assetId,
          jobId,
          status: "success",
          ...(asset?.url ? { imageUrl: asset.url } : {}),
        },
      });
    }
  }

  return reconciled;
}
