import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { canAccessBranch } from "@/lib/server/branch-permissions";
import { normalizeMoney } from "@/lib/calculations";
import { writeAuditLog } from "@/lib/server/audit";
import { fail, ok, readJson } from "@/lib/server/http";
import { hashPin } from "@/lib/server/pin";
import { buildImportReportTable, generatePin4, type ImportRow } from "@/lib/services/employee-import";
import { createPdfBuffer, createXlsxBuffer, fileResponse } from "@/lib/server/exporters";
import { getTenantExportBranding } from "@/lib/server/tenant-branding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function payloadFromRow(row: ImportRow, pinHash?: string) {
  const payload: any = {
    registration_code: row.registration_code || null,
    full_name: row.full_name,
    document: row.document || null,
    phone: row.phone || null,
    role: row.role,
    sector: row.sector || null,
    branch_id: row.branch_id,
    employment_type: row.employment_type || "mensalista",
    monthly_salary: normalizeMoney(row.monthly_salary || 0),
    daily_rate: row.daily_rate === null || row.daily_rate === undefined ? null : normalizeMoney(row.daily_rate),
    daily_rate_mode: row.daily_rate_mode || "automatic",
    pix_key: row.pix_key || null,
    bank_name: row.bank_name || null,
    bank_agency: row.bank_agency || null,
    bank_account: row.bank_account || null,
    active: row.status !== "inactive",
    admission_date: row.admission_date || new Date().toISOString().slice(0, 10),
    work_days: row.work_days?.length ? row.work_days : [1, 2, 3, 4, 5, 6],
    payment_day: row.payment_day || null,
    expected_start_time: row.expected_start_time || "08:00",
    expected_lunch_start_time: row.expected_lunch_start_time || null,
    expected_lunch_end_time: row.expected_lunch_end_time || null,
    expected_end_time: row.expected_end_time || "17:00",
    expected_daily_minutes: 480,
    expected_lunch_minutes: 60,
    allow_overtime: true
  };
  if (pinHash) payload.pin_hash = pinHash;
  return payload;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, { all: ["employee.manage"] });
  if ("error" in auth) return auth.error;
  try {
    const body = await readJson<{ rows: ImportRow[]; format?: "json" | "pdf" | "xlsx"; reportOnly?: boolean }>(request);
    if (body.reportOnly) {
      const table = buildImportReportTable(body.rows || []);
      table.branding = await getTenantExportBranding(auth.rawSupabase, auth.context.tenantId, auth.context.tenantName);
      if (body.format === "pdf") return fileResponse(await createPdfBuffer(table), "relatorio-importacao-funcionarios.pdf", "application/pdf");
      if (body.format === "xlsx") return fileResponse(await createXlsxBuffer(table), "relatorio-importacao-funcionarios.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      return ok({ rows: body.rows || [], summary: table.summary });
    }
    const inputRows = body.rows || [];
    if (!Array.isArray(inputRows) || !inputRows.length) return fail("Nenhuma linha para importar.", 400);
    const resultRows: ImportRow[] = [];

    for (const row of inputRows) {
      const copy: ImportRow = { ...row, errors: [...(row.errors || [])], warnings: [...(row.warnings || [])] };
      if (!copy.branch_id || !canAccessBranch(auth.context, copy.branch_id)) copy.errors.push("Filial fora do seu escopo de acesso.");
      if (!copy.full_name || !copy.role || !copy.branch_id) copy.errors.push("Nome, cargo e filial são obrigatórios.");
      let pin = copy.pin || copy.generated_pin;
      if (!pin && !copy.errors.length) {
        pin = generatePin4();
        copy.generated_pin = pin;
      }
      if (pin && !/^\d{4}$/.test(pin)) copy.errors.push("PIN deve ter 4 dígitos.");
      if (copy.errors.length) {
        copy.action = "skip";
        resultRows.push(copy);
        continue;
      }

      const pinHash = pin ? await hashPin(pin) : undefined;
      const payload = payloadFromRow(copy, pinHash);
      let existing: any = null;
      if (copy.registration_code) {
        const { data } = await auth.supabase.from("employees").select("*").eq("registration_code", copy.registration_code).maybeSingle();
        existing = data;
      }
      if (!existing && copy.document) {
        const { data } = await auth.supabase.from("employees").select("*").eq("document", copy.document).maybeSingle();
        existing = data;
      }
      if (existing) {
        if (!canAccessBranch(auth.context, existing.branch_id)) {
          copy.errors.push("Funcionário existente está fora do seu escopo de filial.");
          copy.action = "skip";
          resultRows.push(copy);
          continue;
        }
        const { data, error } = await auth.supabase.from("employees").update(payload).eq("id", existing.id).select("id").single();
        if (error) copy.errors.push(error.message);
        copy.action = error ? "skip" : "update";
        if (data) {
          const today = new Date().toISOString().slice(0, 10);
          const yesterday = new Date(`${today}T12:00:00Z`);
          yesterday.setUTCDate(yesterday.getUTCDate() - 1);
          const previousDate = yesterday.toISOString().slice(0, 10);
          const financialChanged =
            Number(existing.monthly_salary || 0) !== Number(payload.monthly_salary || 0) ||
            Number(existing.daily_rate || 0) !== Number(payload.daily_rate || 0) ||
            existing.daily_rate_mode !== payload.daily_rate_mode;
          if (financialChanged) {
            const closeSalary = await auth.supabase
              .from("employee_salary_history")
              .update({ valid_until: previousDate })
              .eq("employee_id", data.id)
              .is("valid_until", null);
            const insertSalary = await auth.supabase.from("employee_salary_history").insert({
              employee_id: data.id,
              monthly_salary: payload.monthly_salary,
              daily_rate: payload.daily_rate,
              daily_rate_mode: payload.daily_rate_mode,
              effective_from: today,
              valid_from: today,
              reason: "Atualização por importação",
              changed_by: auth.context.userId
            });
            if (closeSalary.error || insertSalary.error) {
              copy.errors.push(closeSalary.error?.message || insertSalary.error?.message || "Erro no histórico salarial.");
            }
          }
          const closeSchedule = await auth.supabase
            .from("work_schedules")
            .update({ effective_until: previousDate })
            .eq("employee_id", data.id)
            .eq("active", true)
            .is("effective_until", null);
          const insertSchedule = await auth.supabase.from("work_schedules").insert({
            employee_id: data.id,
            branch_id: payload.branch_id,
            title: "Escala principal",
            work_days: payload.work_days,
            expected_start_time: payload.expected_start_time,
            expected_end_time: payload.expected_end_time,
            expected_daily_minutes: payload.expected_daily_minutes,
            expected_lunch_minutes: payload.expected_lunch_minutes,
            expected_lunch_start_time: payload.expected_lunch_start_time,
            expected_lunch_end_time: payload.expected_lunch_end_time,
            effective_from: today,
            published_at: new Date().toISOString(),
            published_by: auth.context.userId,
            active: true
          });
          if (closeSchedule.error || insertSchedule.error) {
            copy.errors.push(closeSchedule.error?.message || insertSchedule.error?.message || "Erro ao atualizar escala.");
          }
          if (pin) copy.generated_pin = pin;
        }
      } else {
        const { data, error } = await auth.supabase.from("employees").insert(payload).select("id").single();
        if (error) copy.errors.push(error.message);
        copy.action = error ? "skip" : "create";
        if (data) {
          await auth.supabase.from("work_schedules").insert({
            employee_id: data.id,
            branch_id: payload.branch_id,
            title: "Escala principal",
            work_days: payload.work_days,
            expected_start_time: payload.expected_start_time,
            expected_end_time: payload.expected_end_time,
            expected_daily_minutes: payload.expected_daily_minutes,
            expected_lunch_minutes: payload.expected_lunch_minutes,
            expected_lunch_start_time: payload.expected_lunch_start_time,
            expected_lunch_end_time: payload.expected_lunch_end_time,
            effective_from: payload.admission_date,
            active: true
          });
          await auth.supabase.from("employee_salary_history").insert({
            employee_id: data.id,
            monthly_salary: payload.monthly_salary,
            daily_rate: payload.daily_rate,
            daily_rate_mode: payload.daily_rate_mode,
            effective_from: payload.admission_date,
            valid_from: payload.admission_date,
            reason: "Importação de funcionários",
            changed_by: auth.context.userId
          });
          if (pin) copy.generated_pin = pin;
        }
      }
      resultRows.push(copy);
    }

    const safeSummary = resultRows.map((row) => {
      const safeRow: Record<string, unknown> = { ...row };
      delete safeRow.pin;
      delete safeRow.generated_pin;
      return safeRow;
    });
    await auth.supabase.from("employee_import_batches").insert({
      imported_by: auth.context.id,
      total_rows: resultRows.length,
      created_count: resultRows.filter((row) => row.action === "create" && !row.errors.length).length,
      updated_count: resultRows.filter((row) => row.action === "update" && !row.errors.length).length,
      error_count: resultRows.filter((row) => row.errors.length).length,
      generated_pin_count: resultRows.filter((row) => row.generated_pin).length,
      summary: safeSummary as any
    });
    await writeAuditLog({ supabase: auth.supabase, context: auth.context, action: "import_employees", entity: "employees", newData: { total: resultRows.length, created: resultRows.filter((row) => row.action === "create").length, updated: resultRows.filter((row) => row.action === "update").length } });

    const table = buildImportReportTable(resultRows);
    table.branding = await getTenantExportBranding(auth.rawSupabase, auth.context.tenantId, auth.context.tenantName);
    if (body.format === "pdf") return fileResponse(await createPdfBuffer(table), "relatorio-importacao-funcionarios.pdf", "application/pdf");
    if (body.format === "xlsx") return fileResponse(await createXlsxBuffer(table), "relatorio-importacao-funcionarios.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return ok({ rows: resultRows, summary: table.summary });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erro ao confirmar importação.", 500);
  }
}
