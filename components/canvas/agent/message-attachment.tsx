import { Download, FileText } from "lucide-react";
import Image from "next/image";

import { cn } from "@/lib/utils";

export interface AgentAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  url?: string;
  previewUrl?: string;
  openUrl?: string;
  downloadUrl?: string;
  size?: number | null;
}

export interface MessageAttachmentProps {
  attachment: AgentAttachment;
  className?: string;
}

export function MessageAttachment({ attachment, className }: MessageAttachmentProps) {
  const isImage = attachment.mimeType.startsWith("image/");
  const previewUrl = attachment.previewUrl || attachment.url;
  const openUrl = attachment.openUrl || attachment.url;
  const downloadUrl = attachment.downloadUrl || attachment.url;

  if (isImage && previewUrl) {
    return (
      <div className={cn("group relative size-20 shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50", className)}>
        {openUrl ? (
          <a href={openUrl} target="_blank" rel="noopener noreferrer" className="block size-full" aria-label={`预览 ${attachment.fileName}`}>
            <Image src={previewUrl} alt={attachment.fileName} fill sizes="80px" unoptimized className="object-cover" />
          </a>
        ) : (
          <Image src={previewUrl} alt={attachment.fileName} fill sizes="80px" unoptimized className="object-cover" />
        )}
        {downloadUrl ? (
          <a
            href={downloadUrl}
            download={attachment.fileName}
            className="absolute bottom-1 right-1 grid size-6 place-items-center rounded-md bg-black/65 text-white opacity-0 transition hover:bg-black/80 focus:opacity-100 group-hover:opacity-100"
            aria-label={`下载 ${attachment.fileName}`}
            title="下载"
          >
            <Download size={12} />
          </a>
        ) : null}
      </div>
    );
  }

  const card = (
    <div className="flex min-w-0 items-center gap-2.5 px-3 py-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-zinc-500 shadow-sm">
        <FileText size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block max-w-[156px] truncate text-xs font-medium text-zinc-800" title={attachment.fileName}>
          {attachment.fileName}
        </span>
        <span className="mt-0.5 block text-[10px] uppercase text-zinc-400">
          Markdown{attachment.size != null ? ` · ${formatFileSize(attachment.size)}` : ""}
        </span>
      </span>
    </div>
  );

  return (
    <div className={cn("flex max-w-[240px] items-center overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50", className)}>
      {openUrl ? (
        <a href={openUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 hover:bg-zinc-100" title={`预览 ${attachment.fileName}`}>
          {card}
        </a>
      ) : (
        <div className="min-w-0 flex-1">{card}</div>
      )}
      {downloadUrl ? (
        <a
          href={downloadUrl}
          download={attachment.fileName}
          className="mr-2 grid size-7 shrink-0 place-items-center rounded-lg text-zinc-500 transition hover:bg-white hover:text-zinc-950"
          aria-label={`下载 ${attachment.fileName}`}
          title="下载"
        >
          <Download size={14} />
        </a>
      ) : null}
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
