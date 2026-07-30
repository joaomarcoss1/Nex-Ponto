import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requirePlatformSuperadmin } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import {
  createSupportSessionToken,
  readSupportSessionToken,
  SUPPORT_SESSION_COOKIE,
} from "@/lib/server/support-session";
import { hasMfaAssurance } from "@/lib/security/mfa";
import { SUPPORT_SCOPES, supportScopeRequiresStepUp } from "@/lib/security/support-scopes";
import { getClientIp } from "@/lib/server/pin";
import { privacyHash } from "@/lib/server/rate-limit";

const createSchema = z.object({
  tenantId: z.string().uuid(),
  reason: z.string().trim().min(10).max(500),
  durationMinutes: z.coerce.number().int().min(5).max(120).default(30),
  scope: z.array(z.enum(SUPPORT_SCOPES)).min(1).max(4).default(["support_read"]),
  stepUpConfirmed: z.boolean().default(false),
});

export async function GET(request: NextRequest) {
  const auth = await requirePlatformSuperadmin(request);
  if ("error" in auth) return auth.error;
  const { data, error } = await auth.supabase
    .from("support_access_sessions")
    .select("id,tenant_id,reason,scope,starts_at,expires_at,ended_at,status,created_at,tenants(display_name,slug)")
    .eq("platform_superadmin_id", auth.context.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return fail("Erro ao carregar sessões de suporte.", 500, error.message);
  return ok({ sessions: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await requirePlatformSuperadmin(request);
  if ("error" in auth) return auth.error;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Revise a sessão de suporte.", 422, parsed.error.flatten());
  if (!hasMfaAssurance(auth.token)) return fail("Confirme o MFA antes de iniciar uma sessão de suporte.", 403, { code: "MFA_REQUIRED" });
  if (supportScopeRequiresStepUp(parsed.data.scope) && !parsed.data.stepUpConfirmed) {
    return fail("O escopo financeiro ou integral exige confirmação adicional.", 422, { code: "STEP_UP_REQUIRED" });
  }
  if (parsed.data.scope.includes("full_access") && parsed.data.scope.length > 1) {
    return fail("full_access deve ser solicitado isoladamente.", 422);
  }
  const { data: tenant } = await auth.supabase
    .from("tenants")
    .select("id,display_name,status")
    .eq("id", parsed.data.tenantId)
    .maybeSingle();
  if (!tenant || ["suspended", "cancelled", "archived"].includes(tenant.status)) {
    return fail("Empresa indisponível para suporte.", 422);
  }
  const expiresAt = new Date(Date.now() + parsed.data.durationMinutes * 60_000).toISOString();
  const { data, error } = await auth.supabase.from("support_access_sessions").insert({
    tenant_id: tenant.id,
    platform_superadmin_id: auth.context.id,
    reason: parsed.data.reason,
    scope: parsed.data.scope,
    starts_at: new Date().toISOString(),
    expires_at: expiresAt,
    status: "active",
    mfa_verified: true,
    approved_by: auth.user.id,
    approved_at: new Date().toISOString(),
    step_up_verified_at: parsed.data.stepUpConfirmed ? new Date().toISOString() : null,
    request_id: request.headers.get("x-request-id") || crypto.randomUUID(),
    ip_hash: privacyHash(getClientIp(request.headers)),
    user_agent: request.headers.get("user-agent")?.slice(0, 500) || null,
  }).select("id,tenant_id,reason,scope,starts_at,expires_at,status").single();
  if (error) return fail("Erro ao iniciar acesso de suporte.", 500, error.message);
  await auth.supabase.from("platform_audit_logs").insert({
    actor_user_id: auth.user.id,
    tenant_id: tenant.id,
    action: "support_session_started",
    resource_type: "support_access_session",
    resource_id: data.id,
    request_id: request.headers.get("x-request-id") || crypto.randomUUID(),
    metadata: { reason: parsed.data.reason, scope: parsed.data.scope, expiresAt },
  });
  const response = ok({ session: data, tenant: { id: tenant.id, displayName: tenant.display_name } }, { status: 201 });
  response.cookies.set(SUPPORT_SESSION_COOKIE, createSupportSessionToken(data.id, auth.user.id), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
  return response;
}

export async function DELETE(request: NextRequest) {
  const auth = await requirePlatformSuperadmin(request);
  if ("error" in auth) return auth.error;
  const sessionId = readSupportSessionToken(request, auth.user.id);
  if (sessionId) {
    await auth.supabase.from("support_access_sessions").update({
      status: "revoked",
      ended_at: new Date().toISOString(),
    }).eq("id", sessionId).eq("platform_superadmin_id", auth.context.id);
    await auth.supabase.from("platform_audit_logs").insert({
      actor_user_id: auth.user.id,
      action: "support_session_revoked",
      resource_type: "support_access_session",
      resource_id: sessionId,
      metadata: {},
    });
  }
  const response = ok({ revoked: Boolean(sessionId) });
  response.cookies.set(SUPPORT_SESSION_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
