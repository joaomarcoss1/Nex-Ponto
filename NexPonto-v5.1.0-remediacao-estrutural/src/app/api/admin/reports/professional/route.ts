import crypto from "crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { createProfessionalPayrollPdfV51, createProfessionalPayrollXlsxV51, type ProfessionalReportApprovalV51, type ProfessionalReportDivergenceV51, type ProfessionalReportEmployeeV51, type ProfessionalReportPeriodV51, type ProfessionalReportRubricV51, type ProfessionalReportRunV51 } from "@/lib/services/professional-report-v51";
import { requireAdmin } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { canAccessBranch, canExportFinancialReports } from "@/lib/server/branch-permissions";
import { fileResponse } from "@/lib/server/exporters";
import { fail, readJson } from "@/lib/server/http";
import { getTenantExportBranding } from "@/lib/server/tenant-branding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const exportSchema = z.object({ run_id: z.string().uuid(), format: z.enum(["pdf", "xlsx"]), idempotency_key: z.string().trim().min(8).max(180).optional() });

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!canExportFinancialReports(auth.context)) return fail("Você não possui permissão para exportar dados financeiros.", 403);
  const parsed = exportSchema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) return fail("Revise a exportação.", 422, parsed.error.flatten());
  const input = parsed.data;
  const { data: runData, error: runError } = await auth.supabase.from("payroll_calculation_runs").select("*").eq("id", input.run_id).maybeSingle();
  if (runError || !runData) return fail("Processamento não encontrado.", 404, runError?.message);
  const run = runData as unknown as ProfessionalReportRunV51 & { payroll_period_id: string; branch_id: string | null };
  if (run.branch_id && !canAccessBranch(auth.context, run.branch_id)) return fail("Você não possui acesso à filial.", 403);
  const [periodResult, employeeResult, rubricResult, divergenceResult, approvalResult] = await Promise.all([
    auth.supabase.from("payroll_periods").select("title,start_date,end_date,branch_id").eq("id", run.payroll_period_id).maybeSingle(),
    run.branch_id ? auth.supabase.from("employees").select("id,full_name,registration_code,branch_id,role").eq("branch_id", run.branch_id).eq("active", true).order("full_name") : auth.supabase.from("employees").select("id,full_name,registration_code,branch_id,role").eq("active", true).order("full_name"),
    auth.supabase.from("payroll_item_rubrics").select("employee_id,rubric_code,rubric_name,rubric_type,final_value,formula_snapshot").eq("calculation_run_id", run.id).order("employee_id").order("sequence"),
    auth.supabase.from("payroll_divergences").select("employee_id,code,severity,message,status").eq("calculation_run_id", run.id).order("severity"),
    auth.supabase.from("payroll_approvals").select("approval_stage,decision,reason,approved_at").eq("calculation_run_id", run.id).order("approved_at"),
  ]);
  const firstError = [periodResult, employeeResult, rubricResult, divergenceResult, approvalResult].find((result) => result.error)?.error;
  if (firstError || !periodResult.data) return fail("Erro ao montar a exportação profissional.", 500, firstError?.message);
  const branding = await getTenantExportBranding(auth.rawSupabase, auth.context.tenantId, auth.context.tenantName);
  const params = {
    run,
    period: periodResult.data as unknown as ProfessionalReportPeriodV51,
    employees: (employeeResult.data || []) as unknown as ProfessionalReportEmployeeV51[],
    rubrics: (rubricResult.data || []) as unknown as ProfessionalReportRubricV51[],
    divergences: (divergenceResult.data || []) as unknown as ProfessionalReportDivergenceV51[],
  };
  const idempotencyKey = input.idempotency_key || `${auth.context.tenantId}:${run.id}:${input.format}:${run.version}`;
  const { data: exportRow, error: queueError } = await auth.rawSupabase.rpc("queue_report_export_v51", { p_tenant_id: auth.context.tenantId, p_requested_by: auth.context.userId, p_report_type: "professional_payroll", p_format: input.format, p_filters: { run_id: run.id, version: run.version }, p_idempotency_key: idempotencyKey });
  if (queueError) return fail("Erro ao registrar exportação.", 422, queueError.message);
  try {
    const buffer = input.format === "pdf"
      ? await createProfessionalPayrollPdfV51({ ...params, branding })
      : await createProfessionalPayrollXlsxV51({ ...params, approvals: (approvalResult.data || []) as unknown as ProfessionalReportApprovalV51[] });
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    await auth.rawSupabase.from("report_exports").update({ status: "ready", progress: 100, completed_at: new Date().toISOString(), checksum_sha256: checksum, row_count: params.employees.length }).eq("id", exportRow.id).eq("tenant_id", auth.context.tenantId);
    await writeAuditLog({ supabase: auth.supabase, context: auth.context, action: "export_professional_payroll_v51", entity: "payroll_calculation_runs", entityId: run.id, newData: { format: input.format, checksum, export_id: exportRow.id } });
    const safeTitle = params.period.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return fileResponse(buffer, `pre-folha-${safeTitle}-v${run.version}.${input.format}`, input.format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  } catch (cause) {
    await auth.rawSupabase.from("report_exports").update({ status: "failed", error_message: cause instanceof Error ? cause.message : "Falha na exportação", completed_at: new Date().toISOString() }).eq("id", exportRow.id).eq("tenant_id", auth.context.tenantId);
    return fail(cause instanceof Error ? cause.message : "Erro ao gerar exportação.", 500);
  }
}
