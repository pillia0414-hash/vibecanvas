"use client";

import { ArrowUp, ImagePlus, Loader2, Plus, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";

import type { ProjectSummary } from "@/lib/app-types";

export function ProtectedHome() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/projects?limit=4")
      .then(async (response) => {
        if (!response.ok) throw new Error("加载最近项目失败");
        return response.json();
      })
      .then((payload) => setProjects(payload.projects))
      .catch((caught) => setError(caught.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!file) return setPreview(undefined);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type)) {
      setError("仅支持 JPEG、PNG 或 WebP 图片");
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setError("图片不能超过 10MB");
      return;
    }
    setError("");
    setFile(selected);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      const projectResponse = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled" }),
      });
      const projectPayload = await projectResponse.json();
      if (!projectResponse.ok) throw new Error(projectPayload.error || "创建项目失败");
      const projectId = projectPayload.project.id as string;
      let referenceAssetId: string | undefined;
      if (file) {
        const form = new FormData();
        form.set("file", file);
        const uploadResponse = await fetch(`/api/projects/${projectId}/assets`, { method: "POST", body: form });
        const uploadPayload = await uploadResponse.json();
        if (!uploadResponse.ok) throw new Error(uploadPayload.error || "上传参考图失败");
        referenceAssetId = uploadPayload.asset.id;
      }
      await fetch("/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          conversationId: projectPayload.conversation.id,
          prompt: prompt.trim(),
          model: "gpt-image-2",
          config: { resolution: "1K", aspectRatio: "auto", background: "auto" },
          referenceAssetId,
        }),
      });
      router.push(`/canvas?projectId=${projectId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败，请重试");
      setSending(false);
    }
  }

  async function createEmptyProject() {
    if (sending) return;
    setSending(true);
    const response = await fetch("/api/projects", { method: "POST" });
    const payload = await response.json();
    if (response.ok) router.push(`/canvas?projectId=${payload.project.id}`);
    else {
      setError(payload.error || "创建项目失败");
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1480px] flex-col px-6 pb-14 pt-7 md:px-12">
      <div className="flex justify-end text-sm text-zinc-500">
        <Link href="/projects" className="transition hover:text-zinc-950">全部项目</Link>
      </div>
      <section className="mx-auto mt-[14vh] w-full max-w-[680px]">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">把灵感变成画面</h1>
          <p className="mt-2 text-sm text-zinc-400">描述你想创造的内容，让 AI 帮你展开想象</p>
        </div>
        <form onSubmit={submit} className="rounded-3xl border border-zinc-200 bg-white p-3 shadow-[0_10px_35px_rgba(0,0,0,0.06)]">
          {preview ? (
            <div className="relative mb-2 size-20 overflow-hidden rounded-xl border bg-zinc-50">
              <Image src={preview} alt="参考图预览" fill unoptimized className="object-cover" />
              <button type="button" onClick={() => setFile(null)} className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-black/70 text-white" aria-label="移除参考图"><X size={12} /></button>
            </div>
          ) : null}
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            maxLength={20000}
            rows={3}
            placeholder="描述你想生成的图片，例如：一张温馨的咖啡厅风格菜单海报"
            className="min-h-24 w-full resize-none bg-transparent px-2 py-1 text-[15px] outline-none placeholder:text-zinc-400"
          />
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => fileInput.current?.click()} className="grid size-9 place-items-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950" aria-label="上传参考图">
              {file ? <ImagePlus size={18} /> : <Plus size={20} />}
            </button>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={chooseFile} />
            <button type="submit" disabled={!prompt.trim() || sending} className="grid size-9 place-items-center rounded-full bg-zinc-950 text-white transition enabled:hover:bg-zinc-700 disabled:bg-zinc-200" aria-label="开始生成">
              {sending ? <Loader2 size={17} className="animate-spin" /> : <ArrowUp size={18} />}
            </button>
          </div>
        </form>
        {error ? <p className="mt-3 text-center text-sm text-red-500">{error}</p> : null}
      </section>

      <section className="mt-auto pt-24">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold">最近项目</h2>
          <Link href="/projects" className="text-sm text-zinc-400 transition hover:text-zinc-950">查看全部 <span aria-hidden>›</span></Link>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <button onClick={createEmptyProject} className="group text-left" disabled={sending}>
            <div className="grid aspect-[1.65] place-items-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 text-zinc-400 transition group-hover:border-zinc-500 group-hover:text-zinc-800"><Plus /></div>
            <p className="mt-2 text-sm">新建项目</p>
          </button>
          {loading ? Array.from({ length: 4 }).map((_, index) => <div key={index} className="aspect-[1.65] animate-pulse rounded-xl bg-zinc-100" />) : projects.map((project) => (
            <Link key={project.id} href={`/canvas?projectId=${project.id}`} className="group min-w-0">
              <div className="relative aspect-[1.65] overflow-hidden rounded-xl border bg-zinc-100">
                {project.coverUrl ? <Image src={project.coverUrl} alt="" fill unoptimized className="object-cover transition duration-300 group-hover:scale-[1.02]" /> : null}
              </div>
              <p className="mt-2 truncate text-sm">{project.title}</p>
              <p className="mt-0.5 text-xs text-zinc-400">更新于 {formatDate(project.updated_at)}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
