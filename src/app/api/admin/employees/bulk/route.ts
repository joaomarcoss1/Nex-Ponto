import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { canAccessBranch, canViewFinancialData } from "@/lib/server/branch-permissions";
import { writeAuditLog } from "@/lib/server/audit";
import { fail, ok, readJson } from "@/lib/server/http";
import { hashPin } from "@/lib/server/pin";
import { generatePin4, buildImportReportTable, type ImportRow } from "@/lib/services/employee-import";
import { createPdfBuffer, createXlsxBuffer, fileResponse } from "@/lib/server/exporters";
import { getTenantExportBranding } from "@/lib/server/tenant-branding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  try {
    const body = await readJson<any>(request);
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
    if (!ids.length) return fail("Selecione ao menos um funcionário.", 400);
    const { data: employees, error: employeeError } = await auth.supabase.from("employees").select("id,full_name,registration_code,branch_id").in("id", ids);
    if (employeeError) return fail("Erro ao validar funcionários.", 500, employeeError.message);
    for (const employee of employees || []) {
      if (!canAccessBranch(auth.context, employee.branch_id)) return fail("Você não tem acesso a um ou mais funcionários selecionados.", 403);
    }
    const sensitive = ["monthly_salary", "daily_rate", "pix_key", "bank_name", "bank_agency", "bank_account"];
    if (sensitive.some((key) => key in (body.patch || {})) && !canViewFinancialData(auth.context)) {
      return fail("Você não tem permissão para edição financeira em massa.", 403);
    }
    const patch: Record<string, unknown> = { ...(body.patch || {}) };
    if (patch.branch_id && !canAccessBranch(auth.context, String(patch.branch_id))) return fail("Você não tem acesso à filial de destino.", 403);
    if (patch.pin) {
      if (!/^\d{4}$/.test(String(patch.pin))) return fail("PIN deve ter 4 dígitos.", 400);
      patch.pin_hash = await hashPin(String(patch.pin));
      delete patch.pin;
    }
    let generatedRows: ImportRow[] = [];
    if (body.generatePins) {
      generatedRows = [];
      for (const employee of employees || []) {
        const pin = generatePin4();
        await auth.supabase.from("employees").update({ pin_hash: await hashPin(pin) }).eq("id", employee.id);
        generatedRows.push({ rowNumber: generatedRows.length + 1, registration_code: employee.registration_code, full_name: employee.full_name, branch_name: "-", role: "-", employment_type: "mensalista", generated_pin: pin, action: "update", errors: [], warnings: ["PIN redefinido em massa."] });
      }
    }
    if (Object.keys(patch).length) {
      const { error } = await auth.supabase.from("employees").update(patch).in("id", ids);
      if (error) return fail("Erro na edição em massa.", 500, error.message);
    }
    await writeAuditLog({ supabase: auth.supabase, context: auth.context, action: body.generatePins ? "bulk_generate_pin" : "bulk_update", entity: "employees", newData: { ids, patch: Object.keys(patch), generatedPins: Boolean(body.generatePins) } });
    if ((body.format === "pdf" || body.format === "xlsx") && generatedRows.length) {
      const table = buildImportReportTable(generatedRows, "PINs Gerados em Massa");
      table.branding = await getTenantExportBranding(auth.rawSupabase, auth.context.tenantId, auth.context.tenantName);
      if (body.format === "pdf") return fileResponse(await createPdfBuffer(table), "pins-gerados-funcionarios.pdf", "application/pdf");
      return fileResponse(await createXlsxBuffer(table), "pins-gerados-funcionarios.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    }
    return ok({ updated: ids.length, generatedPins: generatedRows });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erro na edição em massa.", 500);
  }
}
