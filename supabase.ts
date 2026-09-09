"use client";

import { createClient } from "@supabase/supabase-js";

type BrowserRuntimeConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  appUrl?: string;
  requestId?: string;
};

type RuntimeConfigStatus = {
  configured: boolean;
  loading: boolean;
  message: string;
  requestId?: string;
};

let browserClient: ReturnType<typeof createClient> | null = null;
let browserClientKey = "";
let cachedConfig: BrowserRuntimeConfig | null = null;
let configPromise: Promise<BrowserRuntimeConfig> | null = null;
let lastStatus: RuntimeConfigStatus = {
  configured: false,
  loading: true,
  message: "Preparando ambiente...",
};

function staticPublicConfig(): BrowserRuntimeConfig | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!isValidSupabaseUrl(supabaseUrl) || !isValidAnonKey(supabaseAnonKey)) return null;
  return { supabaseUrl: supabaseUrl!, supabaseAnonKey: supabaseAnonKey!, appUrl };
}

function isValidSupabaseUrl(value?: string) {
  if (!value || value.includes("seu-projeto")) return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function isValidAnonKey(value?: string) {
  return Boolean(value && value.length >= 20 && !value.includes("sua-chave") && value !== "missing-anon-key");
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

function setStatusFromConfig(config: BrowserRuntimeConfig) {
  lastStatus = {
    configured: true,
    loading: false,
    message: "",
    requestId: config.requestId,
  };
}

function setStatusFromFailure(message: string, requestId?: string) {
  lastStatus = {
    configured: false,
    loading: false,
    message,
    requestId,
  };
}

export function getBrowserSupabaseConfigStatus() {
  return lastStatus;
}

export function getCachedBrowserSupabaseConfig() {
  return cachedConfig;
}

export async function loadBrowserSupabaseConfig(options: {
  force?: boolean;
  timeoutMs?: number;
  retries?: number;
} = {}) {
  if (cachedConfig && !options.force) {
    setStatusFromConfig(cachedConfig);
    return cachedConfig;
  }

  const staticConfig = staticPublicConfig();
  if (staticConfig && !options.force) {
    cachedConfig = staticConfig;
    setStatusFromConfig(staticConfig);
    return staticConfig;
  }

  if (configPromise && !options.force) return configPromise;

  const timeoutMs = options.timeoutMs ?? 5000;
  const retries = options.retries ?? 1;
  lastStatus = {
    configured: false,
    loading: true,
    message: "Preparando ambiente...",
  };

  configPromise = (async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await fetchWithTimeout("/api/public/runtime-config", timeoutMs);
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw Object.assign(new Error(payload?.message || "Ambiente administrativo indisponível."), {
            requestId: payload?.requestId,
          });
        }
        if (!isValidSupabaseUrl(payload?.supabaseUrl) || !isValidAnonKey(payload?.supabaseAnonKey)) {
          throw Object.assign(new Error("Ambiente administrativo inválido."), {
            requestId: payload?.requestId,
          });
        }
        cachedConfig = {
          supabaseUrl: payload.supabaseUrl,
          supabaseAnonKey: payload.supabaseAnonKey,
          appUrl: payload.appUrl,
          requestId: payload.requestId,
        };
        setStatusFromConfig(cachedConfig);
        return cachedConfig;
      } catch (cause) {
        lastError = cause;
        if (attempt < retries) await new Promise((resolve) => window.setTimeout(resolve, 350));
      }
    }
    const error = lastError instanceof Error ? lastError : new Error("Ambiente administrativo indisponível.");
    const requestId = "requestId" in error ? String((error as Error & { requestId?: unknown }).requestId || "") : undefined;
    setStatusFromFailure(`${error.message}${requestId ? ` requestId: ${requestId}` : ""}`, requestId);
    throw error;
  })();

  try {
    return await configPromise;
  } finally {
    configPromise = null;
  }
}

export async function createBrowserSupabaseClient() {
  const config = await loadBrowserSupabaseConfig();
  const key = `${config.supabaseUrl}:${config.supabaseAnonKey}`;
  if (browserClient && browserClientKey === key) return browserClient;

  browserClientKey = key;
  browserClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  return browserClient;
}

export async function getBrowserAdminSession(timeoutMs = 5000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const supabase = await createBrowserSupabaseClient();
    return await Promise.race([
      supabase.auth.getSession(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Tempo esgotado ao validar sessão administrativa.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
