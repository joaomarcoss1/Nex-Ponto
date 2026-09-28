"use client";

import { apiErrorFromPayload } from "@/lib/client/api-error";
import { classifyAdminAuthFailure } from "@/lib/client/admin-auth-state";

type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

const adminMemoryCache = new Map<string, CacheEntry>();
const adminInFlightRequests = new Map<string, Promise<unknown>>();
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

let redirectingToLogin = false;

function redirectToAdminLogin() {
  if (redirectingToLogin || typeof window === "undefined") return;
  redirectingToLogin = true;
  window.sessionStorage.removeItem("nexponto_admin_profile");
  window.sessionStorage.removeItem("nexponto_admin_profile_cached_at");
  clearAdminApiCache();
  fetch("/api/auth/admin-logout", { method: "POST", cache: "no-store" }).catch(() => undefined);
  if (!window.location.pathname.startsWith("/admin/login")) {
    window.location.href = "/admin/login";
  }
}

export function clearAdminApiCache(prefix?: string) {
  if (!prefix) {
    adminMemoryCache.clear();
    adminInFlightRequests.clear();
    return;
  }
  [...adminMemoryCache.keys()].forEach((key) => {
    if (key.includes(prefix)) adminMemoryCache.delete(key);
  });
}

export function prefetchAdmin(path: string) {
  adminFetch(path).catch(() => undefined);
}

let refreshInFlight: Promise<boolean> | null = null;

/** One shared refresh attempt even if several requests 401 at once. */
function refreshAdminSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch("/api/auth/admin-refresh", { method: "POST", cache: "no-store" })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function rawAdminFetch(path: string, init: RequestInit) {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30_000);
  const externalSignal = init.signal;
  const abortFromExternal = () => controller.abort();
  externalSignal?.addEventListener("abort", abortFromExternal, { once: true });

  try {
    // The admin session lives in an httpOnly cookie, sent automatically on
    // this same-origin request — no token for client JS to hold or attach.
    return await fetch(path, { ...init, headers, signal: controller.signal, cache: "no-store" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("A operação demorou demais. Verifique a conexão e tente novamente.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
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
    let response = await rawAdminFetch(path, init);

    if (response.status === 401 && !redirectingToLogin) {
      const probePayload = await response.clone().json().catch(() => null);
      const probeCode = probePayload?.error?.code || probePayload?.code;
      // Only an expired-access-token style 401 is worth a silent retry — not
      // "no session at all" or "MFA required", which a refresh can't fix.
      if (probeCode === "AUTH_SESSION_INVALID" && (await refreshAdminSession())) {
        response = await rawAdminFetch(path, init);
      }
    }

    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    if (!response.ok) {
      const apiError = apiErrorFromPayload(data, response.status, "Não foi possível concluir a operação administrativa.");
      if (classifyAdminAuthFailure(apiError.status, apiError.code) === "login") {
        redirectToAdminLogin();
      }
      throw apiError;
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

function throwDownloadApiError(payload: unknown, status: number, fallback: string): never {
  const apiError = apiErrorFromPayload(payload, status, fallback);
  if (classifyAdminAuthFailure(apiError.status, apiError.code) === "login") {
    redirectToAdminLogin();
  }
  throw apiError;
}

export async function downloadAdminFile(path: string, filename: string) {
  const response = await fetchAdminDownload(path, {});
  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const payload = await response.json().catch(() => null);
      throwDownloadApiError(payload, response.status, "Não foi possível gerar o arquivo.");
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
  const response = await fetchAdminDownload(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const payload = await response.json().catch(() => null);
      throwDownloadApiError(payload, response.status, "Não foi possível gerar o arquivo.");
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
