import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { canAccessBranch, canViewFinancialData, assertBranchInTenant } from "@/lib/server/branch-permissions";
import { writeAuditLog } from "@/lib/server/audit";
import { fail, ok, readJson } from "@/lib/server/http";
import { hashPin } from "@/lib/server/pin";
import { generatePin4, buildImportReportTable, type ImportRow } from "@/lib/services/employee-import";
import { createPdfBuffer, createXlsxBuffer, fileResponse } from "@/lib/server/exporters";
import { getTenantExportBranding } from "@/lib/server/tenant-branding";
import { employeeBulkRequestSchema } from "@/lib/validation/employee-bulk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request, { all: ["employee.manage"] });
  if ("error" in auth) return auth.error;
  try {
    const parsed = employeeBulkRequestSchema.safeParse(await readJson<unknown>(request));
    if (!parsed.success) return fail("Revise os campos da edição em massa.", 422, { code: "VALIDATION_FAILED", issues: parsed.error.flatten() });
    const body = parsed.data;
    const ids = [...new Set(body.ids)];
    const { data: employees, error: employeeError } = await auth.supabase.from("employees").select("id,full_name,registration_code,branch_id").in("id", ids);
    if (employeeError) return fail("Erro ao validar funcionários.", 500, employeeError.message);
    if ((employees || []).length !== ids.length) return fail("Um ou mais funcionários não existem nesta empresa.", 403, { code: "CROSS_TENANT_RESOURCE" });
    for (const employee of employees || []) {
      if (!canAccessBranch(auth.context, employee.branch_id)) return fail("Você não tem acesso a um ou mais funcionários selecionados.", 403);
    }
    const sensitive = ["monthly_salary", "daily_rate", "pix_key", "bank_name", "bank_agency", "bank_account"];
    if (sensitive.some((key) => key in (body.patch || {})) && !canViewFinancialData(auth.context)) {
      return fail("Você não tem permissão para edição financeira em massa.", 403);
    }
    const patch: Record<string, unknown> = { ...body.patch };
    if (patch.branch_id) {
      const branchError = await assertBranchInTenant({ supabase: auth.supabase, context: auth.context, branchId: String(patch.branch_id) });
      if (branchError) return branchError;
    }
    if (patch.pin) {
      if (!/^\d{4}$/.test(String(patch.pin))) return fail("PIN deve ter 4 dígitos.", 400);
      patch.pin_hash = await hashPin(String(patch.pin));
      delete patch.pin;
    }
    let generatedRows: ImportRow[] = [];
    if (body.generatePins) {
      const generated = await Promise.all((employees || []).map(async (employee) => {
        const pin = generatePin4();
        return { employee, pin, pinHash: await hashPin(pin) };
      }));
      const { data: updatedRows, error: pinError } = await auth.rawSupabase.rpc("bulk_set_employee_pins_v554", {
        p_tenant_id: auth.context.tenantId,
        p_rows: generated.map(({ employee, pinHash }) => ({ id: employee.id, pin_hash: pinHash })),
        p_actor: auth.context.userId,
      });
      if (pinError) return fail("Nenhum PIN foi alterado. Não foi possível concluir o lote atomicamente.", 500, { code: "PIN_BULK_TRANSACTION_FAILED" });
      const updatedIds = new Set((updatedRows || []).map((row: { id: string }) => row.id));
      if (updatedIds.size !== generated.length || generated.some(({ employee }) => !updatedIds.has(employee.id))) {
        return fail("Nenhum PIN foi apresentado porque o banco não confirmou o lote completo.", 500, { code: "PIN_BULK_CONFIRMATION_FAILED" });
      }
      generatedRows = generated.map(({ employee, pin }, index) => ({
        rowNumber: index + 1,
        registration_code: employee.registration_code,
        full_name: employee.full_name,
        branch_name: "-",
        role: "-",
        employment_type: "mensalista",
        generated_pin: pin,
        action: "update",
        errors: [],
        warnings: ["PIN redefinido em massa."],
      }));
    }
    if (Object.keys(patch).length) {
      const { error } = await auth.supabase.from("employees").update(patch).in("id", ids);
      if (error) return fail("Erro na edição em massa.", 500, error.message);
    }
    if (!body.generatePins) {
      await writeAuditLog({ supabase: auth.supabase, context: auth.context, action: "bulk_update", entity: "employees", newData: { ids, patch: Object.keys(patch), generatedPins: false } });
    }
    if ((body.format === "pdf" || body.format === "xlsx") && generatedRows.length) {
      const table = buildImportReportTable(generatedRows, "PINs Gerados em Massa");
      table.branding = await getTenantExportBranding(auth.rawSupabase, auth.context.tenantId, auth.context.tenantName);
      if (body.format === "pdf") return fileResponse(await createPdfBuffer(table), "pins-gerados-funcionarios.pdf", "application/pdf");
      return fileResponse(await createXlsxBuffer(table), "pins-gerados-funcionarios.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    }
    return ok({ updated: ids.length, generatedPins: generatedRows });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String((error as Error & { code?: unknown }).code || "") : "";
    return fail(error instanceof Error ? error.message : "Erro na edição em massa.", code === "TENANT_MUTATION_FORBIDDEN" ? 422 : 500, code ? { code } : undefined);
  }
}
