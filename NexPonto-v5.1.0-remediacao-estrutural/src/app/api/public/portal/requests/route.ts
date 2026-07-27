import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { readEmployeeSession } from "@/lib/server/employee-session";
import { fail, ok } from "@/lib/server/http";
import { requirePublicTenant } from "@/lib/server/public-tenant";

const requestSchema = z.object({
  requestDate: z.string().date(),
  requestType: z.enum(["troca_turno", "mudanca_horario", "mudanca_intervalo", "outra_filial", "folga", "compensacao", "correcao_ponto", "hora_extra", "ausencia_atestado"]),
  reason: z.string().trim().min(10).max(1200),
  targetBranchId: z.string().uuid().nullable().optional(),
  requestedStartTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  requestedEndTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  requestedInterval: z.record(z.unknown()).optional(),
  idempotencyKey: z.string().min(12).max(180).optional(),
});

export async function GET(request: NextRequest) {
  const { tenant, supabase } = await requirePublicTenant(request);
  const session = readEmployeeSession(request);
  if (!session || session.tenantId !== tenant.id) return fail("Sessão do funcionário expirada.", 401);
  const { data, error } = await supabase.from("shift_requests").select("id,request_date,request_type,reason,status,workflow_status,admin_observation,created_at,updated_at").eq("employee_id", session.employeeId).order("created_at", { ascending: false }).limit(50);
  if (error) return fail("Erro ao carregar solicitações.", 500, error.message);
  return ok({ requests: data || [] });
}

export async function POST(request: NextRequest) {
  try {
    const { tenant, rawSupabase, supabase } = await requirePublicTenant(request);
    const session = readEmployeeSession(request);
    if (!session || session.tenantId !== tenant.id) return fail("Sessão do funcionário expirada.", 401);
    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Revise os dados da solicitação.", 422, parsed.error.flatten());
    const input = parsed.data;
    const { data: employee } = await supabase.from("employees").select("id,branch_id,active").eq("id", session.employeeId).maybeSingle();
    if (!employee?.active) return fail("Funcionário inativo ou não encontrado.", 404);
    const { data, error } = await rawSupabase.rpc("submit_employee_request_v4", {
      p_tenant_id: tenant.id,
      p_employee_id: employee.id,
      p_branch_id: employee.branch_id,
      p_request_date: input.requestDate,
      p_request_type: input.requestType,
      p_target_branch_id: input.targetBranchId || null,
      p_reason: input.reason,
      p_requested_start_time: input.requestedStartTime || null,
      p_requested_end_time: input.requestedEndTime || null,
      p_requested_interval: input.requestedInterval || {},
      p_idempotency_key: input.idempotencyKey || crypto.randomUUID(),
    });
    if (error) return fail("Não foi possível enviar a solicitação.", 422, error.message);
    return ok({ request: data }, { status: 201 });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erro ao enviar solicitação.", 500);
  }
}
