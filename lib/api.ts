import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export function apiError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export async function getRequestContext() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (error || typeof userId !== "string") return null;
  return { supabase, userId };
}

export function safeTitle(prompt: string) {
  const title = prompt.replace(/\s+/g, " ").trim();
  return title.slice(0, 48) || "Untitled";
}
