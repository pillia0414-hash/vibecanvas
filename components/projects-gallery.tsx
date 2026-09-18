"use client";

import { ArrowLeft, Loader2, MoreHorizontal, Plus, RefreshCw } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ProjectSummary } from "@/lib/app-types";

export function ProjectsGallery() {
  const router = useRouter();
  const sentinel = useRef<HTMLDivElement>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");
  const [menuId, setMenuId] = useState<string>();

  const loadProjects = useCallback(async (reset = false) => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const offset = reset ? 0 : projects.length;
      const response = await fetch(`/api/projects?offset=${offset}&limit=24`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "加载项目失败");
      setProjects((current) => reset ? payload.projects : [...current, ...payload.projects]);
      setHasMore(payload.hasMore);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载项目失败");
    } finally {
      setLoading(false);
    }
  }, [loading, projects.length]);

  useEffect(() => { void loadProjects(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const target = sentinel.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore && !loading && projects.length) void loadProjects();
    }, { rootMargin: "300px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadProjects, loading, projects.length]);

  async function createProject() {
    setCreating(true);
    const response = await fetch("/api/projects", { method: "POST" });
    const payload = await response.json();
    if (response.ok) router.push(`/canvas?projectId=${payload.project.id}`);
    else {
      setError(payload.error || "创建项目失败");
      setCreating(false);
    }
  }

  async function renameProject(project: ProjectSummary) {
    setMenuId(undefined);
    const nextTitle = window.prompt("项目名称", project.title)?.trim();
    if (!nextTitle || nextTitle === project.title) return;
    const response = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: nextTitle }),
    });
    const payload = await response.json();
    if (response.ok) setProjects((current) => current.map((item) => item.id === project.id ? { ...item, title: payload.project.title, updated_at: payload.project.updated_at } : item));
    else setError(payload.error || "重命名失败");
  }

  async function deleteProject(project: ProjectSummary) {
    setMenuId(undefined);
    if (!window.confirm(`确定删除“${project.title}”吗？此操作无法撤销。`)) return;
    const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    const payload = await response.json();
    if (response.ok) setProjects((current) => current.filter((item) => item.id !== project.id));
    else setError(payload.error || "删除项目失败");
  }

  return (
    <main className="min-h-screen bg-white px-5 py-8 text-zinc-950 md:px-10">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/protected" className="grid size-9 place-items-center rounded-full transition hover:bg-zinc-100" aria-label="返回"><ArrowLeft size={19} /></Link>
          <h1 className="text-2xl font-semibold">项目</h1>
        </div>
        <button onClick={createProject} disabled={creating} className="inline-flex h-10 items-center gap-2 rounded-full bg-zinc-950 px-5 text-sm text-white transition hover:bg-zinc-800 disabled:opacity-50">
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={17} />} 新建项目
        </button>
      </header>
      {error ? (
        <div className="mb-5 flex items-center justify-between rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          <span>{error}</span><button onClick={() => loadProjects(true)} className="inline-flex items-center gap-1 font-medium"><RefreshCw size={14} /> 重试</button>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <button onClick={createProject} disabled={creating} className="group text-left">
          <div className="grid aspect-[1.65] place-items-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 text-zinc-400 transition group-hover:border-zinc-600 group-hover:text-zinc-900"><Plus /></div>
          <p className="mt-2 text-sm">新建项目</p>
        </button>
        {projects.map((project) => (
          <article key={project.id} className="group relative min-w-0">
            <Link href={`/canvas?projectId=${project.id}`}>
              <div className="relative aspect-[1.65] overflow-hidden rounded-xl border bg-zinc-100">
                {project.coverUrl ? <Image src={project.coverUrl} alt="" fill unoptimized className="object-cover transition duration-300 group-hover:scale-[1.02]" /> : null}
              </div>
              <p className="mt-2 truncate pr-8 text-sm">{project.title}</p>
              <p className="mt-0.5 text-xs text-zinc-400">更新于 {formatDate(project.updated_at)}</p>
            </Link>
            <button onClick={() => setMenuId(menuId === project.id ? undefined : project.id)} className="absolute bottom-4 right-1 grid size-7 place-items-center rounded-full bg-white text-zinc-500 opacity-0 shadow-sm transition group-hover:opacity-100" aria-label="项目操作"><MoreHorizontal size={16} /></button>
            {menuId === project.id ? (
              <div className="absolute bottom-10 right-0 z-20 w-28 rounded-xl border bg-white p-1 text-sm shadow-lg">
                <button onClick={() => renameProject(project)} className="w-full rounded-lg px-3 py-2 text-left hover:bg-zinc-100">重命名</button>
                <button onClick={() => deleteProject(project)} className="w-full rounded-lg px-3 py-2 text-left text-red-600 hover:bg-red-50">删除</button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {!loading && !projects.length && !error ? <div className="py-24 text-center text-sm text-zinc-400">还没有项目，创建一个开始吧</div> : null}
      <div ref={sentinel} className="grid h-24 place-items-center">{loading ? <Loader2 className="animate-spin text-zinc-400" /> : null}</div>
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
