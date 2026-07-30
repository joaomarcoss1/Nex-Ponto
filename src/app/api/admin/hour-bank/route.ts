import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { assertCanAccessBranch, assertEmployeeInScope, canManageHourBank, scopeByBranch } from "@/lib/server/branch-permissions";
import { fail, ok, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const movementSchema = z.object({
  employee_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  movement_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  minutes: z.coerce.number().int().positive("Informe uma quantidade positiva de minutos."),
  movement_type: z.enum(["credit", "debit", "compensation", "manual_adjustment"]).default("manual_adjustment"),
  origin: z.string().trim().min(2).max(60).default("manual"),
  reason: z.string().trim().min(5).max(500),
  expires_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable()
});

const reversalSchema = z.object({ id: z.string().uuid(), reason: z.string().trim().min(5).max(500), idempotency_key: z.string().trim().min(8).max(180).optional() });

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  let query = scopeByBranch(
    auth.supabase
      .from("hour_bank_movements")
      .select("*, employees(full_name,registration_code), branches:branches!hour_bank_movements_branch_id_fkey(name)")
      .order("movement_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000),
    auth.context,
    "branch_id"
  );
  const branchId = request.nextUrl.searchParams.get("branchId");
  const employeeId = request.nextUrl.searchParams.get("employeeId");
  if (branchId) query = query.eq("branch_id", branchId);
  if (employeeId) query = query.eq("employee_id", employeeId);
  const { data, error } = await query;
  if (error) return fail("Erro ao listar banco de horas.", 500, error.message);
  return ok({ movements: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!canManageHourBank(auth.context)) return fail("Você não possui permissão para administrar o banco de horas.", 403);
  const parsed = movementSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail("Revise o lançamento do banco de horas.", 422, parsed.error.flatten());
  const input = parsed.data;
  const employeeCheck = await assertEmployeeInScope({ supabase: auth.supabase, context: auth.context, employeeId: input.employee_id });
  if (employeeCheck) return employeeCheck;
  const branchCheck = assertCanAccessBranch(auth.context, input.branch_id);
  if (branchCheck) return branchCheck;

  const idempotencyKey = request.headers.get("idempotency-key") || `${auth.context.tenantId}:${input.employee_id}:${input.movement_date || new Date().toISOString().slice(0, 10)}:${input.movement_type}:${crypto.randomUUID()}`;
  const { data, error } = await auth.rawSupabase.rpc("append_hour_bank_movement_v51", {
    p_tenant_id: auth.context.tenantId,
    p_employee_id: input.employee_id,
    p_branch_id: input.branch_id,
    p_movement_date: input.movement_date || new Date().toISOString().slice(0, 10),
    p_minutes: Math.abs(input.minutes),
    p_movement_type: input.movement_type,
    p_origin: input.origin,
    p_reason: input.reason,
    p_idempotency_key: idempotencyKey,
    p_created_by: auth.context.userId,
    p_approved_by: auth.context.userId,
    p_expires_on: input.expires_on || null,
    p_reversal_of: null,
    p_overtime_review_id: null,
    p_payroll_item_id: null,
    p_request_id: null,
    p_rule_snapshot: { source: "admin_hour_bank_v51" }
  });
  if (error) return fail("Erro ao registrar movimento imutável.", 422, error.message);
  return ok({ movement: data });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!canManageHourBank(auth.context)) return fail("Você não possui permissão para estornar o banco de horas.", 403);
  const parsed = reversalSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail("Informe o movimento e o motivo do estorno.", 422, parsed.error.flatten());
  const { data: movement, error: findError } = await auth.supabase
    .from("hour_bank_movements")
    .select("id,branch_id")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (findError) return fail("Erro ao validar o movimento.", 500, findError.message);
  if (!movement) return fail("Movimento não encontrado.", 404);
  const branchCheck = assertCanAccessBranch(auth.context, movement.branch_id);
  if (branchCheck) return branchCheck;
  const { data, error } = await auth.rawSupabase.rpc("reverse_hour_bank_movement_v51", {
    p_tenant_id: auth.context.tenantId,
    p_movement_id: parsed.data.id,
    p_reason: parsed.data.reason,
    p_idempotency_key: parsed.data.idempotency_key || `${auth.context.tenantId}:reversal:${parsed.data.id}:${crypto.randomUUID()}`,
    p_created_by: auth.context.userId
  });
  if (error) return fail(error.message.includes("ALREADY_REVERSED") ? "Este movimento já foi estornado." : "Erro ao estornar movimento.", 422, error.message);
  return ok({ movement: data });
}
