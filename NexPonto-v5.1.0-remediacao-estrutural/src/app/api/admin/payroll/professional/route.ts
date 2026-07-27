import { NextRequest } from "next/server";
import { z } from "zod";
import { eachDateInclusive } from "@/lib/calculations";
import { calculateProfessionalPayrollV51, type ContractSegmentV51, type LegalBracketV51, type OvertimeApprovalV51, type SalarySegmentV51 } from "@/lib/services/professional-payroll-v51";
import type { HourBankMovementV51, HourBankMovementType } from "@/lib/services/hour-bank-v51";
import { calculateSessionAttendanceV51, type SessionAttendanceEntryV51 } from "@/lib/services/session-attendance-v51";
import { requireAdmin } from "@/lib/server/auth";
import { canAccessBranch, canManagePayroll, canViewFinancialData, scopeByBranch } from "@/lib/server/branch-permissions";
import { fail, ok, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_period"), title: z.string().trim().min(3).max(120), start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), branch_id: z.string().uuid().nullable().optional(), period_type: z.enum(["monthly", "biweekly", "custom"]).default("monthly"), notes: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("create"), payroll_period_id: z.string().uuid(), branch_id: z.string().uuid().nullable().optional(), calculation_mode: z.enum(["parallel_simulation", "homologation", "production"]).default("parallel_simulation"), idempotency_key: z.string().min(8).max(180).optional() }),
  z.object({ action: z.literal("calculate"), run_id: z.string().uuid() }),
  z.object({ action: z.literal("transition"), run_id: z.string().uuid(), target_status: z.enum(["attendance_pending", "calculated", "checking", "hr_approved", "financial_approved", "closed", "closed_with_exceptions", "exported", "paid"]), reason: z.string().trim().min(5).max(500) }),
  z.object({ action: z.literal("resolve_divergence"), divergence_id: z.string().uuid(), decision: z.enum(["acknowledged", "resolved", "accepted_exception"]), reason: z.string().trim().min(10).max(500) }),
]);

type EmployeeRow = { id: string; branch_id: string; full_name: string; monthly_salary: number | string | null; admission_date: string | null; termination_date: string | null };
type SalaryHistoryRow = { id: string; employee_id: string; monthly_salary: number | string; valid_from: string | null; effective_from: string | null; valid_until: string | null };
type ContractRow = { id: string; employee_id: string; salary_hour_divisor: number | string; salary_day_divisor: number | string; night_shift_rule: Record<string, unknown> | null; effective_from: string; effective_until: string | null; payroll_rule_sets?: { status?: string } | Array<{ status?: string }> | null };
type OvertimeRow = { id: string; employee_id: string; entry_date: string; status: string; approved_overtime_minutes: number | null; approved_percentage: number | string | null; approved_amount: number | string | null; overtime_amount: number | string | null; destination: "payment" | "hour_bank" | "split" | null; payment_minutes: number | null; bank_minutes: number | null };
type HourBankRow = { id: string; employee_id: string; movement_type: HourBankMovementType; minutes: number; status: HourBankMovementV51["status"]; movement_date: string; expires_on: string | null; reversal_of: string | null };
type WorkSessionRow = { id: string; employee_id: string; branch_id: string; work_date: string; schedule_snapshot: Record<string, unknown> | null; schedule_snapshot_checksum: string | null; contract_snapshot: Record<string, unknown> | null; status: string };
type TimeEntryRow = { id: string; employee_id: string; work_session_id: string | null; action: SessionAttendanceEntryV51["action"]; entry_timestamp: string; status: string; late_minutes: number | null; early_leave_minutes: number | null };
type LegalTableRow = { id: string; table_type: string; status: string; effective_from: string; effective_until: string | null; version: string };
type LegalBracketRow = { legal_table_id: string; sequence: number; lower_bound: number | string; upper_bound: number | string | null; rate: number | string; deduction: number | string };

