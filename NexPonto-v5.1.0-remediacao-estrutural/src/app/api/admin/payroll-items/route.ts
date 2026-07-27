import { NextRequest } from "next/server";
import { normalizeMoney } from "@/lib/calculations";
import { requireAdmin } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { assertCanAccessBranch } from "@/lib/server/branch-permissions";
import { fail, ok, readJson } from "@/lib/server/http";


export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request, ["master_admin", "rh_financeiro"]);
  if ("error" in auth) return auth.error;
  const body = await readJson<any>(request);
  if (!body.id) return fail("ID do item da folha obrigatório.", 400);

  const { data: oldData, error: oldError } = await auth.supabase
    .from("payroll_items")
    .select("*, payroll_periods(status,title)")
    .eq("id", body.id)
    .maybeSingle();
  if (oldError || !oldData) return fail("Item de folha não encontrado.", 404, oldError?.message);
  if (["closed", "closed_with_exceptions", "paid"].includes(oldData.payroll_periods?.status)) {
    return fail(`A folha "${oldData.payroll_periods?.title}" está fechada/paga. Reabra antes de editar valores.`, 409);
  }
  const branchCheck = assertCanAccessBranch(auth.context, oldData.branch_id);
  if (branchCheck) return branchCheck;

  const payload: Record<string, unknown> = {
    notes: body.notes || null
  };
  const integerFields = new Set([
    "expected_work_days",
    "worked_days",
    "approved_absences",
    "discounted_absences",
    "total_late_minutes",
    "total_early_leave_minutes",
    "overtime_minutes",
    "extra_days"
  ]);
  for (const key of [
    "base_salary",
    "daily_rate",
    "absence_discount_amount",
    "overtime_amount",
    "extra_day_amount",
    "final_amount",
    "expected_work_days",
    "worked_days",
    "approved_absences",
    "discounted_absences",
    "total_late_minutes",
    "total_early_leave_minutes",
    "overtime_minutes",
    "extra_days"
  ]) {
    if (body[key] !== undefined && body[key] !== "") {
      payload[key] = integerFields.has(key) ? Number(body[key]) : normalizeMoney(body[key]);
    }
  }

  const { data, error } = await auth.supabase.from("payroll_items").update(payload).eq("id", body.id).select("*").single();
  if (error) return fail("Erro ao ajustar item da folha.", 500, error.message);
  await writeAuditLog({
    supabase: auth.supabase,
    context: auth.context,
    action: "manual_financial_adjustment",
    entity: "payroll_items",
    entityId: data.id,
    oldData,
    newData: data
  });
  return ok({ item: data });
}
