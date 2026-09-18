import { Loader2, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

import { MessageAttachment, type AgentAttachment } from "./message-attachment";
import { SafeMarkdown } from "./safe-markdown";
import { ToolCallCard, type AgentToolCall } from "./tool-call-card";

export interface AgentMessageProps {
  id?: string;
  role: "user" | "assistant";
  content?: string;
  thinking?: string;
  skillName?: string;
  attachments?: AgentAttachment[];
  toolCalls?: AgentToolCall[];
  streaming?: boolean;
  className?: string;
}

export function AgentMessage({
  role,
  content = "",
  thinking = "",
  skillName,
  attachments = [],
  toolCalls = [],
  streaming = false,
  className,
}: AgentMessageProps) {
  if (role === "user") {
    return (
      <article className={cn("flex w-full justify-end", className)}>
        <div className="flex max-w-[88%] flex-col items-end gap-2">
          {skillName || attachments.length ? (
            <div className="flex max-w-full flex-wrap justify-end gap-2">
              {skillName ? (
                <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-700">
                  <Sparkles size={11} className="shrink-0" />
                  <span className="truncate">{skillName}</span>
                </span>
              ) : null}
              {attachments.map((attachment) => <MessageAttachment key={attachment.id} attachment={attachment} />)}
            </div>
          ) : null}
          {content ? (
            <div className="max-w-full rounded-2xl rounded-br-md bg-zinc-100 px-3.5 py-2">
              <SafeMarkdown content={content} className="text-zinc-900" />
            </div>
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <article className={cn("min-w-0 space-y-3", className)}>
      {thinking ? (
        <details className="group rounded-xl border border-zinc-200 bg-zinc-50" open={streaming}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-500 marker:content-none [&::-webkit-details-marker]:hidden">
            {streaming ? <Loader2 size={13} className="animate-spin" /> : null}
            <span>思考过程</span>
            <span className="ml-auto text-[10px] font-normal text-zinc-400">点击展开</span>
          </summary>
          <SafeMarkdown content={thinking} className="border-t border-zinc-200 px-3 py-2.5 text-xs leading-5 text-zinc-600" />
        </details>
      ) : null}

      {toolCalls.length ? (
        <div className="space-y-2">
          {toolCalls.map((call) => <ToolCallCard key={call.id} call={call} />)}
        </div>
      ) : null}

      {content ? <SafeMarkdown content={content} /> : null}
      {attachments.length ? (
        <div className="flex max-w-full flex-wrap gap-2">
          {attachments.map((attachment) => <MessageAttachment key={attachment.id} attachment={attachment} />)}
        </div>
      ) : null}
      {streaming && !content ? (
        <div className="inline-flex items-center gap-2 text-xs text-zinc-400">
          <Loader2 size={13} className="animate-spin" /> Agent 正在处理…
        </div>
      ) : null}
    </article>
  );
}