function overlap(startA: string, endA: string | null, startB: string, endB: string) {
  return startA <= endB && (endA || "9999-12-31") >= startB;
}

function salarySegmentsForEmployee(employee: EmployeeRow, history: SalaryHistoryRow[], startDate: string, endDate: string): SalarySegmentV51[] {
  const dates = eachDateInclusive(startDate, endDate).filter((date) => (!employee.admission_date || date >= employee.admission_date) && (!employee.termination_date || date <= employee.termination_date));
  const groups = new Map<string, { startDate: string; endDate: string; monthlySalary: number | string; eligibleDays: number; divisorDays: number }>();
  for (const date of dates) {
    const match = history.filter((row) => row.employee_id === employee.id && (row.valid_from || row.effective_from || "0001-01-01") <= date && (row.valid_until || "9999-12-31") >= date).sort((a, b) => String(b.valid_from || b.effective_from).localeCompare(String(a.valid_from || a.effective_from)))[0];
    const key = match?.id || "current";
    const salary = match?.monthly_salary ?? employee.monthly_salary ?? 0;
    const current = groups.get(key);
    groups.set(key, current ? { ...current, endDate: date, eligibleDays: current.eligibleDays + 1 } : { startDate: date, endDate: date, monthlySalary: salary, eligibleDays: 1, divisorDays: 30 });
  }
  return [...groups.values()];
}

function contractSegmentsForEmployee(employeeId: string, rows: ContractRow[], startDate: string, endDate: string): ContractSegmentV51[] {
  return rows.filter((row) => row.employee_id === employeeId && overlap(row.effective_from, row.effective_until, startDate, endDate)).sort((a, b) => a.effective_from.localeCompare(b.effective_from)).map((row) => ({
    startDate: row.effective_from < startDate ? startDate : row.effective_from,
    endDate: !row.effective_until || row.effective_until > endDate ? endDate : row.effective_until,
    salaryHourDivisor: Number(row.salary_hour_divisor),
    nightPremiumPercent: Number(row.night_shift_rule?.premium_percent ?? 0),
    homologated: (Array.isArray(row.payroll_rule_sets) ? row.payroll_rule_sets[0]?.status : row.payroll_rule_sets?.status) === "homologated",
  }));
}

function overtimeForEmployee(employeeId: string, rows: OvertimeRow[]): OvertimeApprovalV51[] {
  return rows.filter((row) => row.employee_id === employeeId && ["approved", "adjusted"].includes(row.status)).flatMap((row) => {
    const total = Number(row.approved_overtime_minutes || 0);
    const paymentMinutes = row.destination === "split" ? Number(row.payment_minutes || 0) : row.destination === "hour_bank" ? 0 : total;
    const bankMinutes = row.destination === "split" ? Number(row.bank_minutes || 0) : row.destination === "hour_bank" ? total : 0;
    const result: OvertimeApprovalV51[] = [];
    if (paymentMinutes > 0) result.push({ entryDate: row.entry_date, minutes: paymentMinutes, percentage: Number(row.approved_percentage ?? 50), approvedValue: row.approved_amount ?? row.overtime_amount, destination: "payment" });
    if (bankMinutes > 0) result.push({ entryDate: row.entry_date, minutes: bankMinutes, percentage: Number(row.approved_percentage ?? 50), destination: "hour_bank" });
    return result;
  });
}

function nightMinutesForEmployee(employeeId: string, sessions: WorkSessionRow[]) {
  return sessions.filter((session) => session.employee_id === employeeId).reduce((total, session) => total + Number(session.schedule_snapshot?.night_minutes ?? 0), 0);
}

function nightByDateForEmployee(employeeId: string, sessions: WorkSessionRow[]) {
  return sessions.filter((session) => session.employee_id === employeeId).map((session) => ({
    date: session.work_date,
    minutes: Number(session.schedule_snapshot?.nightMinutes ?? session.schedule_snapshot?.night_minutes ?? 0),
  })).filter((segment) => Number.isFinite(segment.minutes) && segment.minutes > 0);
}

