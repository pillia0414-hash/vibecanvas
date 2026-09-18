import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-zinc-50 px-6 text-center">
      <div><p className="text-7xl font-semibold tracking-tight">404</p><h1 className="mt-5 text-xl font-medium">找不到这个项目</h1><p className="mt-2 text-sm text-zinc-500">项目可能已被删除，或你没有访问权限。</p><Link href="/projects" className="mt-7 inline-flex rounded-full bg-zinc-950 px-5 py-2.5 text-sm text-white">返回项目列表</Link></div>
    </main>
  );
}
