import crypto from "crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { assertCanAccessBranch, canManageBranches } from "@/lib/server/branch-permissions";
import { writeAuditLog } from "@/lib/server/audit";
import { fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ branch_id: z.string().uuid(), validity_minutes: z.coerce.number().int().min(5).max(60).default(15) });

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!canManageBranches(auth.context)) return fail("Permissão insuficiente para validar o GPS da filial.", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Dados de validação inválidos.", 422, parsed.error.flatten());
  const input = parsed.data;
  const scopeError = assertCanAccessBranch(auth.context, input.branch_id);
  if (scopeError) return scopeError;

  const { data: branch } = await auth.supabase.from("branches").select("id,name").eq("id", input.branch_id).maybeSingle();
  if (!branch) return fail("Filial não encontrada.", 404);

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + input.validity_minutes * 60_000).toISOString();
  const { data: session, error } = await auth.supabase
    .from("gps_validation_sessions")
    .insert({
      branch_id: input.branch_id,
      token_hash: tokenHash,
      status: "issued",
      expires_at: expiresAt,
      issued_by: auth.context.userId,
    })
    .select("id,branch_id,status,expires_at,created_at")
    .single();
  if (error) return fail("Erro ao iniciar validação presencial.", 500, error.message);

  const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const validationUrl = new URL("/validar-gps", origin);
  validationUrl.searchParams.set("tenant", auth.context.tenantSlug);
  validationUrl.searchParams.set("token", token);

  await writeAuditLog({
    supabase: auth.supabase,
    context: auth.context,
    headers: request.headers,
    action: "issue_branch_gps_validation",
    entity: "gps_validation_sessions",
    entityId: session.id,
    reason: "Validação presencial da geofence",
    newData: { branchId: input.branch_id, branchName: branch.name, expiresAt },
  });
  return ok({ session, validation_url: validationUrl.toString() });
}
