import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const SUPPORT_SESSION_COOKIE = "nexponto-support-session";

function secret() {
  const value = process.env.TENANT_CONTEXT_SECRET;
  if (!value || value.length < 32) throw new Error("TENANT_CONTEXT_SECRET inválido.");
  return value;
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSupportSessionToken(sessionId: string, userId: string) {
  const payload = `${sessionId}.${userId}`;
  return `${payload}.${signature(payload)}`;
}

export function readSupportSessionToken(request: NextRequest, expectedUserId: string) {
  const token = request.cookies.get(SUPPORT_SESSION_COOKIE)?.value || "";
  const [sessionId, userId, received] = token.split(".");
  if (!sessionId || userId !== expectedUserId || !received) return null;
  const payload = `${sessionId}.${userId}`;
  const expected = signature(payload);
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) return null;
  return /^[0-9a-f-]{36}$/i.test(sessionId) ? sessionId : null;
}

type SupportSessionRow = {
  id: string;
  tenant_id: string;
  reason: string;
  expires_at: string;
  status: string;
  scope: string[] | null;
  tenants: { id: string; slug: string; display_name: string; status: string } | Array<{ id: string; slug: string; display_name: string; status: string }> | null;
};

export async function resolveActiveSupportSession(
  request: NextRequest,
  supabase: SupabaseClient,
  userId: string,
  platformSuperadminId: string,
) {
  const sessionId = readSupportSessionToken(request, userId);
  if (!sessionId) return null;
  const { data } = await supabase
    .from("support_access_sessions")
    .select("id,tenant_id,reason,expires_at,status,scope,tenants!inner(id,slug,display_name,status)")
    .eq("id", sessionId)
    .eq("platform_superadmin_id", platformSuperadminId)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data) return null;
  const row = data as SupportSessionRow;
  const tenant = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
  if (!tenant || ["suspended", "cancelled", "archived"].includes(tenant.status)) return null;
  return { ...row, tenant };
}

