export type AgentStreamEvent =
  | { type: "run_started"; runId: string; sequence: number; userMessageId: string; assistantMessageId: string }
  | { type: "text_delta"; runId: string; sequence: number; delta: string }
  | { type: "thinking_delta"; runId: string; sequence: number; delta: string }
  | { type: "tool_start"; runId: string; sequence: number; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool_update"; runId: string; sequence: number; toolCallId: string; toolName: string; result: unknown }
  | { type: "tool_end"; runId: string; sequence: number; toolCallId: string; toolName: string; result?: unknown; error?: unknown; isError: boolean }
  | { type: "done"; runId: string; sequence: number; content: string; thinking: string }
  | { type: "error"; runId: string; sequence: number; message: string };

export type AgentStreamEventInput = AgentStreamEvent extends infer Event
  ? Event extends AgentStreamEvent
    ? Omit<Event, "runId" | "sequence">
    : never
  : never;

export interface PersistedAgentEvent {
  sequence: number;
  event_type: AgentStreamEvent["type"];
  tool_call_id?: string | null;
  tool_name?: string | null;
  payload: Record<string, unknown>;
}

export function isAgentStreamEvent(value: unknown): value is AgentStreamEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return typeof event.type === "string"
    && typeof event.runId === "string"
    && typeof event.sequence === "number";
}
