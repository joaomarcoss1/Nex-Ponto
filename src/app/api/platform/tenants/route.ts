import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { resolveAppUrl } from "@/lib/config/environment";
import { createTenantRequestSchema, type CreateTenantResponse } from "@/lib/contracts/tenant-onboarding";
import { structuredLog } from "@/lib/observability/logger";
import { requirePlatformSuperadmin } from "@/lib/server/auth";
import { getSupabaseAuthClient } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function findAuthUserByEmail(supabase: import("@supabase/supabase-js").SupabaseClient, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const match = data.users.find((user) => String(user.email || "").toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 200) break;
  }
  return null;
}

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["draft", "onboarding", "pending_validation", "trial", "active", "suspended", "archived"]),
  reason: z.string().trim().min(5).max(500),
});

export async function GET(request: NextRequest) {
  const auth = await requirePlatformSuperadmin(request);
  if ("error" in auth) return auth.error;
  const { data, error } = await auth.supabase
    .from("tenants")
    .select("id,slug,legal_name,display_name,status,onboarding_status,default_timezone,public_access_code,created_at,updated_at,subscription_plans(code,name,employee_limit,branch_limit),tenant_usage(metric_date,employees_count,branches_count,storage_bytes)")
    .order("created_at", { ascending: false });
  if (error) return fail("Não foi possível carregar as empresas.", 500, error.message);
  return ok({ tenants: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await requirePlatformSuperadmin(request);
  if ("error" in auth) return auth.error;
  const parsed = createTenantRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Revise os dados da nova empresa.", 422, parsed.error.flatten());
  const input = parsed.data;
  const ownerEmail = input.ownerEmail.toLowerCase();
  const idempotencyKey = (request.headers.get("idempotency-key") || "").trim();
  if (idempotencyKey.length < 16 || idempotencyKey.length > 180) return fail("A chave de idempotência é inválida.", 400);

  const requestHash = crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const operation = "tenant.create.v54";
  const keyQuery = auth.supabase.from("platform_idempotency_keys")
    .select("request_hash,status,response_json")
    .eq("actor_user_id", auth.user.id).eq("operation", operation).eq("idempotency_key", idempotencyKey);
  const { data: existingKey } = await keyQuery.maybeSingle();
  if (existingKey) {
    if (existingKey.request_hash !== requestHash) return fail("A chave de idempotência já foi usada com outros dados.", 409);
    if (existingKey.status === "completed" && existingKey.response_json) {
      return ok({ ...(existingKey.response_json as CreateTenantResponse), duplicated: true });
    }
    return fail("Esta criação já está sendo processada. Aguarde antes de tentar novamente.", 409);
  }
  const { error: reservationError } = await auth.supabase.from("platform_idempotency_keys").insert({
    actor_user_id: auth.user.id, operation, idempotency_key: idempotencyKey,
    request_hash: requestHash, status: "processing",
  });
  if (reservationError) return fail("Não foi possível reservar a criação idempotente.", reservationError.code === "23505" ? 409 : 500);

  let authUserId: string | null = null;
  let createdAuthUser = false;
  let tenantCreated = false;
  try {
    const existingUser = await findAuthUserByEmail(auth.supabase, ownerEmail);
    if (existingUser?.id) {
      authUserId = existingUser.id;
    } else {
      const temporaryPassword = `${crypto.randomBytes(36).toString("base64url")}Aa1!`;
      const { data: created, error: createError } = await auth.supabase.auth.admin.createUser({
        email: ownerEmail,
        password: temporaryPassword,
        email_confirm: false,
        user_metadata: { full_name: input.ownerName, must_change_password: true },
      });
      if (createError || !created.user?.id) throw new Error(createError?.message || "AUTH_USER_CREATE_FAILED");
      authUserId = created.user.id;
      createdAuthUser = true;
    }

    const { data, error } = await auth.supabase.rpc("create_tenant_with_owner_v4", {
      p_actor_user_id: auth.user.id,
      p_auth_user_id: authUserId,
      p_owner_email: ownerEmail,
      p_owner_name: input.ownerName,
      p_legal_name: input.legalName,
      p_display_name: input.displayName,
      p_slug: input.slug,
      p_timezone: input.timezone,
      p_plan_code: input.planCode,
    });
    if (error) throw new Error(error.message);
    const result = data as { tenant?: Record<string, unknown>; admin?: Record<string, unknown>; membership?: Record<string, unknown> };
    const tenantId = String(result.tenant?.id || "");
    const adminId = String(result.admin?.id || "");
    const membershipId = String(result.membership?.id || "");
    if (!tenantId || !adminId || !membershipId) throw new Error("TENANT_CREATE_INCOMPLETE");
    tenantCreated = true;

    const appUrl = resolveAppUrl({ requestOrigin: request.nextUrl.origin });
    const redirectTo = `${appUrl}/admin/nova-senha?obrigatoria=1`;
    structuredLog("info", "tenant_owner_access_dispatch", {
      tenantId, ownerUserId: authUserId, redirectHost: new URL(redirectTo).host,
    });
    const { error: inviteError } = await getSupabaseAuthClient().auth.resetPasswordForEmail(ownerEmail, { redirectTo });
    const inviteSent = !inviteError;
    await auth.supabase.from("tenant_memberships").update({
      invite_status: inviteSent ? "sent" : "pending",
      invite_sent_at: inviteSent ? new Date().toISOString() : null,
      invite_error: inviteSent ? null : "dispatch_failed",
      invite_attempts: 1,
    }).eq("id", membershipId);

    const states: CreateTenantResponse["states"] = [
      "tenant_created", "onboarding_created",
      existingUser ? "existing_user_linked" : "pending_invite",
      inviteSent ? "invite_sent" : "partial_failure",
    ];
    const response: CreateTenantResponse = {
      tenant: {
        id: tenantId,
        displayName: String(result.tenant?.display_name || input.displayName),
        slug: String(result.tenant?.slug || input.slug),
        publicCode: String(result.tenant?.public_access_code || ""),
        status: String(result.tenant?.status || "onboarding"),
      },
      owner: { id: adminId, email: String(result.admin?.email || ownerEmail) },
      inviteSent,
      states,
    };
    await auth.supabase.from("platform_idempotency_keys").update({
      status: "completed", response_json: response, completed_at: new Date().toISOString(),
    }).eq("actor_user_id", auth.user.id).eq("operation", operation).eq("idempotency_key", idempotencyKey);
    return ok(response, { status: 201 });
  } catch (cause) {
    let rollbackCompleted = false;
    if (createdAuthUser && authUserId && !tenantCreated) {
      const { error } = await auth.supabase.auth.admin.deleteUser(authUserId);
      rollbackCompleted = !error;
    }
    await auth.supabase.from("platform_idempotency_keys").update({
      status: "failed", response_json: { states: rollbackCompleted ? ["rollback_completed"] : ["partial_failure"] }, completed_at: new Date().toISOString(),
    }).eq("actor_user_id", auth.user.id).eq("operation", operation).eq("idempotency_key", idempotencyKey);
    const technicalMessage = cause instanceof Error ? cause.message : "TENANT_CREATE_FAILED";
    structuredLog("error", "tenant_create_failed", { technicalMessage, rollbackCompleted, actorUserId: auth.user.id });
    const conflict = /SLUG_ALREADY_USED|SLUG_ALREADY|already exists|já existe/i.test(technicalMessage);
    return fail(conflict ? "Já existe uma empresa com este identificador." : "Não foi possível concluir o cadastro da empresa.", conflict ? 409 : 500, { code: conflict ? "CONFLICT" : "INTERNAL_ERROR", technicalMessage });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePlatformSuperadmin(request);
  if ("error" in auth) return auth.error;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Alteração inválida.", 422, parsed.error.flatten());
  const input = parsed.data;
  const patch: Record<string, unknown> = { status: input.status, updated_at: new Date().toISOString() };
  if (input.status === "suspended") patch.suspended_at = new Date().toISOString();
  if (input.status === "active") patch.activated_at = new Date().toISOString();
  const { data, error } = await auth.supabase.from("tenants").update(patch).eq("id", input.id).select("id,slug,display_name,status").single();
  if (error) return fail("Não foi possível alterar a situação da empresa.", 500, error.message);
  await auth.supabase.from("platform_audit_logs").insert({
    actor_user_id: auth.user.id, tenant_id: input.id, action: `tenant_status_${input.status}`,
    resource_type: "tenant", resource_id: input.id,
    request_id: request.headers.get("x-request-id") || crypto.randomUUID(), metadata: { reason: input.reason },
  });
  return ok({ tenant: data });
}
