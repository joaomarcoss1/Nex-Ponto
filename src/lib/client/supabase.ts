"use client";

import { createClient } from "@supabase/supabase-js";

let browserClient: ReturnType<typeof createClient> | null = null;

export function getBrowserSupabaseConfigStatus() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured =
    Boolean(url && anonKey) &&
    !url?.includes("seu-projeto") &&
    !anonKey?.includes("sua-chave") &&
    anonKey !== "missing-anon-key";

  return {
    configured,
    message: configured
      ? ""
      : "Ambiente indisponível para login e dados reais. Contate o suporte da plataforma."
  };
}

export function createBrowserSupabaseClient() {
  if (browserClient) return browserClient;

  browserClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://invalid.supabase.co", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "missing-anon-key", {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });

  return browserClient;
}

export async function getBrowserAdminSession(timeoutMs = 5000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      createBrowserSupabaseClient().auth.getSession(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Tempo esgotado ao validar sessão administrativa.")), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
