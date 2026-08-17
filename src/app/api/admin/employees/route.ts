import { NextRequest } from "next/server";
import { z } from "zod";
import { normalizeMoney } from "@/lib/calculations";
import { canAccessBranch, canViewFinancialData, maskSensitiveEmployeeFields, scopeByBranch } from "@/lib/server/branch-permissions";
import { requireAdmin } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { fail, ok, readJson } from "@/lib/server/http";
import { hashPin } from "@/lib/server/pin";
import { enforceTenantLimit } from "@/lib/server/tenant-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EmployeeRow = Record<string, unknown> & { id: string; pin_hash?: string | null; branch_id?: string | null };

const moneyInput = z.union([z.string(), z.number()]).optional().nullable();
const employeeSchema = z.object({
  id: z.string().uuid().optional(),
  registration_code: z.string().trim().max(80).optional().nullable(),
  full_name: z.string().trim().min(2).max(180),
  document: z.string().trim().max(40).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  role: z.string().trim().min(2).max(120),
  sector: z.string().trim().max(120).optional().nullable(),
  branch_id: z.string().uuid(),
  employment_type: z.enum(["mensalista", "quinzenal", "diarista"]).default("mensalista"),
  monthly_salary: moneyInput,
  daily_rate: moneyInput,
  daily_rate_mode: z.enum(["automatic", "manual"]).default("automatic"),
  pix_key: z.string().trim().max(180).optional().nullable(),
  bank_name: z.string().trim().max(120).optional().nullable(),
  bank_agency: z.string().trim().max(40).optional().nullable(),
  bank_account: z.string().trim().max(80).optional().nullable(),
  bank_account_type: z.string().trim().max(50).optional().nullable(),
  payment_day: z.union([z.string(), z.number()]).optional().nullable(),
  pin: z.string().regex(/^\d{4}$/).optional().nullable(),
  active: z.boolean().default(true),
  admission_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  termination_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  expected_start_time: z.string().regex(/^\d{2}:\d{2}$/).default("08:00"),
  expected_end_time: z.string().regex(/^\d{2}:\d{2}$/).default("17:00"),
  expected_daily_minutes: z.coerce.number().int().min(1).max(1440),
  expected_lunch_minutes: z.coerce.number().int().min(0).max(720),
  expected_lunch_start_time: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  expected_lunch_end_time: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  work_days: z.union([z.array(z.coerce.number().int().min(0).max(6)), z.string()]),
  allow_overtime: z.boolean().default(true),
  profile_notes: z.string().trim().max(1000).optional().nullable(),
  salary_valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  schedule_effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  change_reason: z.string().trim().min(5).max(500).optional(),
  salary_change_reason: z.string().trim().min(5).max(500).optional()
});

function publicEmployee(employee: EmployeeRow | null) {
  if (!employee) return null;
  const { pin_hash: pinHash, ...safe } = employee;
  return { ...safe, has_pin: Boolean(pinHash) };
}

function parseWorkDays(value: string | number[]) {
  const days = Array.isArray(value)
    ? value.map(Number)
    : value.split(",").map((item) => Number(item.trim())).filter(Number.isFinite);
  return [...new Set(days)].filter((day) => day >= 0 && day <= 6).sort();
}

function minutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function validateSchedule(input: z.infer<typeof employeeSchema>) {
  const start = minutes(input.expected_start_time);
  const end = minutes(input.expected_end_time);
  const span = end > start ? end - start : end + 1440 - start;
  if (input.expected_lunch_start_time && input.expected_lunch_end_time) {
    const lunchStart = minutes(input.expected_lunch_start_time);
    const lunchEnd = minutes(input.expected_lunch_end_time);
    const lunchSpan = lunchEnd > lunchStart ? lunchEnd - lunchStart : lunchEnd + 1440 - lunchStart;
    if (lunchSpan !== input.expected_lunch_minutes) return `A janela de intervalo possui ${lunchSpan} minutos, mas a duração informada é ${input.expected_lunch_minutes}.`;
  }
  if (span - input.expected_lunch_minutes !== input.expected_daily_minutes) {
    return `A jornada não fecha: ${span} minutos totais menos ${input.expected_lunch_minutes} de intervalo deve resultar em ${input.expected_daily_minutes} minutos.`;
  }
  return null;
}

