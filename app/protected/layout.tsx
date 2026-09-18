import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login");
  return <main className="min-h-screen bg-white text-zinc-950">{children}</main>;
}
