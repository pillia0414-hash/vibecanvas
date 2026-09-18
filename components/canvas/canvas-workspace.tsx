"use client";
/* eslint-disable @next/next/no-img-element */

import {
  ArrowDownToLine,
  Bot,
  Check,
  ChevronDown,
  Copy,
  Download,
  ImagePlus,
  Layers,
  Loader2,
  Menu,
  Paperclip,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { NanoBanana, OpenAI } from "@lobehub/icons";
import Link from "next/link";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type ReactFlowInstance,
  type Viewport,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
} from "@xyflow/react";
import {
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { BrandMark } from "@/components/brand-mark";
import {
  AgentMessage,
  MessageAttachment,
  type AgentAttachment,
  type AgentToolCall,
} from "@/components/canvas/agent";
import { ImageNode } from "@/components/canvas/image-node";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AgentStreamEvent } from "@/lib/agent-events";
import type {
  AssetRecord,
  CanvasNodeData,
  GenerationConfig,
  GenerationModel,
  JobStatus,
  ProjectSkillSummary,
  WorkspaceData,
} from "@/lib/app-types";
import { reconcileGeneratedNodes } from "@/lib/canvas";

const nodeTypes = { imageCard: ImageNode };
const ACTIVE_STATUSES = new Set<JobStatus>(["submitting", "waiting", "queuing", "generating", "processing_result"]);
const GPT_RATIOS = ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "3:1", "1:3", "21:9", "9:21"];
const NANO_RATIOS = ["auto", "1:1", "2:3", "3:2", "1:4", "4:1", "3:4", "4:3", "4:5", "5:4", "1:8", "8:1", "9:16", "16:9", "21:9"];

type ComposerMode = "agent" | "image";

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

interface MessageItem {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  mode?: ComposerMode;
  status?: "streaming" | "completed" | "failed";
  model?: string;
  config?: GenerationConfig;
  metadata?: Record<string, unknown>;
  referenceAsset?: AssetRecord;
  assets?: AssetRecord[];
  created_at: string;
}

interface JobItem {
  id: string;
  conversation_id: string;
  user_message_id: string;
  model: string;
  source?: "direct" | "agent";
  provider_model?: string;
  agent_run_id?: string;
  request?: { prompt?: string; config?: GenerationConfig; referenceAssetId?: string; orderedReferenceAssetIds?: string[] };
  status: JobStatus;
  result?: { assetIds?: string[] };
  error_message?: string;
}

interface AgentRunItem {
  id: string;
  conversation_id: string;
  user_message_id: string;
  assistant_message_id?: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  error_message?: string;
}

interface AgentEventItem {
  run_id: string;
  sequence: number;
  event_type: AgentStreamEvent["type"];
  tool_call_id?: string;
  tool_name?: string;
  payload: Record<string, unknown>;
}

interface LiveAgentView {
  content: string;
  thinking: string;
  tools: AgentToolCall[];
  streaming: boolean;
  error?: string;
}

const defaultConfigs: Record<GenerationModel, GenerationConfig> = {
  "gpt-image-2": { resolution: "1K", aspectRatio: "auto", background: "auto" },
  "nano-banana-2": { resolution: "1K", aspectRatio: "auto", outputFormat: "jpg" },
};

function hydrateWorkspace(workspace: WorkspaceData) {
  const assets = workspace.assets;
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const jobs = workspace.jobs as unknown as JobItem[];
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const nodes = (workspace.canvas.nodes as unknown as Node<CanvasNodeData>[]).map((node) => {
    const asset = node.data.assetId ? assetById.get(node.data.assetId) : undefined;
    const status = node.data.jobId ? jobById.get(node.data.jobId)?.status : node.data.status;
    return normalizeImageNode({ ...node, data: { ...node.data, ...(status ? { status } : {}) } }, asset);
  });
  return {
    assets,
    jobs,
    nodes,
    edges: workspace.canvas.edges as Edge[],
    viewport: workspace.canvas.viewport,
    revision: Number(workspace.canvas.revision) || 0,
    conversations: workspace.conversations as Conversation[],
    messages: workspace.messages as unknown as MessageItem[],
    agentRuns: workspace.agentRuns as unknown as AgentRunItem[],
    agentEvents: workspace.agentEvents as unknown as AgentEventItem[],
    skills: (workspace.skills || []) as ProjectSkillSummary[],
  };
}

