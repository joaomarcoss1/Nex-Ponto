"use client";

import { apiErrorFromPayload } from "@/lib/client/api-error";

const STORAGE_KEY = "nexponto_public_access";

function accessCodeFromLocation() {
  if (typeof window === "undefined") return "";
  const fromQuery = new URLSearchParams(window.location.search).get("empresa")?.trim().toLowerCase() || new URLSearchParams(window.location.search).get("tenant")?.trim().toLowerCase() || "";
  if (fromQuery) {
    window.localStorage.setItem(STORAGE_KEY, fromQuery);
    return fromQuery;
  }
  return window.localStorage.getItem(STORAGE_KEY) || "";
}

export function getPublicTenantSlug() {
  return accessCodeFromLocation();
}

export function setPublicTenantSlug(slug: string) {
  if (typeof window === "undefined") return;
  if (slug) window.localStorage.setItem(STORAGE_KEY, slug.trim().toLowerCase());
  else window.localStorage.removeItem(STORAGE_KEY);
}

export async function publicFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const accessCode = accessCodeFromLocation();
  if (accessCode) headers.set("X-NexPonto-Tenant", accessCode);
  return fetch(input, { ...init, headers });
}

export async function publicJson<T>(input: RequestInfo | URL, init: RequestInit = {}): Promise<T> {
  const response = await publicFetch(input, init);
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof payload === "object" && payload && "error" in payload
      ? String((payload as { error: unknown }).error)
      : "Não foi possível concluir a operação.";
    void message;
    throw apiErrorFromPayload(payload, response.status, "Não foi possível concluir a operação.");
  }
  return payload as T;
}
