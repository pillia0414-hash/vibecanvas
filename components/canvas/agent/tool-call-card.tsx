import { AlertCircle, CheckCircle2, ChevronDown, Loader2, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";

export type ToolCallStatus = "pending" | "running" | "success" | "error";

export interface AgentToolCall {
  id: string;
  name: string;
  status: ToolCallStatus;
  arguments?: unknown;
  result?: unknown;
  error?: unknown;
}

export interface ToolCallCardProps {
  call: AgentToolCall;
  defaultOpen?: boolean;
  className?: string;
}

export function ToolCallCard({ call, defaultOpen = false, className }: ToolCallCardProps) {
  const failed = call.status === "error";

  return (
    <details
      className={cn(
        "group overflow-hidden rounded-xl border border-zinc-200 bg-white text-xs",
        failed && "border-red-200 bg-red-50/40",
        className,
      )}
      open={defaultOpen || call.status === "running"}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-zinc-700 marker:content-none [&::-webkit-details-marker]:hidden">
        <ToolStatusIcon status={call.status} />
        <span className="min-w-0 flex-1 truncate font-medium">{call.name}</span>
        <span className={cn("shrink-0 text-[11px] text-zinc-400", failed && "text-red-500")}>
          {toolStatusLabel(call.status)}
        </span>
        <ChevronDown size={14} className="shrink-0 text-zinc-400 transition-transform group-open:rotate-180" />
      </summary>

      <div className="space-y-3 border-t border-zinc-200 px-3 py-3">
        {call.arguments !== undefined ? <ToolValue label="参数" value={call.arguments} /> : null}
        {call.result !== undefined ? <ToolValue label="结果" value={call.result} /> : null}
        {call.error !== undefined ? <ToolValue label="错误" value={call.error} tone="error" /> : null}
        {call.arguments === undefined && call.result === undefined && call.error === undefined ? (
          <p className="text-zinc-400">暂无详细信息</p>
        ) : null}
      </div>
    </details>
  );
}

function ToolStatusIcon({ status }: { status: ToolCallStatus }) {
  if (status === "running") return <Loader2 size={14} className="shrink-0 animate-spin text-blue-500" />;
  if (status === "success") return <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />;
  if (status === "error") return <AlertCircle size={14} className="shrink-0 text-red-500" />;
  return <Wrench size={14} className="shrink-0 text-zinc-400" />;
}

function toolStatusLabel(status: ToolCallStatus) {
  if (status === "running") return "运行中";
  if (status === "success") return "已完成";
  if (status === "error") return "失败";
  return "等待中";
}

function ToolValue({ label, value, tone = "default" }: { label: string; value: unknown; tone?: "default" | "error" }) {
  return (
    <div>
      <p className={cn("mb-1.5 font-medium text-zinc-500", tone === "error" && "text-red-600")}>{label}</p>
      <pre
        className={cn(
          "max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-zinc-100 p-2 font-mono text-[11px] leading-5 text-zinc-700",
          tone === "error" && "bg-red-50 text-red-700",
        )}
      >
        {formatToolValue(value)}
      </pre>
    </div>
  );
}

function formatToolValue(value: unknown) {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;

  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}
