import Link from "next/link";

import { cn } from "@/lib/utils";

export function BrandMark({ withName = true, className }: { withName?: boolean; className?: string }) {
  return (
    <Link href="/protected" className={cn("inline-flex items-center gap-2 font-semibold", className)} aria-label="返回首页">
      <span className="grid size-7 place-items-center rounded-full bg-zinc-950 text-[11px] font-bold text-white">AI</span>
      {withName ? <span>Canvas AI</span> : null}
    </Link>
  );
}
