import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { fail, ok, readJson } from "@/lib/server/http";
import { writeAuditLog } from "@/lib/server/audit";

const createSchema = z.object({
  employeeId: z.string().uuid().optional(),
  requesterEmail: z.string().email().optional(),
  requestType: z.enum(["access", "portability", "correction", "deletion", "opposition"]),
  notes: z.string().trim().max(2_000).optional(),
}).refine((value) => value.employeeId || value.requesterEmail, {
  message: "Informe o funcionário ou o e-mail do titular.",
});

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["identity_validation", "in_progress", "blocked_legal_retention", "completed", "rejected"]),
  legalBasis: z.string().trim().min(5).max(500),
  retentionDecision: z.string().trim().min(5).max(1_000),
  notes: z.string().trim().max(2_000).optional(),
});

function allowed(permissions: readonly string[]) {
  return permissions.includes("tenant.manage") || permissions.includes("audit.view");
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!allowed(auth.context.permissions)) {
    return fail("Acesso restrito ao responsável por privacidade.", 403, { code: "FORBIDDEN" });
  }
  const { data, error } = await auth.supabase
    .from("privacy_requests")
    .select("id,employee_id,requester_email,request_type,status,legal_basis,retention_decision,due_at,resolved_at,notes,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return fail("Erro ao consultar solicitações LGPD.", 500, error.message);
  return ok({ requests: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!allowed(auth.context.permissions)) {
    return fail("Acesso restrito ao responsável por privacidade.", 403, { code: "FORBIDDEN" });
  }
  const parsed = createSchema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) return fail("Revise a solicitação.", 422, parsed.error.flatten());
  const dueAt = new Date(Date.now() + 15 * 24 * 60 * 60_000).toISOString();
  const { data, error } = await auth.supabase.from("privacy_requests").insert({
    employee_id: parsed.data.employeeId || null,
    requester_email: parsed.data.requesterEmail || null,
    request_type: parsed.data.requestType,
    notes: parsed.data.notes || null,
    due_at: dueAt,
  }).select("*").single();
  if (error) return fail("Erro ao registrar solicitação LGPD.", 500, error.message);
  await writeAuditLog({
    supabase: auth.supabase,
    context: auth.context,
    action: "create_privacy_request",
    entity: "privacy_requests",
    entityId: data.id,
    newData: { requestType: data.request_type, dueAt },
  });
  return ok({ request: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!allowed(auth.context.permissions)) {
    return fail("Acesso restrito ao responsável por privacidade.", 403, { code: "FORBIDDEN" });
  }
  const parsed = updateSchema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) return fail("Revise a decisão.", 422, parsed.error.flatten());
  const input = parsed.data;
  const { data: before } = await auth.supabase.from("privacy_requests").select("*").eq("id", input.id).maybeSingle();
  if (!before) return fail("Solicitação não encontrada.", 404, { code: "NOT_FOUND" });
  const terminal = ["completed", "rejected", "blocked_legal_retention"].includes(input.status);
  const { data, error } = await auth.supabase.from("privacy_requests").update({
    status: input.status,
    legal_basis: input.legalBasis,
    retention_decision: input.retentionDecision,
    notes: input.notes || before.notes,
    resolved_by: terminal ? auth.context.userId : null,
    resolved_at: terminal ? new Date().toISOString() : null,
  }).eq("id", input.id).select("*").single();
  if (error) return fail("Erro ao atualizar solicitação LGPD.", 500, error.message);
  await writeAuditLog({
    supabase: auth.supabase,
    context: auth.context,
    action: "resolve_privacy_request",
    entity: "privacy_requests",
    entityId: data.id,
    oldData: { status: before.status },
    newData: { status: data.status, legalBasis: input.legalBasis, retentionDecision: input.retentionDecision },
  });
  return ok({ request: data });
}