export function CanvasWorkspace({ projectId, initialTitle, initialWorkspace }: {
  projectId: string;
  initialTitle: string;
  initialWorkspace?: WorkspaceData;
}) {
  const initial = useMemo(() => initialWorkspace ? hydrateWorkspace(initialWorkspace) : null, [initialWorkspace]);
  const [nodes, setNodes, baseOnNodesChange] = useNodesState<Node<CanvasNodeData>>(initial?.nodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial?.edges || []);
  const [viewport, setViewport] = useState<Viewport>(initial?.viewport || { x: 0, y: 0, zoom: 1 });
  const [canvasRevision, setCanvasRevision] = useState(initial?.revision || 0);
  const revisionRef = useRef(initial?.revision || 0);
  const flowRef = useRef<ReactFlowInstance<Node<CanvasNodeData>, Edge> | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [conversations, setConversations] = useState<Conversation[]>(initial?.conversations || []);
  const [conversationId, setConversationId] = useState(initial?.conversations[0]?.id || "");
  const [messages, setMessages] = useState<MessageItem[]>(initial?.messages || []);
  const [jobs, setJobs] = useState<JobItem[]>(initial?.jobs || []);
  const [assets, setAssets] = useState<AssetRecord[]>(initial?.assets || []);
  const [agentRuns, setAgentRuns] = useState<AgentRunItem[]>(initial?.agentRuns || []);
  const [agentEvents, setAgentEvents] = useState<AgentEventItem[]>(initial?.agentEvents || []);
  const [liveAgents, setLiveAgents] = useState<Record<string, LiveAgentView>>({});
  const [loading, setLoading] = useState(!initial);
  const [loaded, setLoaded] = useState(Boolean(initial));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [panelWidth, setPanelWidth] = useState(384);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<ComposerMode>("agent");
  const [model, setModel] = useState<GenerationModel>("gpt-image-2");
  const [configs, setConfigs] = useState(defaultConfigs);
  const [draftAttachments, setDraftAttachments] = useState<AssetRecord[]>([]);
  const [skills, setSkills] = useState<ProjectSkillSummary[]>(initial?.skills || []);
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const [skillUploading, setSkillUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadLabel, setUploadLabel] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [conversationOpen, setConversationOpen] = useState(false);
  const [selectingReference, setSelectingReference] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const skillInput = useRef<HTMLInputElement>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const copiedNodes = useRef<Node<CanvasNodeData>[]>([]);
  const deletedNodeIds = useRef(new Set<string>());
  const lastSavedCanvas = useRef(initial
    ? canvasFingerprint(initial.nodes, initial.edges, initial.viewport)
    : "");

  const loadWorkspace = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/workspace`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "加载工作区失败");
      const workspace = payload as WorkspaceData;
      const hydrated = hydrateWorkspace(workspace);
      setTitle(workspace.project.title);
      setConversations(hydrated.conversations);
      setConversationId((current) => current && workspace.conversations.some((item) => item.id === current) ? current : workspace.conversations[0]?.id || "");
      setMessages(hydrated.messages);
      setJobs(hydrated.jobs);
      setAssets(hydrated.assets);
      setAgentRuns(hydrated.agentRuns);
      setAgentEvents(hydrated.agentEvents);
      setSkills(hydrated.skills);
      setNodes(hydrated.nodes);
      setEdges(hydrated.edges);
      setViewport(hydrated.viewport);
      const revision = hydrated.revision;
      revisionRef.current = revision;
      setCanvasRevision(revision);
      lastSavedCanvas.current = canvasFingerprint(hydrated.nodes, hydrated.edges, hydrated.viewport);
      deletedNodeIds.current.clear();
      requestAnimationFrame(() => flowRef.current?.setViewport(hydrated.viewport));
      setLoaded(true);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载工作区失败");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [projectId, setEdges, setNodes]);

  useEffect(() => {
    if (!initialWorkspace) void loadWorkspace();
  }, [initialWorkspace, loadWorkspace]);
  useEffect(() => {
    const stored = Number(localStorage.getItem("canvas-chat-width"));
    if (Number.isFinite(stored)) setPanelWidth(Math.min(620, Math.max(320, stored)));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const fingerprint = canvasFingerprint(nodes, edges, viewport);
    if (fingerprint === lastSavedCanvas.current) return;
    const timeout = window.setTimeout(async () => {
      setSaving(true);
      try {
        const response = await fetch(`/api/projects/${projectId}/canvas`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nodes, edges, viewport, baseRevision: revisionRef.current }),
        });
        const payload = await response.json().catch(() => null);
        if (response.status === 409 && payload?.canvas) {
          const serverNodes = payload.canvas.nodes as Node<CanvasNodeData>[];
          const localById = new Map(nodes.map((node) => [node.id, node]));
          const deleted = deletedNodeIds.current;
          const merged = serverNodes
            .filter((node) => !deleted.has(node.id))
            .map((node) => localById.get(node.id) || node);
          const serverIds = new Set(serverNodes.map((node) => node.id));
          for (const node of nodes) if (!serverIds.has(node.id) && !deleted.has(node.id)) merged.push(node);
          revisionRef.current = Number(payload.canvas.revision) || 0;
          setCanvasRevision(revisionRef.current);
          lastSavedCanvas.current = canvasFingerprint(serverNodes, payload.canvas.edges || [], payload.canvas.viewport);
          setNodes(merged);
        } else if (!response.ok) {
          throw new Error(payload?.error || "保存画布失败");
        } else {
          revisionRef.current = Number(payload.revision) || revisionRef.current + 1;
          setCanvasRevision(revisionRef.current);
          lastSavedCanvas.current = fingerprint;
          deletedNodeIds.current.clear();
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "保存画布失败");
      } finally {
        setSaving(false);
      }
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [edges, loaded, nodes, projectId, setNodes, viewport, canvasRevision]);

  const activeJobs = useMemo(() => jobs.filter((job) => ACTIVE_STATUSES.has(job.status)), [jobs]);
  useEffect(() => {
    if (!loaded || !jobs.some((job) => job.status === "success")) return;
    setNodes((current) => {
      const reconciled = reconcileGeneratedNodes(current as unknown as Array<Record<string, unknown>>, jobs, assets) as unknown as Node<CanvasNodeData>[];
      const normalized = reconciled.map((node) => normalizeImageNode(node, node.data.assetId ? assets.find((asset) => asset.id === node.data.assetId) : undefined));
      return JSON.stringify(normalized) === JSON.stringify(current) ? current : normalized;
    });
  }, [assets, jobs, loaded, setNodes]);

  useEffect(() => {
    if (!activeJobs.length) return;
    let cancelled = false;
    let timer = 0;
    const poll = async () => {
      const results = await Promise.all(activeJobs.map(async (job) => {
        const response = await fetch(`/api/generations/${job.id}`, { cache: "no-store" });
        return response.json().catch(() => null);
      }));
      if (cancelled) return;
      const terminal = results.some((payload) => payload?.job && !ACTIVE_STATUSES.has(payload.job.status));
      if (terminal) await loadWorkspace(true);
      else {
        setJobs((current) => current.map((item) => results.find((payload) => payload?.job?.id === item.id)?.job || item));
        setNodes((current) => current.map((node) => {
          const updated = results.find((payload) => payload?.job?.id === node.data.jobId)?.job;
          return updated ? { ...node, data: { ...node.data, status: updated.status } } : node;
        }));
      }
      if (!cancelled) timer = window.setTimeout(poll, 5000);
    };
    timer = window.setTimeout(poll, 2500);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [activeJobs.map((job) => `${job.id}:${job.status}`).join("|"), loadWorkspace, setNodes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [conversationId, messages, jobs, liveAgents]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input,textarea,[contenteditable=true]")) return;
      if (event.key === "Escape") setSelectingReference(false);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") copiedNodes.current = nodes.filter((node) => node.selected);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v" && copiedNodes.current.length) {
        event.preventDefault();
        setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), ...copiedNodes.current.map((node) => ({
          ...node,
          id: `${node.id}-copy-${crypto.randomUUID()}`,
          position: { x: node.position.x + 32, y: node.position.y + 32 },
          selected: true,
        }))]);
      }
      if ((event.key === "Delete" || event.key === "Backspace") && nodes.some((node) => node.selected)) {
        event.preventDefault();
        deleteSelectedNodes();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [nodes]); // eslint-disable-line react-hooks/exhaustive-deps

  const onNodesChange = useCallback((changes: NodeChange<Node<CanvasNodeData>>[]) => {
    for (const change of changes) if (change.type === "remove") deletedNodeIds.current.add(change.id);
    baseOnNodesChange(changes);
  }, [baseOnNodesChange]);

  const busy = uploading || sending || agentRunning || activeJobs.length > 0;
  const currentMessages = messages.filter((message) => message.conversation_id === conversationId);
  const selectedCount = nodes.filter((node) => node.selected).length;

  const resizePanel = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = panelWidth;
    const move = (pointer: PointerEvent) => setPanelWidth(Math.min(620, Math.max(320, startWidth + startX - pointer.clientX)));
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      setPanelWidth((value) => { localStorage.setItem("canvas-chat-width", String(value)); return value; });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  const addDraftAsset = useCallback((asset: AssetRecord) => {
    setDraftAttachments((current) => {
      if (current.some((item) => item.id === asset.id)) return current;
      if (mode === "image" && asset.mime_type.startsWith("image/")) {
        return [...current.filter((item) => !item.mime_type.startsWith("image/")), asset];
      }
      const imageCount = current.filter((item) => item.mime_type.startsWith("image/")).length;
      if (asset.mime_type.startsWith("image/") && imageCount >= 16) {
        setError("Agent 最多使用 16 张参考图");
        return current;
      }
      return current.length >= 20 ? current : [...current, asset];
    });
  }, [mode]);

  const onNodeClick: NodeMouseHandler<Node<CanvasNodeData>> = (_event, node) => {
    if (!node.data.assetId) return;
    const asset = assets.find((item) => item.id === node.data.assetId);
    if (!asset) return;
    if (mode === "agent" || selectingReference) {
      addDraftAsset(asset);
      setSelectingReference(false);
    }
  };

  async function uploadFiles(files: File[]) {
    const compatible = files.filter((file) => file.type.startsWith("image/") || file.name.toLowerCase().endsWith(".md"));
    const accepted = mode === "image"
      ? compatible.filter((file) => file.type.startsWith("image/")).slice(0, 1)
      : compatible.slice(0, 20);
    if (!accepted.length || uploading) return;
    setUploading(true);
    setError("");
    try {
      for (const [index, file] of accepted.entries()) {
        setUploadLabel(`正在上传 ${index + 1}/${accepted.length}：${file.name}`);
        const center = flowRef.current?.screenToFlowPosition({
          x: Math.max(120, (window.innerWidth - panelWidth) / 2),
          y: window.innerHeight / 2,
        });
        const form = new FormData();
        form.set("file", file);
        if (center) {
          form.set("x", String(center.x - 140 + index * 28));
          form.set("y", String(center.y - 120 + index * 28));
        }
        const response = await fetch(`/api/projects/${projectId}/assets`, { method: "POST", body: form });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || `上传 ${file.name} 失败`);
        const asset = payload.asset as AssetRecord;
        setAssets((current) => current.some((item) => item.id === asset.id) ? current : [...current, asset]);
        addDraftAsset(asset);
        if (payload.node) setNodes((current) => current.some((node) => node.id === payload.node.id) ? current : [...current, payload.node]);
      }
      await loadWorkspace(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "上传附件失败");
    } finally {
      setUploading(false);
      setUploadLabel("");
    }
  }

  async function uploadSkill(file: File) {
    if (file.name.toLowerCase() !== "skill.md") {
      setError("请上传标准 SKILL.md 文件");
      return;
    }
    setSkillUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(`/api/projects/${projectId}/skills`, { method: "POST", body: form });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "上传技能失败");
      const skill = payload.skill as ProjectSkillSummary;
      setSkills((current) => {
        const rest = current.filter((item) => item.id !== skill.id && item.name !== skill.name);
        return [skill, ...rest];
      });
      setSelectedSkillId(skill.id);
      setSkillMenuOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "上传技能失败");
    } finally {
      setSkillUploading(false);
    }
  }

  async function removeSkill(skillId: string) {
    const response = await fetch(`/api/projects/${projectId}/skills/${skillId}`, { method: "DELETE" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error || "删除技能失败");
      return;
    }
    setSkills((current) => current.filter((item) => item.id !== skillId));
    setSelectedSkillId((current) => current === skillId ? "" : current);
  }

  function onPaste(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files || []);
    if (!files.length) return;
    event.preventDefault();
    void uploadFiles(files);
  }

  function onDrop(event: ReactDragEvent<HTMLFormElement>) {
    event.preventDefault();
    setDragActive(false);
    void uploadFiles(Array.from(event.dataTransfer.files || []));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending || agentRunning || !conversationId) return;
    const text = prompt.trim();
    const attachments = [...draftAttachments];
    const skill = skills.find((item) => item.id === selectedSkillId);
    if (!text && !attachments.length) return;
    if (mode === "image" && attachments.some((asset) => !asset.mime_type.startsWith("image/"))) {
      setError("Markdown 附件需要在 Agent 模式下发送");
      return;
    }
    setPrompt("");
    setDraftAttachments([]);
    setSelectedSkillId("");
    setUploadLabel("");
    if (mode === "agent") await sendAgent(text, attachments, skill);
    else await sendGeneration(text, attachments.find((asset) => asset.mime_type.startsWith("image/")));
  }

  async function sendAgent(text: string, attachments: AssetRecord[], skill?: ProjectSkillSummary) {
    const clientRunId = `client-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const tempUserId = `${clientRunId}-user`;
    const tempAssistantId = `${clientRunId}-assistant`;
    setMessages((current) => [...current,
      {
        id: tempUserId,
        conversation_id: conversationId,
        role: "user",
        content: text,
        mode: "agent",
        status: "completed",
        metadata: {
          runId: clientRunId,
          ...(skill ? { skillId: skill.id, skillName: skill.name } : {}),
        },
        assets: attachments,
        created_at: now,
      },
      {
        id: tempAssistantId,
        conversation_id: conversationId,
        role: "assistant",
        content: "",
        mode: "agent",
        status: "streaming",
        metadata: { runId: clientRunId },
        assets: [],
        created_at: now,
      },
    ]);
    setLiveAgents((current) => ({ ...current, [clientRunId]: { content: "", thinking: "", tools: [], streaming: true } }));
    setAgentRunning(true);
    setSending(true);
    setError("");
    let liveKey = clientRunId;
    try {
      const response = await fetch("/api/agent/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          conversationId,
          prompt: text,
          attachmentIds: attachments.map((asset) => asset.id),
          referenceAssetIds: attachments.filter((asset) => asset.mime_type.startsWith("image/")).map((asset) => asset.id),
          skillId: skill?.id || undefined,
        }),
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "启动 Agent 失败");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const streamed = JSON.parse(line) as AgentStreamEvent;
          if (streamed.type === "run_started") {
            liveKey = streamed.runId;
            setLiveAgents((current) => {
              const previous = current[clientRunId] || { content: "", thinking: "", tools: [], streaming: true };
              const next = { ...current, [streamed.runId]: previous };
              delete next[clientRunId];
              return next;
            });
            setMessages((current) => current.map((message) => message.id === tempUserId
              ? { ...message, id: streamed.userMessageId, metadata: { ...message.metadata, runId: streamed.runId } }
              : message.id === tempAssistantId
                ? { ...message, id: streamed.assistantMessageId, metadata: { runId: streamed.runId } }
                : message));
          } else {
            setLiveAgents((current) => ({ ...current, [liveKey]: reduceLiveAgent(current[liveKey], streamed) }));
          }
        }
        if (done) break;
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Agent 运行失败";
      setError(message);
      setLiveAgents((current) => ({
        ...current,
        [liveKey]: { ...(current[liveKey] || { content: "", thinking: "", tools: [] }), streaming: false, error: message },
      }));
    } finally {
      setSending(false);
      setAgentRunning(false);
      await loadWorkspace(true);
      setLiveAgents((current) => {
        const next = { ...current };
        delete next[liveKey];
        delete next[clientRunId];
        return next;
      });
    }
  }

  async function sendGeneration(text: string, reference?: AssetRecord, override?: { model: GenerationModel; config: GenerationConfig }) {
    setSending(true);
    setError("");
    const canvasPosition = flowRef.current?.screenToFlowPosition({
      x: Math.max(180, (window.innerWidth - panelWidth) / 2),
      y: window.innerHeight / 2,
    });
    try {
      const response = await fetch("/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          conversationId,
          prompt: text,
          model: override?.model || model,
          config: override?.config || configs[model],
          referenceAssetId: reference?.id,
          canvasPosition: canvasPosition ? { x: canvasPosition.x - 150, y: canvasPosition.y - 130 } : undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "创建生成任务失败");
      if (payload.node && payload.job) {
        setJobs((current) => current.some((item) => item.id === payload.job.id) ? current : [...current, payload.job]);
        setNodes((current) => current.some((item) => item.data.jobId === payload.job.id) ? current : [...current, payload.node]);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建生成任务失败");
    } finally {
      setSending(false);
      await loadWorkspace(true);
    }
  }

  async function createConversation() {
    const response = await fetch(`/api/projects/${projectId}/conversations`, { method: "POST" });
    const payload = await response.json().catch(() => null);
    if (response.ok) {
      setConversations((current) => [payload.conversation, ...current]);
      setConversationId(payload.conversation.id);
      setConversationOpen(false);
    } else setError(payload?.error || "创建对话失败");
  }

  async function queryJob(jobId: string) {
    const response = await fetch(`/api/generations/${jobId}?refresh=1`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.job?.error_message || payload?.error || "查询任务失败");
    await loadWorkspace(true);
  }

  async function retryAgentJob(jobId: string) {
    const center = flowRef.current?.screenToFlowPosition({ x: (window.innerWidth - panelWidth) / 2, y: window.innerHeight / 2 });
    const response = await fetch(`/api/generations/${jobId}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(center ? { x: center.x - 150, y: center.y - 120 } : {}),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) setError(payload?.error || "重新生成失败");
    await loadWorkspace(true);
  }

  function updateConfig(next: Partial<GenerationConfig>) {
    setConfigs((current) => {
      const config = { ...current[model], ...next };
      if (model === "gpt-image-2") {
        if (next.aspectRatio === "auto") config.resolution = "1K";
        if (next.resolution && next.resolution !== "1K" && config.aspectRatio === "auto") config.aspectRatio = "16:9";
        const blocked = config.resolution === "2K" ? ["5:4", "4:5", "3:1", "1:3", "9:21"] : config.resolution === "4K" ? ["1:1", "3:1", "1:3", "9:21"] : [];
        if (blocked.includes(config.aspectRatio)) config.aspectRatio = "16:9";
      }
      return { ...current, [model]: config };
    });
  }

  function changeMode(nextMode: ComposerMode) {
    setMode(nextMode);
    if (nextMode === "image") {
      setDraftAttachments((current) => current.filter((asset) => asset.mime_type.startsWith("image/")).slice(0, 1));
      setSelectedSkillId("");
    }
  }

  function deleteSelectedNodes() {
    setNodes((current) => {
      for (const node of current) if (node.selected) deletedNodeIds.current.add(node.id);
      return current.filter((node) => !node.selected);
    });
  }

  function moveLayer(direction: "front" | "back" | "up" | "down") {
    setNodes((current) => {
      const selected = current.filter((node) => node.selected);
      const rest = current.filter((node) => !node.selected);
      if (!selected.length) return current;
      if (direction === "front") return [...rest, ...selected];
      if (direction === "back") return [...selected, ...rest];
      const copy = [...current];
      if (direction === "up") {
        for (let index = copy.length - 2; index >= 0; index--) if (copy[index].selected && !copy[index + 1].selected) [copy[index], copy[index + 1]] = [copy[index + 1], copy[index]];
      } else {
        for (let index = 1; index < copy.length; index++) if (copy[index].selected && !copy[index - 1].selected) [copy[index], copy[index - 1]] = [copy[index - 1], copy[index]];
      }
      return copy;
    });
  }

  async function deleteAsset(asset: AssetRecord) {
    if (!window.confirm("确定从素材库删除这张图片吗？画布中的对应节点也会移除。")) return;
    const response = await fetch(`/api/assets/${asset.id}`, { method: "DELETE" });
    if (response.ok) {
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      setNodes((current) => current.filter((node) => node.data.assetId !== asset.id));
      setMessages((current) => current.map((message) => ({ ...message, assets: message.assets?.filter((item) => item.id !== asset.id) })));
      setDraftAttachments((current) => current.filter((item) => item.id !== asset.id));
    }
  }

  function downloadAsset(asset: AssetRecord) {
    window.open(asset.downloadUrl || `${asset.url}?download=1`, "_blank", "noopener,noreferrer");
  }

  function focusAsset(asset: AssetRecord) {
    const target = nodes.find((node) => node.data.assetId === asset.id);
    if (!target) return;
    flowRef.current?.fitView({ nodes: [target], padding: 0.25, maxZoom: 1, duration: 500 });
  }

  if (loading) return <div className="grid h-screen place-items-center bg-zinc-50"><Loader2 className="animate-spin text-zinc-500" /></div>;

  return (
    <main className="flex h-screen overflow-hidden bg-white text-zinc-950">
      <section className="relative min-w-0 flex-1 bg-[#f7f7f7]">
        <header className="absolute inset-x-0 top-0 z-20 flex h-14 items-center justify-between border-b border-zinc-200 bg-white/90 px-3 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3"><BrandMark withName={false} /><span className="truncate text-sm font-medium">{title}</span>{saving ? <span className="text-xs text-zinc-400">保存中…</span> : null}</div>
          {selectedCount ? (
            <div className="flex items-center gap-1 rounded-xl border bg-white p-1 shadow-sm">
              <button onClick={() => setNodes((current) => [...current, ...current.filter((node) => node.selected).map((node) => ({ ...node, id: `${node.id}-copy-${crypto.randomUUID()}`, position: { x: node.position.x + 24, y: node.position.y + 24 }, selected: false }))])} className="tool-button" title="复制"><Copy size={15} /></button>
              <button onClick={() => moveLayer("front")} className="tool-button" title="置顶"><Layers size={15} /></button>
              <button onClick={() => moveLayer("back")} className="tool-button" title="置底"><ArrowDownToLine size={15} /></button>
              <button onClick={deleteSelectedNodes} className="tool-button text-red-500" title="仅从画布删除"><Trash2 size={15} /></button>
            </div>
          ) : null}
        </header>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onInit={(instance) => { flowRef.current = instance; instance.setViewport(viewport); }}
          onMoveEnd={(_event, nextViewport) => setViewport(nextViewport)}
          deleteKeyCode={null}
          selectionOnDrag
          panOnDrag={[1, 2]}
          multiSelectionKeyCode={["Meta", "Control", "Shift"]}
          minZoom={0.08}
          maxZoom={4}
          onlyRenderVisibleElements
          className={selectingReference ? "cursor-crosshair" : mode === "agent" ? "cursor-default" : ""}
          fitView={false}
        >
          <Background color="#e5e5e5" gap={24} size={1} />
          <Controls position="bottom-left" showInteractive={false} />
          <MiniMap position="bottom-right" pannable zoomable className="!border !border-zinc-200 !bg-white" />
        </ReactFlow>
        {!nodes.length ? <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-zinc-400">在右侧输入你的想法开始创作</div> : null}
        {selectingReference ? <div className="absolute left-1/2 top-20 z-30 -translate-x-1/2 rounded-full bg-zinc-950 px-4 py-2 text-xs text-white shadow-lg">点击画布中的一张图片 · Esc 取消</div> : null}
      </section>

      <div onPointerDown={resizePanel} className="z-30 w-1 cursor-col-resize bg-zinc-200 transition hover:bg-blue-500" />
      <aside style={{ width: panelWidth }} className="relative flex shrink-0 flex-col bg-white">
        <header className="flex h-14 items-center justify-between border-b px-4">
          <div className="relative min-w-0">
            <button onClick={() => setConversationOpen(!conversationOpen)} className="flex max-w-[220px] items-center gap-1 text-sm font-medium"><span className="truncate">{conversations.find((item) => item.id === conversationId)?.title || "新对话"}</span><ChevronDown size={14} /></button>
            {conversationOpen ? (
              <div className="absolute left-0 top-9 z-50 w-64 rounded-xl border bg-white p-1 shadow-xl">
                <button onClick={createConversation} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100"><Plus size={15} /> 新建对话</button>
                <div className="my-1 border-t" />
                {conversations.map((item) => <button key={item.id} onClick={() => { setConversationId(item.id); setConversationOpen(false); }} className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm ${conversationId === item.id ? "bg-zinc-100" : "hover:bg-zinc-50"}`}>{item.title}</button>)}
              </div>
            ) : null}
          </div>
          <Link href="/projects" className="tool-button" title="所有项目"><Menu size={17} /></Link>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          {!currentMessages.length ? <div className="grid h-full place-items-center text-center"><div><Sparkles className="mx-auto mb-3 text-zinc-300" /><p className="text-sm font-medium">开始创作</p><p className="mt-1 text-xs text-zinc-400">让 Agent 规划，或直接生成图片</p></div></div> : null}
          <div className="space-y-7">
            {currentMessages.map((message) => {
              const messageMode = message.mode || "image";
              if (messageMode === "image") {
                if (message.role !== "user") return null;
                const job = jobs.find((item) => item.user_message_id === message.id && item.source !== "agent");
                const resultAssets = assets.filter((asset) => (asset.metadata as { jobId?: string })?.jobId === job?.id);
                return <GenerationMessage key={message.id} message={message} job={job} assets={resultAssets} onFocus={focusAsset} onDownload={downloadAsset} onReference={addDraftAsset} onDelete={deleteAsset} onQuery={() => job && queryJob(job.id)} onRegenerate={() => {
                  if (!job?.request?.prompt || (job.model !== "gpt-image-2" && job.model !== "nano-banana-2")) return;
                  const reference = assets.find((asset) => asset.id === job.request?.referenceAssetId);
                  void sendGeneration(job.request.prompt, reference, { model: job.model, config: job.request.config || defaultConfigs[job.model] });
                }} />;
              }
              const runId = typeof message.metadata?.runId === "string" ? message.metadata.runId : undefined;
              const run = runId ? agentRuns.find((item) => item.id === runId) : agentRuns.find((item) => item.assistant_message_id === message.id);
              const ownsRunTimeline = message.role === "assistant" && run?.assistant_message_id === message.id;
              const view = message.role === "assistant"
                ? agentView(message, ownsRunTimeline ? run : undefined, agentEvents, ownsRunTimeline ? liveAgents[runId || run?.id || ""] : undefined)
                : undefined;
              const outputAssets = (message.assets || []).filter((asset) => asset.relationType === "output");
              const regularAttachments = (message.assets || []).filter((asset) => asset.relationType !== "output");
              const skillName = typeof message.metadata?.skillName === "string" ? message.metadata.skillName : undefined;
              return (
                <div key={message.id} className="space-y-3">
                  <AgentMessage
                    role={message.role === "assistant" ? "assistant" : "user"}
                    content={view?.content ?? message.content}
                    thinking={view?.thinking}
                    skillName={message.role === "user" ? skillName : undefined}
                    toolCalls={view?.tools}
                    streaming={view?.streaming}
                    attachments={regularAttachments.map(toAgentAttachment)}
                  />
                  {view?.error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{view.error}</p> : null}
                  {outputAssets.map((asset) => {
                    const jobId = typeof message.metadata?.jobId === "string" ? message.metadata.jobId : (asset.metadata as { jobId?: string })?.jobId;
                    return <GeneratedAssetCard key={asset.id} asset={asset} onFocus={focusAsset} onDownload={downloadAsset} onReference={addDraftAsset} onDelete={deleteAsset} onRetry={jobId ? () => retryAgentJob(jobId) : undefined} />;
                  })}
                </div>
              );
            })}
          </div>
          <div ref={messagesEnd} />
        </div>

        {error ? <div className="mx-3 mb-2 flex items-start justify-between gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600"><span>{error}</span><button onClick={() => setError("")}><X size={14} /></button></div> : null}
        <form
          onSubmit={submit}
          onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false); }}
          onDrop={onDrop}
          className={`relative m-3 rounded-2xl border bg-white p-2 shadow-[0_6px_30px_rgba(0,0,0,0.08)] transition ${dragActive ? "border-blue-500 ring-2 ring-blue-100" : "border-zinc-200"}`}
        >
          {dragActive ? <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-2xl bg-blue-50/95 text-sm font-medium text-blue-700">松开即可添加图片或 Markdown</div> : null}
          {draftAttachments.length ? (
            <div className="mb-2 flex max-h-32 flex-wrap gap-2 overflow-y-auto px-1 pt-1">
              {draftAttachments.map((asset) => (
                <div key={asset.id} className="group relative">
                  <MessageAttachment attachment={{ ...toAgentAttachment(asset), fileName: asset.mime_type.startsWith("image/") && mode === "agent" ? `图${draftAttachments.filter((item) => item.mime_type.startsWith("image/")).findIndex((item) => item.id === asset.id) + 1} · ${asset.fileName || "图片"}` : asset.fileName || "附件" }} />
                  <button type="button" onClick={() => setDraftAttachments((current) => current.filter((item) => item.id !== asset.id))} className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-zinc-950 text-white shadow"><X size={11} /></button>
                </div>
              ))}
            </div>
          ) : null}
          {uploadLabel ? <p className="px-2 pb-1 text-[11px] text-zinc-400">{uploadLabel}</p> : null}
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onPaste={onPaste}
            maxLength={20000}
            placeholder={mode === "agent" ? "告诉 Agent 你想完成什么，也可以粘贴或拖入附件" : "今天我们要创作什么"}
            rows={3}
            className="max-h-44 min-h-20 w-full resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-zinc-400"
          />
          <div className="flex items-end gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={busy}>
                  <button type="button" className="composer-button font-medium" disabled={busy}>{mode === "agent" ? <Bot size={15} /> : <ImagePlus size={15} />}<span>{mode === "agent" ? "Agent" : "生图"}</span><ChevronDown size={12} /></button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-36">
                  <DropdownMenuItem onSelect={() => changeMode("agent")}><Bot /> Agent</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => changeMode("image")}><ImagePlus /> 生图</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={uploading}>
                  <button type="button" className="composer-button" disabled={uploading}>{uploading ? <Loader2 size={15} className="animate-spin" /> : <Paperclip size={15} />}<span>附件</span><ChevronDown size={12} /></button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-44">
                  <DropdownMenuItem onSelect={() => fileInput.current?.click()}><Upload /> 本地上传</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setSelectingReference(true)}><Layers /> 从画布选择</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <input ref={fileInput} hidden multiple type="file" accept="image/jpeg,image/png,image/webp,.md,text/markdown,text/plain" onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ""; void uploadFiles(files); }} />

              {mode === "agent" ? (
                <>
                  <DropdownMenu open={skillMenuOpen} onOpenChange={setSkillMenuOpen}>
                    <DropdownMenuTrigger asChild disabled={skillUploading}>
                      <button type="button" className="composer-button max-w-[140px]" disabled={skillUploading}>
                        {skillUploading ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
                        <span className="truncate">{skills.find((item) => item.id === selectedSkillId)?.name || "Skill"}</span>
                        <ChevronDown size={12} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-72 p-1">
                      <DropdownMenuItem onSelect={() => skillInput.current?.click()}>
                        <Upload /> 上传 SKILL.md
                      </DropdownMenuItem>
                      <div className="my-1 border-t" />
                      {skills.length ? skills.map((skill) => (
                        <div key={skill.id} className={`flex items-start gap-1 rounded-md px-1 py-1 ${selectedSkillId === skill.id ? "bg-zinc-100" : ""}`}>
                          <button
                            type="button"
                            className="min-w-0 flex-1 rounded-md px-2 py-1 text-left hover:bg-zinc-50"
                            onClick={() => {
                              setSelectedSkillId((current) => current === skill.id ? "" : skill.id);
                              setSkillMenuOpen(false);
                            }}
                          >
                            <span className="flex items-center gap-1 text-xs font-medium text-zinc-900">
                              {selectedSkillId === skill.id ? <Check size={12} className="shrink-0" /> : null}
                              <span className="truncate">{skill.name}</span>
                              {skill.builtin ? (
                                <span className="shrink-0 rounded bg-zinc-100 px-1 text-[10px] font-normal text-zinc-500">内置</span>
                              ) : null}
                            </span>
                            <span className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-zinc-500">{skill.description}</span>
                          </button>
                          {skill.builtin ? (
                            <span className="size-7 shrink-0" />
                          ) : (
                            <button
                              type="button"
                              className="mt-1 grid size-7 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-600"
                              title="移除技能"
                              onPointerDown={(event) => event.preventDefault()}
                              onClick={() => void removeSkill(skill.id)}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      )) : (
                        <p className="px-2 py-2 text-[11px] leading-4 text-zinc-400">还没有技能。请上传标准 SKILL.md</p>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <input
                    ref={skillInput}
                    hidden
                    type="file"
                    accept=".md,text/markdown,text/plain"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void uploadSkill(file);
                    }}
                  />
                  <span className="composer-button cursor-default text-zinc-600"><Sparkles size={14} /> Agent自动规划</span>
                </>
              ) : (
                <>
                  <div className="relative">
                    <button type="button" onClick={() => setModelOpen(!modelOpen)} className="composer-button"><ModelGlyph model={model} /> <ChevronDown size={12} /></button>
                    {modelOpen ? <div className="absolute bottom-10 left-0 z-50 w-48 rounded-xl border bg-white p-1 text-sm shadow-xl"><button type="button" onClick={() => { setModel("gpt-image-2"); setModelOpen(false); }} className="menu-item"><ModelGlyph model="gpt-image-2" /> GPT Image2</button><button type="button" onClick={() => { setModel("nano-banana-2"); setModelOpen(false); }} className="menu-item"><ModelGlyph model="nano-banana-2" /> Nano Banana2</button></div> : null}
                  </div>
                  <div className="relative">
                    <button type="button" onClick={() => setConfigOpen(!configOpen)} className="composer-button max-w-[160px]"><Settings2 size={14} /><span className="truncate">{configSummary(model, configs[model])}</span></button>
                    {configOpen ? <ConfigPopover model={model} config={configs[model]} onChange={updateConfig} onClose={() => setConfigOpen(false)} /> : null}
                  </div>
                </>
              )}
            </div>
            <button type="submit" disabled={(!prompt.trim() && !draftAttachments.length) || sending || agentRunning || !conversationId} className="ml-auto grid size-9 shrink-0 place-items-center rounded-full bg-zinc-950 text-white transition hover:bg-zinc-700 disabled:bg-zinc-200">{sending || agentRunning ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}</button>
          </div>
        </form>
      </aside>
    </main>
  );
}

function normalizeImageNode(node: Node<CanvasNodeData>, asset?: AssetRecord) {
  if (!asset?.width || !asset.height || !node.data.assetId) return node;
  const currentWidth = Number(node.width || (node.style as { width?: number } | undefined)?.width) || Math.min(320, asset.width);
  return {
    ...node,
    style: { ...node.style, width: currentWidth, height: Math.max(1, Math.round(currentWidth * asset.height / asset.width)) },
  };
}

function canvasFingerprint(nodes: Node<CanvasNodeData>[], edges: Edge[], viewport: Viewport) {
  return JSON.stringify({
    nodes: nodes.map((node) => ({ ...node, data: { ...node.data, imageUrl: undefined }, selected: undefined, dragging: undefined })),
    edges,
    viewport,
  });
}

function toAgentAttachment(asset: AssetRecord): AgentAttachment {
  const url = asset.url || `/api/assets/${asset.id}/content`;
  const markdown = asset.mime_type === "text/markdown" || asset.mime_type === "text/plain";
  return {
    id: asset.id,
    fileName: asset.fileName || (typeof asset.metadata?.originalName === "string" ? asset.metadata.originalName : asset.id),
    mimeType: asset.mime_type,
    size: asset.size ?? (typeof asset.metadata?.size === "number" ? asset.metadata.size : null),
    url,
    previewUrl: asset.previewUrl || (markdown ? `${url}?preview=1` : url),
    openUrl: asset.previewUrl || (markdown ? `${url}?preview=1` : url),
    downloadUrl: asset.downloadUrl || `${url}?download=1`,
  };
}

function reduceLiveAgent(current: LiveAgentView | undefined, event: AgentStreamEvent): LiveAgentView {
  const view = current || { content: "", thinking: "", tools: [], streaming: true };
  if (event.type === "text_delta") return { ...view, content: view.content + event.delta };
  if (event.type === "thinking_delta") return { ...view, thinking: view.thinking + event.delta };
  if (event.type === "tool_start") return { ...view, tools: [...view.tools, { id: event.toolCallId, name: event.toolName, status: "running", arguments: event.args }] };
  if (event.type === "tool_update") return { ...view, tools: view.tools.map((tool) => tool.id === event.toolCallId ? { ...tool, status: "running", result: event.result } : tool) };
  if (event.type === "tool_end") return { ...view, tools: view.tools.map((tool) => tool.id === event.toolCallId ? { ...tool, status: event.isError ? "error" : "success", ...(event.isError ? { error: event.error } : { result: event.result }) } : tool) };
  if (event.type === "done") return { ...view, content: event.content || view.content, thinking: event.thinking || view.thinking, streaming: false };
  if (event.type === "error") return { ...view, streaming: false, error: event.message };
  return view;
}

function agentView(message: MessageItem, run: AgentRunItem | undefined, events: AgentEventItem[], live?: LiveAgentView) {
  if (live) return live;
  let content = message.content || "";
  let thinking = typeof message.metadata?.thinking === "string" ? message.metadata.thinking : "";
  const toolMap = new Map<string, AgentToolCall>();
  if (run) {
    for (const event of events.filter((item) => item.run_id === run.id).sort((a, b) => a.sequence - b.sequence)) {
      const payload = event.payload || {};
      if (event.event_type === "text_delta" && !message.content) content += String(payload.delta || "");
      if (event.event_type === "thinking_delta" && !thinking) thinking += String(payload.delta || "");
      if (event.event_type === "tool_start" && event.tool_call_id) toolMap.set(event.tool_call_id, { id: event.tool_call_id, name: event.tool_name || "工具", status: "running", arguments: payload.args });
      if (event.event_type === "tool_update" && event.tool_call_id) toolMap.set(event.tool_call_id, { ...(toolMap.get(event.tool_call_id) || { id: event.tool_call_id, name: event.tool_name || "工具", status: "running" }), result: payload.result });
      if (event.event_type === "tool_end" && event.tool_call_id) toolMap.set(event.tool_call_id, { ...(toolMap.get(event.tool_call_id) || { id: event.tool_call_id, name: event.tool_name || "工具", status: "running" }), status: payload.isError ? "error" : "success", ...(payload.isError ? { error: payload.error } : { result: payload.result }) });
    }
  }
  return { content, thinking, tools: [...toolMap.values()], streaming: run?.status === "queued" || run?.status === "running", error: run?.error_message };
}

function ModelGlyph({ model }: { model: GenerationModel }) {
  return model === "gpt-image-2" ? <OpenAI size={16} /> : <NanoBanana size={16} />;
}

function configSummary(model: GenerationModel, config: GenerationConfig) {
  return model === "nano-banana-2"
    ? `${config.resolution} · ${config.aspectRatio === "auto" ? "自动" : config.aspectRatio} · ${config.outputFormat?.toUpperCase()}`
    : `${config.resolution} · ${config.aspectRatio === "auto" ? "自动" : config.aspectRatio}${config.resolution === "1K" ? ` · ${backgroundLabel(config.background)}` : ""}`;
}

function backgroundLabel(value?: string) {
  return value === "transparent" ? "透明" : value === "opaque" ? "不透明" : "自动背景";
}

function ConfigPopover({ model, config, onChange, onClose }: { model: GenerationModel; config: GenerationConfig; onChange: (value: Partial<GenerationConfig>) => void; onClose: () => void }) {
  const ratios = model === "gpt-image-2" ? GPT_RATIOS : NANO_RATIOS;
  return (
    <div className="absolute bottom-11 right-0 z-50 w-[300px] rounded-2xl border bg-white p-4 shadow-2xl">
      <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-semibold"><ModelGlyph model={model} />{model === "gpt-image-2" ? "GPT Image2" : "Nano Banana2"}</div><button type="button" onClick={onClose} className="tool-button"><X size={15} /></button></div>
      <OptionGroup label="分辨率">{(["1K", "2K", "4K"] as const).map((value) => <OptionButton key={value} active={config.resolution === value} onClick={() => onChange({ resolution: value })}>{value}</OptionButton>)}</OptionGroup>
      <OptionGroup label="画面比例"><div className="grid grid-cols-4 gap-1.5">{ratios.map((ratio) => { const disabled = model === "gpt-image-2" && ((config.resolution === "2K" && ["auto", "5:4", "4:5", "3:1", "1:3", "9:21"].includes(ratio)) || (config.resolution === "4K" && ["auto", "1:1", "3:1", "1:3", "9:21"].includes(ratio))); return <OptionButton key={ratio} active={config.aspectRatio === ratio} disabled={disabled} onClick={() => onChange({ aspectRatio: ratio })}>{ratio === "auto" ? "自动" : ratio}</OptionButton>; })}</div></OptionGroup>
      {model === "gpt-image-2" && config.resolution === "1K" ? <OptionGroup label="背景">{(["auto", "transparent", "opaque"] as const).map((value) => <OptionButton key={value} active={config.background === value} onClick={() => onChange({ background: value })}>{backgroundLabel(value)}</OptionButton>)}</OptionGroup> : null}
      {model === "nano-banana-2" ? <OptionGroup label="输出格式">{(["jpg", "png"] as const).map((value) => <OptionButton key={value} active={config.outputFormat === value} onClick={() => onChange({ outputFormat: value })}>{value.toUpperCase()}</OptionButton>)}</OptionGroup> : null}
    </div>
  );
}

function OptionGroup({ label, children }: { label: string; children: React.ReactNode }) { return <div className="mb-4 last:mb-0"><p className="mb-2 text-xs font-medium text-zinc-500">{label}</p><div className="flex flex-wrap gap-1.5">{children}</div></div>; }
function OptionButton({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" disabled={disabled} onClick={onClick} className={`min-w-12 rounded-lg border px-2 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-30 ${active ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 hover:border-zinc-400"}`}>{children}</button>; }

function GenerationMessage({ message, job, assets, onFocus, onDownload, onReference, onDelete, onRegenerate, onQuery }: { message: MessageItem; job?: JobItem; assets: AssetRecord[]; onFocus: (asset: AssetRecord) => void; onDownload: (asset: AssetRecord) => void; onReference: (asset: AssetRecord) => void; onDelete: (asset: AssetRecord) => void; onRegenerate: () => void; onQuery: () => void }) {
  const loading = job && ACTIVE_STATUSES.has(job.status);
  return (
    <article>
      <div className="mb-2 flex items-start gap-2">{message.referenceAsset?.url ? <div className="relative size-9 shrink-0 overflow-hidden rounded-lg border"><img src={message.referenceAsset.previewUrl || message.referenceAsset.url} alt="参考图" loading="lazy" decoding="async" className="size-full object-cover" /></div> : null}<div><p className="text-sm leading-6">{message.content}</p><p className="mt-1 text-[11px] text-zinc-400">{message.model === "nano-banana-2" ? "Nano Banana2" : "GPT Image2"} · {message.config ? configSummary((message.model as GenerationModel) || "gpt-image-2", message.config) : ""}</p></div></div>
      {loading ? <div className="grid aspect-square max-h-72 w-full place-items-center rounded-2xl bg-zinc-100"><div className="text-center"><Loader2 className="mx-auto animate-spin" /><p className="mt-3 text-xs text-zinc-400">正在生成图片…</p></div></div> : null}
      {job && ["fail", "timeout"].includes(job.status) ? <div className="rounded-xl bg-red-50 p-3 text-xs text-red-600"><p>{job.error_message || "生成失败"}</p><div className="mt-2 flex gap-3">{job.status === "timeout" ? <button onClick={onQuery} className="inline-flex items-center gap-1 font-medium"><RefreshCw size={13} /> 重新查询</button> : null}<button onClick={onRegenerate} className="inline-flex items-center gap-1 font-medium"><RefreshCw size={13} /> 重新生成</button></div></div> : null}
      {assets.map((asset) => <GeneratedAssetCard key={asset.id} asset={asset} onFocus={onFocus} onDownload={onDownload} onReference={onReference} onDelete={onDelete} onRetry={onRegenerate} />)}
    </article>
  );
}

function GeneratedAssetCard({ asset, onFocus, onDownload, onReference, onDelete, onRetry }: { asset: AssetRecord; onFocus: (asset: AssetRecord) => void; onDownload: (asset: AssetRecord) => void; onReference: (asset: AssetRecord) => void; onDelete: (asset: AssetRecord) => void; onRetry?: () => void }) {
  return <div className="mb-3"><button type="button" onClick={() => onFocus(asset)} className="relative block w-full overflow-hidden rounded-2xl border bg-zinc-50" title="在画布中定位"><img src={asset.previewUrl || asset.url} alt="生成结果" loading="lazy" decoding="async" className="max-h-[440px] w-full object-contain" /></button><div className="mt-2 flex items-center gap-1 text-zinc-500"><button onClick={() => onDownload(asset)} className="result-button" title="下载"><Download size={14} /></button>{onRetry ? <button onClick={onRetry} className="result-button" title="使用原参数重新生成"><RefreshCw size={14} /></button> : null}<button onClick={() => onReference(asset)} className="result-button" title="加入输入框参考图"><ImagePlus size={14} /></button><button onClick={() => onDelete(asset)} className="result-button hover:!text-red-500" title="从素材库删除"><Trash2 size={14} /></button></div></div>;
}