function selectLegalTable(tables: LegalTableRow[], type: string, startDate: string, endDate: string) {
  const candidates = tables.filter((table) => table.table_type === type && table.status === "homologated" && overlap(table.effective_from, table.effective_until, startDate, endDate)).sort((a, b) => b.effective_from.localeCompare(a.effective_from) || b.version.localeCompare(a.version));
  return candidates.length === 1 ? candidates[0] : null;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!canViewFinancialData(auth.context)) return fail("Você não possui permissão financeira.", 403);
  const runId = request.nextUrl.searchParams.get("runId");
  const [periodsResult, runsResult] = await Promise.all([
    scopeByBranch(auth.supabase.from("payroll_periods").select("id,title,start_date,end_date,branch_id,status,period_type,created_at").order("created_at", { ascending: false }).limit(100), auth.context, "branch_id"),
    scopeByBranch(auth.supabase.from("payroll_calculation_runs").select("*").order("created_at", { ascending: false }).limit(100), auth.context, "branch_id"),
  ]);
  if (periodsResult.error || runsResult.error) return fail("Erro ao carregar a pré-folha profissional.", 500, periodsResult.error?.message || runsResult.error?.message);
  let rubrics: unknown[] = [];
  let divergences: unknown[] = [];
  if (runId) {
    const [rubricResult, divergenceResult] = await Promise.all([
      auth.supabase.from("payroll_item_rubrics").select("*").eq("calculation_run_id", runId).order("employee_id").order("sequence"),
      auth.supabase.from("payroll_divergences").select("*").eq("calculation_run_id", runId).order("severity").order("created_at"),
    ]);
    if (rubricResult.error || divergenceResult.error) return fail("Erro ao carregar a memória do cálculo.", 500, rubricResult.error?.message || divergenceResult.error?.message);
    rubrics = rubricResult.data || [];
    divergences = divergenceResult.data || [];
  }
  return ok({ periods: periodsResult.data || [], runs: runsResult.data || [], rubrics, divergences });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!canManagePayroll(auth.context)) return fail("Você não possui permissão para processar a pré-folha.", 403);
  const parsed = actionSchema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) return fail("Revise a operação da pré-folha.", 422, parsed.error.flatten());
  const body = parsed.data;

  if (body.action === "create_period") {
    if (body.end_date < body.start_date) return fail("A data final deve ser igual ou posterior à inicial.", 422);
    if (body.branch_id && !canAccessBranch(auth.context, body.branch_id)) return fail("Você não possui acesso à filial.", 403);
    const idempotencyKey = `${auth.context.tenantId}:${body.branch_id || "all"}:${body.start_date}:${body.end_date}:${body.period_type}`;
    const { data: existing } = await auth.supabase.from("payroll_periods").select("*").eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existing) return ok({ period: existing, duplicated: true });
    const { data, error } = await auth.supabase.from("payroll_periods").insert({ title: body.title, start_date: body.start_date, end_date: body.end_date, branch_id: body.branch_id || null, period_type: body.period_type, status: "draft", notes: body.notes || null, created_by: auth.context.userId, idempotency_key: idempotencyKey }).select("*").single();
    if (error) return fail("Erro ao criar a competência.", 422, error.message);
    return ok({ period: data, duplicated: false });
  }

  if (body.action === "create") {
    if (body.branch_id && !canAccessBranch(auth.context, body.branch_id)) return fail("Você não possui acesso à filial.", 403);
    const { data, error } = await auth.rawSupabase.rpc("create_payroll_run_v51", {
      p_tenant_id: auth.context.tenantId,
      p_payroll_period_id: body.payroll_period_id,
      p_branch_id: body.branch_id || null,
      p_mode: body.calculation_mode,
      p_idempotency_key: body.idempotency_key || `${auth.context.tenantId}:${body.payroll_period_id}:${body.calculation_mode}`,
      p_actor: auth.context.userId,
    });
    if (error) return fail(error.message.includes("ACTIVE_PAYROLL_RUN_EXISTS") ? "Já existe um processamento ativo para esta competência." : "Erro ao criar o processamento.", 422, error.message);
    return ok({ run: data });
  }

  if (body.action === "transition") {
    const { data, error } = await auth.rawSupabase.rpc("transition_payroll_run_v51", { p_tenant_id: auth.context.tenantId, p_run_id: body.run_id, p_target_status: body.target_status, p_reason: body.reason, p_actor: auth.context.userId });
    if (error) return fail("Não foi possível alterar a etapa da pré-folha.", 422, error.message);
    return ok({ run: data });
  }

  if (body.action === "resolve_divergence") {
    const { data, error } = await auth.rawSupabase.rpc("resolve_payroll_divergence_v51", { p_tenant_id: auth.context.tenantId, p_divergence_id: body.divergence_id, p_decision: body.decision, p_reason: body.reason, p_actor: auth.context.userId });
    if (error) return fail("Não foi possível registrar a decisão da divergência.", 422, error.message);
    return ok({ divergence: data });
  }

  const { data: run, error: runError } = await auth.supabase.from("payroll_calculation_runs").select("*").eq("id", body.run_id).maybeSingle();
  if (runError || !run) return fail("Processamento não encontrado.", 404, runError?.message);
  const { data: period, error: periodError } = await auth.supabase.from("payroll_periods").select("*").eq("id", run.payroll_period_id).maybeSingle();
  if (periodError || !period) return fail("Competência não encontrada.", 404, periodError?.message);
  if (run.branch_id && !canAccessBranch(auth.context, run.branch_id)) return fail("Você não possui acesso à filial.", 403);

  let employeeQuery = scopeByBranch(auth.supabase.from("employees").select("id,branch_id,full_name,monthly_salary,admission_date,termination_date").eq("active", true), auth.context, "branch_id");
  if (run.branch_id) employeeQuery = employeeQuery.eq("branch_id", run.branch_id);
  const { data: employeeData, error: employeeError } = await employeeQuery;
  if (employeeError) return fail("Erro ao carregar funcionários.", 500, employeeError.message);
  const employees = (employeeData || []) as unknown as EmployeeRow[];
  const employeeIds = employees.map((employee) => employee.id);
  const emptyId = "00000000-0000-0000-0000-000000000000";

  const [salaryResult, contractResult, overtimeResult, hourBankResult, sessionResult, legalResult] = await Promise.all([
    auth.supabase.from("employee_salary_history").select("id,employee_id,monthly_salary,valid_from,effective_from,valid_until").in("employee_id", employeeIds.length ? employeeIds : [emptyId]).lte("valid_from", period.end_date).or(`valid_until.is.null,valid_until.gte.${period.start_date}`),
    auth.supabase.from("employee_contract_rules").select("id,employee_id,salary_hour_divisor,salary_day_divisor,night_shift_rule,effective_from,effective_until,payroll_rule_sets(status)").in("employee_id", employeeIds.length ? employeeIds : [emptyId]).lte("effective_from", period.end_date).or(`effective_until.is.null,effective_until.gte.${period.start_date}`),
    auth.supabase.from("overtime_reviews").select("id,employee_id,entry_date,status,approved_overtime_minutes,approved_percentage,approved_amount,overtime_amount,destination,payment_minutes,bank_minutes").in("employee_id", employeeIds.length ? employeeIds : [emptyId]).gte("entry_date", period.start_date).lte("entry_date", period.end_date),
    auth.supabase.from("hour_bank_movements").select("id,employee_id,movement_type,minutes,status,movement_date,expires_on,reversal_of").in("employee_id", employeeIds.length ? employeeIds : [emptyId]).lte("movement_date", period.end_date),
    auth.supabase.from("work_sessions").select("id,employee_id,branch_id,work_date,schedule_snapshot,schedule_snapshot_checksum,contract_snapshot,status").in("employee_id", employeeIds.length ? employeeIds : [emptyId]).gte("work_date", period.start_date).lte("work_date", period.end_date),
    auth.supabase.from("payroll_legal_tables").select("id,table_type,status,effective_from,effective_until,version").eq("status", "homologated").lte("effective_from", period.end_date).or(`effective_until.is.null,effective_until.gte.${period.start_date}`),
  ]);
  const firstError = [salaryResult, contractResult, overtimeResult, hourBankResult, sessionResult, legalResult].find((result) => result.error)?.error;
  if (firstError) return fail("Erro ao montar os dados históricos do cálculo.", 500, firstError.message);

  const sessions = (sessionResult.data || []) as unknown as WorkSessionRow[];
  const sessionIds = sessions.map((session) => session.id);
  const { data: timeEntryData, error: timeEntryError } = await auth.supabase
    .from("time_entries")
    .select("id,employee_id,work_session_id,action,entry_timestamp,status,late_minutes,early_leave_minutes")
    .in("work_session_id", sessionIds.length ? sessionIds : [emptyId])
    .order("entry_timestamp", { ascending: true });
  if (timeEntryError) return fail("Erro ao carregar as marcações vinculadas às jornadas.", 500, timeEntryError.message);
  const timeEntries = (timeEntryData || []) as unknown as TimeEntryRow[];

  const legalTables = (legalResult.data || []) as unknown as LegalTableRow[];
  const inssTable = selectLegalTable(legalTables, "inss", period.start_date, period.end_date);
  const fgtsTable = selectLegalTable(legalTables, "fgts", period.start_date, period.end_date);
  const legalIds = [inssTable?.id, fgtsTable?.id].filter(Boolean) as string[];
  const { data: bracketData, error: bracketError } = await auth.rawSupabase.from("payroll_legal_brackets").select("legal_table_id,sequence,lower_bound,upper_bound,rate,deduction").in("legal_table_id", legalIds.length ? legalIds : [emptyId]).order("sequence");
  if (bracketError) return fail("Erro ao carregar faixas legais.", 500, bracketError.message);
  const brackets = (bracketData || []) as unknown as LegalBracketRow[];
  const inssBrackets: LegalBracketV51[] | undefined = inssTable ? brackets.filter((bracket) => bracket.legal_table_id === inssTable.id).map((bracket) => ({ lowerBound: bracket.lower_bound, upperBound: bracket.upper_bound, rateBasisPoints: Math.round(Number(bracket.rate) * 10_000), deduction: bracket.deduction })) : undefined;
  const fgtsRate = fgtsTable ? Math.round(Number(brackets.find((bracket) => bracket.legal_table_id === fgtsTable.id)?.rate || 0) * 10_000) : 0;

  const salaryRows = (salaryResult.data || []) as unknown as SalaryHistoryRow[];
  const contractRows = (contractResult.data || []) as unknown as ContractRow[];
  const overtimeRows = (overtimeResult.data || []) as unknown as OvertimeRow[];
  const hourBankRows = (hourBankResult.data || []) as unknown as HourBankRow[];
  const rubricRows: Array<Record<string, unknown>> = [];
  const divergenceRows: Array<Record<string, unknown>> = [];
  let totalEarnings = 0;
  let totalDeductions = 0;
  let totalNet = 0;

  for (const employee of employees) {
    const salarySegments = salarySegmentsForEmployee(employee, salaryRows, period.start_date, period.end_date);
    const contractSegments = contractSegmentsForEmployee(employee.id, contractRows, period.start_date, period.end_date);
    const employeeSessions = sessions.filter((session) => session.employee_id === employee.id);
    if (employeeSessions.some((session) => !session.schedule_snapshot || !session.schedule_snapshot_checksum)) divergenceRows.push({ employee_id: employee.id, branch_id: employee.branch_id, code: "HISTORICAL_SNAPSHOT_MISSING", severity: "critical", message: "Há sessão sem snapshot histórico validado.", details: {} });
    const attendance = calculateSessionAttendanceV51(
      employeeSessions.map((session) => ({ id: session.id, workDate: session.work_date, status: session.status, scheduleSnapshot: session.schedule_snapshot })),
      timeEntries.filter((entry) => entry.employee_id === employee.id && entry.work_session_id).map((entry) => ({ id: entry.id, workSessionId: entry.work_session_id as string, action: entry.action, occurredAt: entry.entry_timestamp, status: entry.status, lateMinutes: entry.late_minutes, earlyLeaveMinutes: entry.early_leave_minutes })),
    );
    const result = calculateProfessionalPayrollV51({
      employeeId: employee.id,
      competenceStart: period.start_date,
      competenceEnd: period.end_date,
      salarySegments,
      contractSegments,
      overtime: overtimeForEmployee(employee.id, overtimeRows),
      nightMinutes: nightMinutesForEmployee(employee.id, employeeSessions),
      nightByDate: nightByDateForEmployee(employee.id, employeeSessions),
      hourBankMovements: hourBankRows.filter((movement) => movement.employee_id === employee.id).map((movement) => ({ id: movement.id, movementType: movement.movement_type, minutes: Number(movement.minutes), status: movement.status, movementDate: movement.movement_date, expiresOn: movement.expires_on, reversalOf: movement.reversal_of })),
      attendance,
      deductions: [], earnings: [], inssBrackets, fgtsRateBasisPoints: fgtsRate,
    });
    for (const rubric of result.rubrics) rubricRows.push({ employee_id: employee.id, branch_id: employee.branch_id, rubric_code: rubric.code, rubric_name: rubric.name, rubric_type: rubric.type, quantity: 1, reference_value: 0, percentage: 0, calculation_base: 0, gross_value: rubric.value, rounding_adjustment: 0, final_value: rubric.value, formula_snapshot: rubric.memory, source_type: "professional_engine_v51", sequence: 100 });
    for (const divergence of result.divergences) divergenceRows.push({ employee_id: employee.id, branch_id: employee.branch_id, code: divergence.code, severity: divergence.severity, message: divergence.message, details: {} });
    totalEarnings += Number(result.totals.earnings);
    totalDeductions += Number(result.totals.deductions);
    totalNet += Number(result.totals.net);
  }
  if (!inssTable) divergenceRows.push({ employee_id: null, branch_id: run.branch_id, code: "INSS_TABLE_AMBIGUOUS_OR_MISSING", severity: "critical", message: "Não existe uma única tabela de INSS homologada para a competência.", details: {} });
  if (!fgtsTable) divergenceRows.push({ employee_id: null, branch_id: run.branch_id, code: "FGTS_TABLE_AMBIGUOUS_OR_MISSING", severity: "critical", message: "Não existe uma única tabela de FGTS homologada para a competência.", details: {} });

  const summary = { employees: employees.length, earnings: totalEarnings.toFixed(2), deductions: totalDeductions.toFixed(2), net: totalNet.toFixed(2), divergences: divergenceRows.length, critical: divergenceRows.filter((item) => item.severity === "critical").length, calculated_at: new Date().toISOString() };
  const { data, error } = await auth.rawSupabase.rpc("replace_payroll_run_results_v51", { p_tenant_id: auth.context.tenantId, p_run_id: body.run_id, p_rubrics: rubricRows, p_divergences: divergenceRows, p_summary: summary, p_actor: auth.context.userId });
  if (error) return fail("Erro ao salvar o cálculo profissional.", 422, error.message);
  return ok({ run: data, summary });
}
