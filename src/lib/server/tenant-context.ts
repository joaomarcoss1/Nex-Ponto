import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const ACTIVE_TENANT_COOKIE = "nexponto_active_tenant";

function tenantSecret() {
  const explicit = process.env.TENANT_CONTEXT_SECRET;
  if (explicit && explicit.length >= 32) return explicit;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("TENANT_CONTEXT_SECRET não configurado.");
  return createHmac("sha256", serviceKey).update("nexponto-tenant-context-v4").digest("hex");
}

function signature(tenantId: string, userId: string) {
  return createHmac("sha256", tenantSecret()).update(`${tenantId}:${userId}`).digest("base64url");
}

export function encodeTenantCookie(tenantId: string, userId: string) {
  return `${tenantId}.${signature(tenantId, userId)}`;
}

export function decodeTenantCookie(value: string | undefined, userId: string): string | null {
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;
  const tenantId = value.slice(0, separator);
  const supplied = value.slice(separator + 1);
  const expected = signature(tenantId, userId);
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (suppliedBuffer.length !== expectedBuffer.length) return null;
  return timingSafeEqual(suppliedBuffer, expectedBuffer) ? tenantId : null;
}

export function requestedTenantId(request: NextRequest, userId: string) {
  return decodeTenantCookie(request.cookies.get(ACTIVE_TENANT_COOKIE)?.value, userId);
}

export function setTenantCookie(response: NextResponse, tenantId: string, userId: string) {
  response.cookies.set(ACTIVE_TENANT_COOKIE, encodeTenantCookie(tenantId, userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 12
  });
}

export function clearTenantCookie(response: NextResponse) {
  response.cookies.set(ACTIVE_TENANT_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0
  });
}