function toRpcPayload(input: z.infer<typeof employeeSchema>, financialAllowed: boolean) {
  return {
    registration_code: input.registration_code || null,
    full_name: input.full_name,
    document: input.document || null,
    phone: input.phone || null,
    role: input.role,
    sector: input.sector || null,
    branch_id: input.branch_id,
    employment_type: input.employment_type,
    monthly_salary: financialAllowed ? normalizeMoney(input.monthly_salary) : 0,
    daily_rate: financialAllowed && input.daily_rate !== "" && input.daily_rate !== null && input.daily_rate !== undefined ? normalizeMoney(input.daily_rate) : null,
    daily_rate_mode: input.daily_rate_mode,
    pix_key: input.pix_key || null,
    bank_name: input.bank_name || null,
    bank_agency: input.bank_agency || null,
    bank_account: input.bank_account || null,
    bank_account_type: input.bank_account_type || null,
    payment_day: input.payment_day === "" || input.payment_day === null || input.payment_day === undefined ? null : Number(input.payment_day),
    active: input.active,
    admission_date: input.admission_date,
    termination_date: input.termination_date || null,
    expected_start_time: input.expected_start_time,
    expected_end_time: input.expected_end_time,
    expected_daily_minutes: input.expected_daily_minutes,
    expected_lunch_minutes: input.expected_lunch_minutes,
    expected_lunch_start_time: input.expected_lunch_start_time || null,
    expected_lunch_end_time: input.expected_lunch_end_time || null,
    work_days: parseWorkDays(input.work_days),
    allow_overtime: input.allow_overtime,
    profile_notes: input.profile_notes || null,
    financial_allowed: financialAllowed
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const params = request.nextUrl.searchParams;
  const branchId = params.get("branchId");
  const page = Math.max(1, Number(params.get("page") || 1));
  const pageSize = Math.min(100, Math.max(10, Number(params.get("pageSize") || 25)));
  const paginated = params.has("page");
  let query = scopeByBranch(
    auth.supabase.from("employees").select("*,branches:branches!employees_branch_id_fkey(name),employee_salary_history(*)", { count: "exact" }).order("full_name"),
    auth.context,
    "branch_id"
  );
  if (branchId) {
    if (!canAccessBranch(auth.context, branchId)) return fail("Você não tem acesso a esta filial.", 403);
    query = query.eq("branch_id", branchId);
  }
  if (params.get("status") === "active") query = query.eq("active", true);
  if (params.get("status") === "inactive") query = query.eq("active", false);
  if (params.get("role")) query = query.ilike("role", `%${params.get("role")}%`);
  if (params.get("paymentDay")) query = query.eq("payment_day", Number(params.get("paymentDay")));
  if (params.get("employmentType") || params.get("employment_type")) query = query.eq("employment_type", params.get("employmentType") || params.get("employment_type"));
  const safeQuery = (params.get("q") || "").replace(/[,%()]/g, " ").trim();
  if (safeQuery) query = query.or(`full_name.ilike.%${safeQuery}%,registration_code.ilike.%${safeQuery}%,document.ilike.%${safeQuery}%`);
  if (paginated) query = query.range((page - 1) * pageSize, page * pageSize - 1);
  const { data, error, count } = await query;
  if (error) return fail("Erro ao listar funcionários.", 500, error.message);
  const financialAllowed = canViewFinancialData(auth.context);
  const employees = ((data || []) as EmployeeRow[]).map(publicEmployee).map((employee) => financialAllowed ? employee : maskSensitiveEmployeeFields(employee || {}, auth.context));
  return ok({ employees, pagination: paginated ? { page, pageSize, total: count || 0 } : undefined });
}

async function saveEmployee(request: NextRequest, mode: "create" | "update") {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const parsed = employeeSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail("Revise os dados do funcionário.", 422, parsed.error.flatten());
  const input = parsed.data;
  if (mode === "create" && !input.pin) return fail("PIN inicial obrigatório com quatro dígitos.", 422);
  if (mode === "update" && !input.id) return fail("Funcionário não informado.", 400);
  if (!canAccessBranch(auth.context, input.branch_id)) return fail("Você não tem acesso a esta filial.", 403);
  const scheduleError = validateSchedule(input);
  if (scheduleError) return fail(scheduleError, 422);
  if (mode === "create") {
    try {
      await enforceTenantLimit({ supabase: auth.supabase, tenantId: auth.context.tenantId, limit: "employee_limit", currentTable: "employees" });
    } catch (cause) {
      return fail(cause instanceof Error ? cause.message : "Limite de funcionários atingido.", 409);
    }
  }

  const financialAllowed = canViewFinancialData(auth.context);
  if (mode === "update" && input.id) {
    const { data: existing } = await auth.supabase.from("employees").select("id,branch_id").eq("id", input.id).maybeSingle();
    if (!existing || !canAccessBranch(auth.context, existing.branch_id)) return fail("Funcionário não encontrado ou fora do seu escopo.", 404);
  }

  const reason = input.change_reason || input.salary_change_reason || (mode === "create" ? "Cadastro inicial do funcionário" : "Atualização administrativa do funcionário");
  const { data, error } = await auth.rawSupabase.rpc("upsert_employee_v4", {
    p_tenant_id: auth.context.tenantId,
    p_employee_id: input.id || null,
    p_payload: toRpcPayload(input, financialAllowed),
    p_pin_hash: input.pin ? await hashPin(input.pin) : null,
    p_salary_effective_from: input.salary_valid_from || input.admission_date,
    p_schedule_effective_from: input.schedule_effective_from || input.admission_date,
    p_reason: reason,
    p_actor_user_id: auth.context.userId,
    p_membership_id: auth.context.membershipId
  });
  if (error) {
    const closed = error.message.includes("CLOSED_PERIOD");
    return fail(closed ? "A vigência informada está em uma competência fechada." : "Erro ao salvar funcionário de forma transacional.", closed ? 409 : 422, error.message);
  }
  return ok({ employee: publicEmployee(data as EmployeeRow) });
}

export async function POST(request: NextRequest) { return saveEmployee(request, "create"); }
export async function PUT(request: NextRequest) { return saveEmployee(request, "update"); }

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return fail("ID do funcionário obrigatório.", 400);
  const { data: oldData } = await auth.supabase.from("employees").select("*").eq("id", id).maybeSingle();
  if (!oldData || !canAccessBranch(auth.context, oldData.branch_id)) return fail("Funcionário não encontrado ou fora do seu escopo.", 404);
  const { data, error } = await auth.supabase.from("employees").update({ active: false }).eq("id", id).select("*").single();
  if (error) return fail("Erro ao desativar funcionário.", 500, error.message);
  await writeAuditLog({ supabase: auth.supabase, context: auth.context, action: "deactivate", entity: "employees", entityId: id, oldData: publicEmployee(oldData as EmployeeRow), newData: publicEmployee(data as EmployeeRow), reason: "Desativação administrativa" });
  return ok({ employee: publicEmployee(data as EmployeeRow) });
}
