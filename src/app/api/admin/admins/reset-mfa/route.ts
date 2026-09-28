import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { fail, ok, readJson } from "@/lib/server/http";
import { adminResetMfaFactors } from "@/lib/security/mfa";
import { writeAuditLog } from "@/lib/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ adminUserId: z.string().uuid() });

/**
 * Recovery path for an admin locked out of their own account after losing
 * their authenticator device: another admin with administrators.manage
 * force-removes every MFA factor on the target account, so its next login
 * only needs the password again (and can re-enroll MFA from there). Never
 * reachable by the account's own session — that's what self-service unenroll
 * (which Supabase itself gates behind an aal2 session) is for.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, { all: ["administrators.manage"] });
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await readJson(request).catch(() => null));
  if (!parsed.success) return fail("Informe o administrador cujo segundo fator será removido.", 400);

  const { data: target, error: targetError } = await auth.supabase
    .from("admin_users")
    .select("id,auth_user_id,full_name,email")
    .eq("id", parsed.data.adminUserId)
    .maybeSingle();
  if (targetError) return fail("Erro ao buscar administrador.", 500, targetError.message);
  if (!target || !target.auth_user_id) return fail("Administrador não encontrado nesta empresa.", 404);

  const removed = await adminResetMfaFactors(auth.rawSupabase, target.auth_user_id);

  await writeAuditLog({
    supabase: auth.rawSupabase,
    context: auth.context,
    action: "admin.mfa.reset",
    entity: "admin_users",
    entityId: target.id,
    newData: { factorsRemoved: removed },
    reason: "Reset de MFA por outro administrador (recuperação de acesso).",
    requestId: request.headers.get("x-request-id"),
    headers: request.headers,
  }).catch(() => undefined);

  return ok({ factorsRemoved: removed });
}
