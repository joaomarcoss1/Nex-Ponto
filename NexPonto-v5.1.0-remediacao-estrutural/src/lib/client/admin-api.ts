"use client";

import {
  getBrowserAdminSession,
  getBrowserSupabaseConfigStatus,
} from "@/lib/client/supabase";

type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

const adminMemoryCache = new Map<string, CacheEntry>();
const adminInFlightRequests = new Map<string, Promise<unknown>>();
let cachedAccessToken: { token: string; expiresAt: number } | null = null;
const DEFAULT_GET_CACHE_MS = 45_000;
const STATIC_OPTIONS_CACHE_MS = 5 * 60_000;

function cacheTtlFor(path: string) {
  if (path.includes("/api/admin/options/") || path.includes("/api/admin/me"))
    return STATIC_OPTIONS_CACHE_MS;
  if (path.includes("/api/admin/dashboard")) return 30_000;
  if (path.includes("/api/admin/payroll")) return 20_000;
  return DEFAULT_GET_CACHE_MS;
}

function shouldUseCache(path: string, init: RequestInit) {
  const method = (init.method || "GET").toUpperCase();
  if (method !== "GET") return false;
  if (
    path.includes("format=pdf") ||
    path.includes("format=xlsx") ||
    path.includes("/export")
  )
    return false;
  return true;
}

export function clearAdminApiCache(prefix?: string) {
  if (!prefix) {
    adminMemoryCache.clear();
    return;
  }
  [...adminMemoryCache.keys()].forEach((key) => {
    if (key.includes(prefix)) adminMemoryCache.delete(key);
  });
}

export function prefetchAdmin(path: string) {
  adminFetch(path).catch(() => undefined);
}

async function getAdminAccessToken() {
  const config = getBrowserSupabaseConfigStatus();
  if (!config.configured) throw new Error(config.message);

  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 30_000) {
    return cachedAccessToken.token;
  }

  const {
    data: { session },
  } = await getBrowserAdminSession();

  if (!session?.access_token) {
    cachedAccessToken = null;
    throw new Error("Sessão administrativa expirada. Entre novamente.");
  }

  cachedAccessToken = {
    token: session.access_token,
    expiresAt: session.expires_at ? session.expires_at * 1000 : Date.now() + 4 * 60_000,
  };
  return session.access_token;
}

export async function adminFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const cacheKey = `${method}:${path}`;
  const cacheable = shouldUseCache(path, init);

  if (cacheable) {
    const entry = adminMemoryCache.get(cacheKey);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.value as T;
    }
    const existingRequest = adminInFlightRequests.get(cacheKey);
    if (existingRequest) return existingRequest as Promise<T>;
  }

  const requestPromise = (async () => {
    const token = await getAdminAccessToken();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    const externalSignal = init.signal;
    const abortFromExternal = () => controller.abort();
    externalSignal?.addEventListener("abort", abortFromExternal, { once: true });

    try {
      const response = await fetch(path, {
        ...init,
        headers,
        signal: controller.signal,
        cache: "no-store",
      });

      const contentType = response.headers.get("content-type") || "";
      const data = contentType.includes("application/json")
        ? await response.json()
        : await response.text();
      if (!response.ok) {
        const message =
          typeof data === "object" && data && "error" in data
            ? String(data.error)
            : "Erro na operação administrativa.";
        throw new Error(message);
      }

      if (cacheable) {
        adminMemoryCache.set(cacheKey, {
          value: data,
          expiresAt: Date.now() + cacheTtlFor(path),
        });
      } else if (method !== "GET") {
        clearAdminApiCache();
      }
      return data as T;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("A operação demorou demais. Verifique a conexão e tente novamente.");
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    }
  })();

  if (cacheable) adminInFlightRequests.set(cacheKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    if (cacheable) adminInFlightRequests.delete(cacheKey);
  }
}


async function fetchAdminDownload(path: string, init: RequestInit, timeoutMs = 90_000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = init.signal;
  const abortFromExternal = () => controller.abort();
  externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  try {
    return await fetch(path, { ...init, signal: controller.signal, cache: "no-store" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("A geração do arquivo excedeu o tempo limite. Reduza o período ou os filtros e tente novamente.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}

export async function downloadAdminFile(path: string, filename: string) {
  const config = getBrowserSupabaseConfigStatus();
  if (!config.configured) throw new Error(config.message);

  const {
    data: { session },
  } = await getBrowserAdminSession();
  if (!session?.access_token)
    throw new Error("Sessão administrativa expirada.");

  const response = await fetchAdminDownload(path, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || "Não foi possível gerar o arquivo.");
    }
    const text = await response.text().catch(() => "");
    throw new Error(text || "Não foi possível gerar o arquivo.");
  }
  const blob = await response.blob();
  if (!blob.size)
    throw new Error(
      "O arquivo foi gerado vazio. Verifique os filtros e tente novamente.",
    );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadAdminPostFile(
  path: string,
  body: unknown,
  filename: string,
) {
  const config = getBrowserSupabaseConfigStatus();
  if (!config.configured) throw new Error(config.message);

  const {
    data: { session },
  } = await getBrowserAdminSession();
  if (!session?.access_token)
    throw new Error("Sessão administrativa expirada.");

  const response = await fetchAdminDownload(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || "Não foi possível gerar o arquivo.");
    }
    throw new Error(
      (await response.text().catch(() => "")) ||
        "Não foi possível gerar o arquivo.",
    );
  }
  const blob = await response.blob();
  if (!blob.size) throw new Error("O arquivo foi gerado vazio.");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
