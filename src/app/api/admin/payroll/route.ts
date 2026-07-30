import crypto from "crypto";
import { NextRequest } from "next/server";
import { calculatePayrollItemWithEngines } from "@/lib/services/payroll-engine";
import { eachDateInclusive, normalizeMoney } from "@/lib/calculations";
import { fetchScheduleContext } from "@/lib/services/schedule-engine";
import { requireAdmin } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { fail, ok, readJson } from "@/lib/server/http";
import { canAccessAllBranches, canAccessBranch, canManagePayroll, canViewFinancialData, scopeByBranch } from "@/lib/server/branch-permissions";
import { getSystemSettings } from "@/lib/server/settings";
import { buildPayrollClosureChecklist } from "@/lib/services/payroll-checklist";
import { pendingHolidayDecisions } from "@/lib/services/holiday-operations";
import { payrollCreateSchema, payrollStatusSchema, zodErrorMessage } from "@/lib/validation/schemas";

function buildPayrollIdempotencyKey(body: any) {
  const normalized = {
    branch_id: body.branch_id || "all",
    period_type: body.period_type || "monthly",
    start_date: body.start_date,
    end_date: body.end_date,
    payment_day: body.payment_day ? Number(body.payment_day) : "all",
    employment_type: body.employment_type || "all",
    employee_id: body.employee_id || "all",
    role: String(body.role || "").trim().toLowerCase() || "all"
  };
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function countIncompleteEntryDays(entries: any[]) {
  const groups = new Map<string, any[]>();
  entries.forEach((entry) => {
    const key = `${entry.employee_id}:${entry.entry_date}`;
    groups.set(key, [...(groups.get(key) || []), entry]);
  });
  let missingEndShift = 0;
  let missingLunchReturn = 0;
  let missingFinalAfterLunch = 0;
  groups.forEach((rows) => {
    const validRows = rows.filter((entry) => ["valid", "pending_review", "adjusted"].includes(entry.status));
    if (validRows.some((entry) => entry.action === "start_shift") && !validRows.some((entry) => entry.action === "end_shift")) missingEndShift += 1;
    if (validRows.some((entry) => entry.action === "start_lunch") && !validRows.some((entry) => entry.action === "end_lunch")) missingLunchReturn += 1;
    if (validRows.some((entry) => entry.action === "end_lunch") && !validRows.some((entry) => entry.action === "end_shift")) missingFinalAfterLunch += 1;
  });
  return { missingEndShift, missingLunchReturn, missingFinalAfterLunch };
}

function resolveSalarySnapshot(employee: any, history: any[], startDate: string, endDate: string) {
  const candidates = history
    .filter((item) => item.employee_id === employee.id)
    .filter((item) => {
      const validFrom = item.valid_from || item.effective_from || employee.admission_date;
      const validUntil = item.valid_until || "9999-12-31";
      return validFrom <= endDate && validUntil >= startDate;
    })
    .sort((a, b) => String(a.valid_from || a.effective_from).localeCompare(String(b.valid_from || b.effective_from)));

  if (!candidates.length) {
    return {
      employee,
      salaryHistory: null,
      snapshot: {
        source: "current_employee_record",
        monthly_salary: employee.monthly_salary,
        daily_rate: employee.daily_rate,
        daily_rate_mode: employee.daily_rate_mode
      }
    };
  }

  const dates = eachDateInclusive(startDate, endDate);
  const segments = new Map<string, { salary_history_id: string; monthly_salary: number; daily_rate: number | null; daily_rate_mode: string; days: number; valid_from: string; valid_until: string | null }>();
  let monthlySalaryTotal = 0;
  let latest = candidates[0];

  for (const date of dates) {
    const match = [...candidates].reverse().find((item) => {
      const validFrom = item.valid_from || item.effective_from || employee.admission_date;
      const validUntil = item.valid_until || "9999-12-31";
      return validFrom <= date && validUntil >= date;
    }) || null;
    const monthlySalary = Number(match?.monthly_salary ?? employee.monthly_salary ?? 0);
    monthlySalaryTotal += monthlySalary;
    if (match) {
      latest = match;
      const key = String(match.id);
      const existing = segments.get(key);
      segments.set(key, {
        salary_history_id: key,
        monthly_salary: monthlySalary,
        daily_rate: match.daily_rate === null || match.daily_rate === undefined ? null : Number(match.daily_rate),
        daily_rate_mode: match.daily_rate_mode,
        days: (existing?.days || 0) + 1,
        valid_from: match.valid_from || match.effective_from,
        valid_until: match.valid_until || null
      });
    }
  }

  const weightedMonthlySalary = normalizeMoney(monthlySalaryTotal / Math.max(1, dates.length));
  const employeeWithHistoricalSalary = {
    ...employee,
    monthly_salary: weightedMonthlySalary,
    daily_rate: latest.daily_rate === null || latest.daily_rate === undefined ? employee.daily_rate : Number(latest.daily_rate),
    daily_rate_mode: latest.daily_rate_mode || employee.daily_rate_mode
  };

  return {
    employee: employeeWithHistoricalSalary,
    salaryHistory: latest,
    snapshot: {
      source: "employee_salary_history_weighted",
      monthly_salary: weightedMonthlySalary,
      daily_rate: employeeWithHistoricalSalary.daily_rate,
      daily_rate_mode: employeeWithHistoricalSalary.daily_rate_mode,
      period_days: dates.length,
      segments: [...segments.values()]
    }
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!canViewFinancialData(auth.context)) return fail("Você não tem permissão para acessar a pré-folha e conferência de jornada.", 403);
  const id = request.nextUrl.searchParams.get("id");
  const branchId = request.nextUrl.searchParams.get("branchId");
  const paymentDay = request.nextUrl.searchParams.get("paymentDay");
  const status = request.nextUrl.searchParams.get("status");
  let periodsQuery = auth.supabase.from("payroll_periods").select("*, branches:branches!payroll_periods_branch_id_fkey(name)").order("created_at", { ascending: false }).limit(200);
  if (id) periodsQuery = periodsQuery.eq("id", id);
  periodsQuery = scopeByBranch(periodsQuery, auth.context, "branch_id");
  if (branchId) {
    if (!canAccessBranch(auth.context, branchId)) return fail("Você não tem acesso a esta filial.", 403);
    periodsQuery = periodsQuery.eq("branch_id", branchId);
  }
  if (paymentDay) periodsQuery = periodsQuery.eq("payment_day", Number(paymentDay));
  if (status) periodsQuery = periodsQuery.eq("status", status);
  const { data: periods, error } = await periodsQuery;
  if (error) return fail("Erro ao listar folhas.", 500, error.message);

  let items: any[] = [];
  if (id) {
    const itemQuery = scopeByBranch(auth.supabase
      .from("payroll_items")
      .select("*")
      .eq("payroll_period_id", id), auth.context, "branch_id")
      .order("employee_name", { ascending: true });
    const { data: itemData, error: itemError } = await itemQuery;
    if (itemError) return fail("Erro ao listar itens da folha.", 500, itemError.message);
    items = itemData || [];
  }
  return ok({ periods: periods || [], items });
}

export async function POST(_request: NextRequest) {
  return fail("O motor legado está em modo somente leitura. Use a pré-folha profissional v5.1.", 409, { code: "LEGACY_PAYROLL_READ_ONLY" });
}

async function _legacyPostReadOnlyPreserved(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!canManagePayroll(auth.context)) return fail("Você não tem permissão para gerar a pré-folha e conferência de jornada.", 403);
  try {
    const rawBody = await readJson<unknown>(request);
    const parsedBody = payrollCreateSchema.safeParse(rawBody);
    if (!parsedBody.success) return fail(zodErrorMessage(parsedBody.error), 400);
    const body = parsedBody.data;
    if (body.branch_id && !canAccessBranch(auth.context, body.branch_id)) return fail("Você não tem acesso a esta filial.", 403);
    if (!body.branch_id && !canAccessAllBranches(auth.context)) return fail("Selecione uma filial permitida para gerar a folha.", 403);

    const idempotencyKey = buildPayrollIdempotencyKey(body);
    const { data: existingPeriod, error: existingPeriodError } = await auth.supabase
      .from("payroll_periods")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existingPeriodError && !String(existingPeriodError.message || "").toLowerCase().includes("idempotency_key")) {
      return fail("Erro ao verificar duplicidade da folha.", 500, existingPeriodError.message);
    }
    const editableExistingStatuses = new Set(["draft", "incomplete_preview", "checking", "ready", "reviewed", "reopened"]);
    if (existingPeriod && !editableExistingStatuses.has(existingPeriod.status)) {
      const { count } = await auth.supabase
        .from("payroll_items")
        .select("id", { count: "exact", head: true })
        .eq("payroll_period_id", existingPeriod.id);
      return ok({
        period: existingPeriod,
        itemsCreated: count || 0,
        generatedStatus: existingPeriod.status,
        duplicated: true,
        message: "Já existe uma folha para este período e filtro. Abrimos a folha existente para evitar duplicidade."
      });
    }

    let period: any;
    let regenerated = false;
    if (existingPeriod) {
      regenerated = true;
      // Mantém a memória anterior íntegra durante todo o recálculo. A troca dos
      // itens ocorre em uma única transação após todas as validações.
      period = { ...existingPeriod, status: "draft" };
    } else {
      const { data: createdPeriod, error: periodError } = await auth.supabase
        .from("payroll_periods")
        .insert({
          title: body.title,
          period_type: body.period_type || "monthly",
          start_date: body.start_date,
          end_date: body.end_date,
          branch_id: body.branch_id || null,
          status: "draft",
          payment_day: body.payment_day ? Number(body.payment_day) : null,
          created_by: auth.context.userId,
          notes: body.notes || null,
          idempotency_key: idempotencyKey
        })
        .select("*")
        .single();
      if (periodError) return fail("Erro ao criar período de folha.", 500, periodError.message);
      period = createdPeriod;
    }

    let employeesQuery = scopeByBranch(auth.supabase.from("employees").select("*, branches:branches!employees_branch_id_fkey(name)").eq("active", true).order("full_name"), auth.context, "branch_id");
    if (body.branch_id) employeesQuery = employeesQuery.eq("branch_id", body.branch_id);
    if (body.employee_id) employeesQuery = employeesQuery.eq("id", body.employee_id);
    if (body.role) employeesQuery = employeesQuery.ilike("role", `%${body.role}%`);
    if (body.employment_type) employeesQuery = employeesQuery.eq("employment_type", body.employment_type);
    if (body.payment_day) employeesQuery = employeesQuery.eq("payment_day", Number(body.payment_day));
    const [{ data: employees, error: employeesError }, { data: entries, error: entriesError }, { data: justifications, error: justificationsError }] =
      await Promise.all([
        employeesQuery,
        scopeByBranch(auth.supabase.from("time_entries").select("*").gte("entry_date", body.start_date).lte("entry_date", body.end_date), auth.context, "branch_id"),
        scopeByBranch(auth.supabase.from("absence_justifications").select("*").gte("absence_date", body.start_date).lte("absence_date", body.end_date), auth.context, "branch_id")
      ]);

    if (employeesError) throw new Error(employeesError.message);
    if (entriesError) throw new Error(entriesError.message);
    if (justificationsError) throw new Error(justificationsError.message);

    const employeeIds = (employees || []).map((employee: any) => employee.id);
    const { data: salaryHistory, error: salaryHistoryError } = await auth.supabase
      .from("employee_salary_history")
      .select("*")
      .in("employee_id", employeeIds.length ? employeeIds : ["00000000-0000-0000-0000-000000000000"])
      .lte("valid_from", body.end_date)
      .or(`valid_until.is.null,valid_until.gte.${body.start_date}`);
    if (salaryHistoryError) throw new Error(salaryHistoryError.message);

    const settings = await getSystemSettings(auth.supabase);
    const branchIds = [...new Set((employees || []).map((employee: any) => employee.branch_id))] as string[];
    const { schedules, holidays } = await fetchScheduleContext({
      supabase: auth.supabase,
      employeeIds,
      branchIds,
      startDate: body.start_date,
      endDate: body.end_date
    });
    const pendingHolidays = pendingHolidayDecisions(holidays);
    const { data: overtimeReviews, error: overtimeError } = await auth.supabase
      .from("overtime_reviews")
      .select("*")
      .in("employee_id", employeeIds.length ? employeeIds : ["00000000-0000-0000-0000-000000000000"])
      .gte("entry_date", body.start_date)
      .lte("entry_date", body.end_date);
    if (overtimeError) throw new Error(overtimeError.message);

    const items = (employees || []).map((employee: any) => {
      const salary = resolveSalarySnapshot(employee, salaryHistory || [], body.start_date, body.end_date);
      const calculation = calculatePayrollItemWithEngines({
        employee: salary.employee,
        entries: (entries || []).filter((entry: any) => entry.employee_id === salary.employee.id),
        justifications: (justifications || []).filter((justification: any) => justification.employee_id === salary.employee.id) as any,
        holidays: holidays as any,
        schedules,
        overtimeReviews: (overtimeReviews || []).filter((review: any) => review.employee_id === salary.employee.id),
        settings,
        startDate: body.start_date,
        endDate: body.end_date,
        periodType: body.period_type || "monthly"
      });
      return {
        payroll_period_id: period.id,
        employee_id: employee.id,
        branch_id: employee.branch_id,
        employee_name: employee.full_name,
        branch_name: employee.branches?.name || "",
        role: employee.role,
        employment_type: employee.employment_type,
        pix_key: employee.pix_key,
        bank_name: employee.bank_name,
        bank_agency: employee.bank_agency,
        bank_account: employee.bank_account,
        bank_account_type: employee.bank_account_type,
        period_status_snapshot: period.status,
        ...calculation,
        calculation_snapshot: {
          employee: {
            id: employee.id,
            full_name: employee.full_name,
            branch_id: employee.branch_id,
            employment_type: employee.employment_type,
            monthly_salary: salary.employee.monthly_salary,
            daily_rate: salary.employee.daily_rate,
            daily_rate_mode: salary.employee.daily_rate_mode,
            expected_daily_minutes: employee.expected_daily_minutes,
            work_days: employee.work_days,
            payment_day: employee.payment_day || null,
            salary_snapshot: salary.snapshot
          },
          settings,
          formula: {
            base_rule: calculation.base_calculation_rule,
            base_salary: calculation.base_salary,
            daily_rate: calculation.daily_rate,
            expected_days: calculation.expected_work_days,
            paid_holiday_days: calculation.paid_holiday_days,
            absence_discount: calculation.absence_discount_amount,
            overtime_amount: calculation.overtime_amount,
            extra_day_amount: calculation.extra_day_amount
          },
          generated_at: new Date().toISOString()
        }
      };
    });

    const selectedEmployeeIds = new Set(employeeIds);
    const scopedEntries = (entries || []).filter((entry: any) => selectedEmployeeIds.has(entry.employee_id));
    const scopedJustifications = (justifications || []).filter((justification: any) => selectedEmployeeIds.has(justification.employee_id));
    const scopedOvertime = (overtimeReviews || []).filter((review: any) => selectedEmployeeIds.has(review.employee_id));
    const incompleteEntryDays = countIncompleteEntryDays(scopedEntries);
    const incompleteReasons = [
      { key: "employees_without_points", label: "Funcionários sem nenhum ponto no período", count: items.filter((item: any) => Number(item.expected_work_days || 0) > 0 && Number(item.worked_days || 0) === 0).length },
      { key: "discounted_absences", label: "Faltas sem abono/justificativa refletidas na folha", count: items.filter((item: any) => Number(item.discounted_absences || 0) > 0 || Number(item.identified_absences || 0) > 0).length },
      { key: "negative_amount", label: "Itens com líquido negativo", count: items.filter((item: any) => Number(item.final_amount || 0) < 0).length },
      { key: "missing_salary", label: "Funcionários sem salário ou diária", count: items.filter((item: any) => !Number(item.base_salary || item.daily_rate || 0)).length },
      { key: "missing_end_shift", label: "Expedientes sem saída final", count: incompleteEntryDays.missingEndShift },
      { key: "missing_lunch_return", label: "Saídas de almoço sem retorno", count: incompleteEntryDays.missingLunchReturn },
      { key: "missing_final_after_lunch", label: "Retornos de almoço sem saída final", count: incompleteEntryDays.missingFinalAfterLunch },
      { key: "pending_point_reviews", label: "Pontos/ocorrências pendentes de revisão", count: scopedEntries.filter((entry: any) => entry.status === "pending_review" || entry.occurrence_review_status === "pending_review").length },
      { key: "outside_radius_pending", label: "Pontos fora do raio pendentes", count: scopedEntries.filter((entry: any) => entry.status === "pending_review" && entry.inside_allowed_radius === false).length },
      { key: "poor_gps_accuracy", label: "Pontos com GPS impreciso pendentes", count: scopedEntries.filter((entry: any) => entry.status === "pending_review" && Number(entry.gps_accuracy_meters || 0) > 0).length },
      { key: "pending_justifications", label: "Justificativas pendentes", count: scopedJustifications.filter((item: any) => item.status === "pending").length },
      { key: "pending_overtime", label: "Horas extras pendentes", count: scopedOvertime.filter((item: any) => item.status === "pending").length },
      { key: "pending_holiday_decisions", label: "Feriados aguardando decisão de funcionamento", count: pendingHolidays.length },
      { key: "missing_items", label: "Folha sem itens", count: items.length === 0 ? 1 : 0 }
    ].filter((item) => item.count > 0);
    const generatedStatus = incompleteReasons.length > 0 ? "incomplete_preview" : "draft";
    const { error: replaceError } = await auth.supabase.rpc("replace_payroll_items_transactional", {
      p_period_id: period.id,
      p_items: items
    });
    if (replaceError) throw new Error(`Não foi possível salvar a memória da folha: ${replaceError.message}`);

    const { data: updatedPeriod, error: statusError } = await auth.supabase
      .from("payroll_periods")
      .update({
        title: body.title,
        period_type: body.period_type || "monthly",
        start_date: body.start_date,
        end_date: body.end_date,
        branch_id: body.branch_id || null,
        payment_day: body.payment_day ? Number(body.payment_day) : null,
        notes: body.notes || null,
        status: generatedStatus,
        closed_at: null,
        reopened_at: null,
        reopened_reason: null,
        closure_checklist: null,
        closure_override_reason: null,
        closure_snapshot: generatedStatus === "incomplete_preview" ? {
          warning: "PREVIA_INCOMPLETA",
          message: "Esta folha ainda possui pendências e não deve ser usada para pagamento sem conferência.",
          reasons: incompleteReasons,
          affected_items: incompleteReasons.reduce((sum, item) => sum + Number(item.count || 0), 0),
          generated_at: new Date().toISOString()
        } : null
      })
      .eq("id", period.id)
      .select("*")
      .single();
    if (statusError) throw new Error(statusError.message);

    await writeAuditLog({
      supabase: auth.supabase,
      context: auth.context,
      action: "generate",
      entity: "payroll_periods",
      entityId: period.id,
      newData: { period: updatedPeriod || period, items: items.length, generatedStatus, regenerated }
    });
    return ok({
      period: updatedPeriod || period,
      itemsCreated: items.length,
      generatedStatus,
      regenerated,
      message: regenerated
        ? "Folha recalculada com os dados, decisões de feriado e ajustes mais recentes."
        : undefined
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erro ao gerar folha.", 500);
  }
}

export async function PATCH(_request: NextRequest) {
  return fail("Alterações no motor legado foram desativadas. Use o fluxo profissional v5.1.", 409, { code: "LEGACY_PAYROLL_READ_ONLY" });
}

async function _legacyPatchReadOnlyPreserved(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!canManagePayroll(auth.context)) return fail("Você não tem permissão para alterar a pré-folha e conferência de jornada.", 403);
  const rawBody = await readJson<unknown>(request);
  const parsedBody = payrollStatusSchema.safeParse(rawBody);
  if (!parsedBody.success) return fail(zodErrorMessage(parsedBody.error), 400);
  const body = parsedBody.data;
  const { data: oldData } = await auth.supabase.from("payroll_periods").select("*").eq("id", body.id).maybeSingle();
  if (!oldData) return fail("Folha não encontrada.", 404);
  if (oldData.branch_id && !canAccessBranch(auth.context, oldData.branch_id)) return fail("Você não tem acesso a esta folha.", 403);
  if (["closed", "closed_with_exceptions", "paid"].includes(oldData.status) && body.status !== "reopened" && body.status !== oldData.status) {
    return fail("Folha fechada, fechada com exceção ou paga não pode ter status alterado. Reabertura somente por admin master com justificativa.", 409);
  }
  if (body.status === "reopened" && auth.context.role !== "master_admin") {
    return fail("Somente admin master pode reabrir folha fechada.", 403);
  }
  if (body.status === "reopened" && !String(body.reason || "").trim()) {
    return fail("Informe o motivo da reabertura da folha.", 400);
  }
  const allowedTransitions: Record<string, string[]> = {
    draft: ["reviewed", "closed"],
    incomplete_preview: ["draft", "reviewed", "closed"],
    checking: ["draft", "reviewed", "closed"],
    ready: ["reviewed", "closed"],
    reviewed: ["draft", "closed"],
    reopened: ["draft", "reviewed", "closed"],
    closed: ["paid", "reopened"],
    closed_with_exceptions: ["paid", "reopened"],
    paid: ["reopened"]
  };
  if (body.status !== oldData.status && !(allowedTransitions[oldData.status] || []).includes(body.status)) {
    return fail(`Transição de ${oldData.status} para ${body.status} não é permitida.`, 409);
  }
  const payload: Record<string, unknown> = {
    status: body.status,
    notes: body.notes ?? oldData?.notes ?? null
  };
  if (body.status === "closed") {
    const checklist = await buildPayrollClosureChecklist(auth.supabase, body.id);
    await auth.supabase.from("payroll_closure_checks").delete().eq("payroll_period_id", body.id);
    await auth.supabase.from("payroll_closure_checks").insert(checklist.checks.map((item) => ({ payroll_period_id: body.id, ...item })));
    const overrideReason = String(body.overrideReason || "").trim();
    const pendingHolidayCheck = checklist.checks.find((item) => item.check_type === "pending_holiday_decisions" && item.count > 0);
    if (pendingHolidayCheck) {
      return ok({
        requiresClosureReview: true,
        holidayDecisionBlocking: true,
        allowMasterOverride: false,
        checklist: checklist.checks,
        summary: checklist.summary,
        message: "Existem feriados sem decisão de funcionamento. Defina se cada unidade abrirá ou ficará fechada antes de concluir a folha. Esta pendência não permite fechamento com exceção."
      });
    }
    if (checklist.hasCritical && auth.context.role !== "master_admin") {
      return ok({
        requiresClosureReview: true,
        checklist: checklist.checks,
        summary: checklist.summary,
        message: "A folha possui pendências críticas. Somente o admin master pode fechar com exceção formal."
      });
    }
    if (checklist.hasCritical && auth.context.role === "master_admin" && overrideReason.length < 12) {
      return ok({
        requiresClosureReview: true,
        allowMasterOverride: true,
        checklist: checklist.checks,
        summary: checklist.summary,
        message: "A folha possui pendências críticas. Informe uma justificativa formal para fechar com exceção."
      });
    }
    payload.status = checklist.hasCritical ? "closed_with_exceptions" : "closed";
    payload.closed_at = new Date().toISOString();
    payload.closure_checklist = checklist.checks;
    payload.closure_snapshot = { ...checklist.summary, closed_by: auth.context.email, closed_at: payload.closed_at, forced_by_master: checklist.hasCritical };
    payload.closure_override_reason = overrideReason || null;
  }
  if (body.status === "reopened") {
    payload.reopened_at = new Date().toISOString();
    payload.reopened_reason = body.reason;
  }
  const { data, error } = await auth.supabase.from("payroll_periods").update(payload).eq("id", body.id).select("*").single();
  if (error) return fail("Erro ao atualizar status da folha.", 500, error.message);
  await writeAuditLog({
    supabase: auth.supabase,
    context: auth.context,
    action: `payroll_${body.status}`,
    entity: "payroll_periods",
    entityId: data.id,
    oldData,
    newData: data
  });
  return ok({ period: data });
}
