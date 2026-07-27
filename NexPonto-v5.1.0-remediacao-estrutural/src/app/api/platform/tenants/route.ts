import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requirePlatformSuperadmin } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  legalName: z.string().trim().min(3).max(180),
  displayName: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  timezone: z.string().trim().min(3).max(80).default("America/Fortaleza"),
  planCode: z.string().trim().default("professional"),
  ownerName: z.string().trim().min(3).max(150),
  ownerEmail: z.string().email(),
});


async function findAuthUserByEmail(supabase: import("@supabase/supabase-js").SupabaseClient, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const match = data.users.find((user) => String(user.email || "").toLowerCase() === email.toLowerCase());
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
  if (error) return fail("Erro ao carregar empresas.", 500, error.message);
  return ok({ tenants: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await requirePlatformSuperadmin(request);
  if ("error" in auth) return auth.error;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Revise os dados da nova empresa.", 422, parsed.error.flatten());
  const input = parsed.data;
  const ownerEmail = input.ownerEmail.toLowerCase();

  let authUserId: string | null = null;
  let createdAuthUser = false;
  let inviteSent = false;
  try {
    const { data: invited, error: inviteError } = await auth.supabase.auth.admin.inviteUserByEmail(ownerEmail, {
      data: { full_name: input.ownerName, must_change_password: true },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/admin/nova-senha?obrigatoria=1`,
    });

    if (!inviteError && invited.user?.id) {
      authUserId = invited.user.id;
      createdAuthUser = true;
      inviteSent = true;
    } else {
      const message = String(inviteError?.message || "").toLowerCase();
      if (!message.includes("already") && !message.includes("registered") && !message.includes("exists")) {
        throw new Error(inviteError?.message || "Não foi possível criar o convite do proprietário.");
      }
      const existing = await findAuthUserByEmail(auth.supabase, ownerEmail);
      if (!existing?.id) throw new Error("O e-mail já existe no Auth, mas o usuário não pôde ser localizado.");
      authUserId = existing.id;
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

    return ok({ result: data, inviteSent }, { status: 201 });
  } catch (cause) {
    if (createdAuthUser && authUserId) {
      await auth.supabase.auth.admin.deleteUser(authUserId).catch(() => undefined);
    }
    return fail(cause instanceof Error ? cause.message : "Falha ao criar a empresa e o proprietário.", 500);
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
  if (error) return fail("Erro ao alterar situação da empresa.", 500, error.message);
  await auth.supabase.from("platform_audit_logs").insert({
    actor_user_id: auth.user.id,
    tenant_id: input.id,
    action: `tenant_status_${input.status}`,
    resource_type: "tenant",
    resource_id: input.id,
    request_id: request.headers.get("x-request-id") || crypto.randomUUID(),
    metadata: { reason: input.reason },
  });
  return ok({ tenant: data });
}
