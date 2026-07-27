import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { canViewFinancialData, scopeByBranch, canAccessBranch } from "@/lib/server/branch-permissions";
import { writeAuditLog } from "@/lib/server/audit";
import { buildEmployeesExportTable } from "@/lib/services/employee-import";
import { createPdfBuffer, createXlsxBuffer, fileResponse } from "@/lib/server/exporters";
import { fail, ok } from "@/lib/server/http";
import { getTenantExportBranding } from "@/lib/server/tenant-branding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  try {
    const params = request.nextUrl.searchParams;
    const format = params.get("format") || "json";
    const canFinancial = canViewFinancialData(auth.context);
    let query = scopeByBranch(auth.supabase.from("employees").select("*, branches:branches!employees_branch_id_fkey(name)").order("full_name"), auth.context, "branch_id");
    const branchId = params.get("branchId") || params.get("branch_id");
    if (branchId) {
      if (!canAccessBranch(auth.context, branchId)) return fail("Você não tem acesso a esta filial.", 403);
      query = query.eq("branch_id", branchId);
    }
    if (params.get("role")) query = query.ilike("role", `%${params.get("role")}%`);
    if (params.get("sector")) query = query.ilike("sector", `%${params.get("sector")}%`);
    if (params.get("status") === "active" || params.get("active") === "true") query = query.eq("active", true);
    if (params.get("status") === "inactive" || params.get("active") === "false") query = query.eq("active", false);
    if (params.get("employmentType")) query = query.eq("employment_type", params.get("employmentType"));
    const paymentDay = params.get("paymentDay") || params.get("payment_day");
    if (paymentDay) query = query.eq("payment_day", Number(paymentDay));
    const q = (params.get("q") || "").trim();
    if (q) query = query.or(`full_name.ilike.%${q}%,registration_code.ilike.%${q}%,document.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) return fail("Erro ao exportar funcionários.", 500, error.message);
    let rows = (data || []).map((employee: any) => {
      const { pin_hash: _pin_hash, ...safe } = employee;
      safe.has_pin = Boolean(employee.pin_hash);
      if (!canFinancial) {
        safe.monthly_salary = null;
        safe.daily_rate = null;
        safe.pix_key = null;
        safe.bank_name = null;
        safe.bank_agency = null;
        safe.bank_account = null;
        safe.bank_account_type = null;
        safe.payment_day = null;
      }
      return safe;
    });
    if (params.get("missingPin") === "true") rows = rows.filter((employee: any) => employee.has_pin === false);
    if (params.get("missingSchedule") === "true") rows = rows.filter((employee: any) => !employee.expected_start_time || !employee.expected_end_time || !employee.expected_lunch_start_time || !employee.expected_lunch_end_time || !employee.work_days?.length);
    if (canFinancial && params.get("missingSalary") === "true") rows = rows.filter((employee: any) => !Number(employee.monthly_salary || employee.daily_rate || 0));
    if (canFinancial && params.get("missingPaymentDay") === "true") rows = rows.filter((employee: any) => !employee.payment_day);
    if (params.get("incompleteOnly") === "true") rows = rows.filter((employee: any) => !employee.branch_id || employee.has_pin === false || !employee.role || !employee.expected_start_time || !employee.expected_end_time || !employee.expected_lunch_start_time || !employee.expected_lunch_end_time || !employee.work_days?.length || (canFinancial && (!employee.payment_day || !Number(employee.monthly_salary || employee.daily_rate || 0))));
    const table = buildEmployeesExportTable(rows, canFinancial);
    table.branding = await getTenantExportBranding(auth.rawSupabase, auth.context.tenantId, auth.context.tenantName);
    table.footer = table.branding.footer || table.footer;
    table.meta = [
      `Filtros aplicados: ${Object.entries(Object.fromEntries(params.entries())).map(([key, value]) => `${key}=${value}`).join("; ") || "nenhum"}`,
      canFinancial ? "Exportação financeira autorizada." : "Dados financeiros ocultos por permissão."
    ];
    await writeAuditLog({ supabase: auth.supabase, context: auth.context, action: `export_employees_${format}`, entity: "employees", newData: { filters: Object.fromEntries(params.entries()), rows: rows.length, financial: canFinancial, ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip"), userAgent: request.headers.get("user-agent") } });
    if (format === "pdf") return fileResponse(await createPdfBuffer(table), "funcionarios-nexponto.pdf", "application/pdf");
    if (format === "xlsx") return fileResponse(await createXlsxBuffer(table), "funcionarios-nexponto.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return ok({ employees: rows, table });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erro ao exportar funcionários.", 500);
  }
}
