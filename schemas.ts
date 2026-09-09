import { z } from "zod";

const optionalUuid = z.preprocess(
  (value) => value === "" || value === undefined ? null : value,
  z.string().uuid().nullable()
);

const branchIds = z.preprocess((value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}, z.array(z.string().uuid()).default([]));

export const adminPayloadSchema = z.object({
  id: z.string().uuid().optional(),
  full_name: z.string().trim().min(2, "Informe o nome completo.").max(160),
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  password: z.string().trim().optional().default(""),
  role: z.enum(["master_admin", "admin", "admin_geral", "gerente_filial", "rh_financeiro"]),
  branch_id: optionalUuid.optional().default(null),
  allowed_branch_ids: branchIds,
  can_view_financial_data: z.coerce.boolean().default(false),
  active: z.coerce.boolean().default(true)
});

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

export const payrollCreateSchema = z.object({
  title: z.string().trim().min(3, "Informe o título da folha.").max(180),
  period_type: z.enum(["monthly", "biweekly", "daily", "custom"]).default("monthly"),
  start_date: dateKey,
  end_date: dateKey,
  branch_id: optionalUuid.optional().default(null),
  payment_day: z.preprocess((value) => value === "" || value === null || value === undefined ? null : Number(value), z.number().int().min(1).max(31).nullable()),
  employment_type: z.enum(["mensalista", "quinzenal", "diarista"]).optional().or(z.literal("")),
  employee_id: optionalUuid.optional().default(null),
  role: z.string().trim().max(120).optional().default(""),
  notes: z.string().trim().max(2000).optional().default("")
}).superRefine((value, context) => {
  if (value.end_date < value.start_date) context.addIssue({ code: z.ZodIssueCode.custom, path: ["end_date"], message: "A data final deve ser igual ou posterior à data inicial." });
  if (value.period_type === "biweekly") {
    const startMonth = value.start_date.slice(0, 7);
    const endMonth = value.end_date.slice(0, 7);
    const startDay = Number(value.start_date.slice(-2));
    const endDay = Number(value.end_date.slice(-2));
    const [year, month] = startMonth.split("-").map(Number);
    const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const validFirst = startMonth === endMonth && startDay === 1 && endDay === 15;
    const validSecond = startMonth === endMonth && startDay === 16 && endDay === lastDayOfMonth;
    if (!validFirst && !validSecond) context.addIssue({ code: z.ZodIssueCode.custom, path: ["period_type"], message: "Folha quinzenal deve abranger os dias 1–15 ou 16–fim do mês." });
  }
});

export const payrollStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["draft", "incomplete_preview", "checking", "ready", "reviewed", "closed", "closed_with_exceptions", "paid", "reopened"]),
  notes: z.string().max(2000).optional(),
  reason: z.string().max(2000).optional(),
  overrideReason: z.string().max(2000).optional()
});

export const holidayDecisionSchema = z.object({
  holiday_id: z.string().uuid(),
  branch_id: optionalUuid.optional().default(null),
  branch_ids: z.array(z.string().uuid()).optional(),
  operation_status: z.enum(["pending", "open", "closed"]),
  notes: z.string().trim().max(1000).optional().default("")
});

export const holidaySchema = z.object({
  id: z.string().uuid().optional(),
  branch_id: optionalUuid.optional().default(null),
  holiday_date: dateKey,
  title: z.string().trim().min(2).max(180),
  type: z.enum(["holiday", "day_off", "no_work"]).default("holiday"),
  active: z.coerce.boolean().default(true)
});

export const settingsPayloadSchema = z.object({
  app_name: z.string().trim().min(2).max(80).optional(),
  app_short_name: z.string().trim().min(2).max(24).optional(),
  app_tagline: z.string().trim().max(160).optional(),
  logo_url: z.string().trim().max(1000).optional(),
  mark_url: z.string().trim().max(1000).optional(),
  late_tolerance_minutes: z.coerce.number().int().min(0).max(240).optional(),
  early_leave_tolerance_minutes: z.coerce.number().int().min(0).max(240).optional(),
  default_radius_meters: z.coerce.number().int().min(10).max(10000).optional(),
  max_gps_accuracy_meters: z.coerce.number().int().min(5).max(5000).optional(),
  overtime_multiplier: z.coerce.number().min(0).max(10).optional(),
  holiday_decision_notification_days: z.coerce.number().int().min(1).max(60).optional(),
  daily_rate_calculation: z.enum(["expected_work_days", "business_days", "fixed_30"]).optional(),
  company_name: z.string().trim().max(200).optional(),
  company_document: z.string().trim().max(100).optional(),
  company_address: z.string().trim().max(500).optional(),
  report_footer: z.string().trim().max(1000).optional(),
  primary_color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  secondary_color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  accent_color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  background_color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  surface_color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  require_review_on_poor_gps_accuracy: z.boolean().optional(),
  allow_different_branch_with_authorization: z.boolean().optional(),
  allow_outside_radius_review: z.boolean().optional(),
  auto_approve_overtime: z.boolean().optional(),
  google_maps_enabled: z.boolean().optional(),
  block_clock_without_confirmed_branch_gps: z.boolean().optional(),
  require_qr_for_clock: z.boolean().optional(),
  block_poor_gps_accuracy: z.boolean().optional(),
  payroll_block_critical_pending: z.boolean().optional(),
  lunch_tolerance_minutes: z.coerce.number().int().min(0).max(240).optional(),
  payroll_pdf_max_detailed_rows: z.coerce.number().int().min(1).max(10000).optional(),
  payroll_pdf_block_rows: z.coerce.number().int().min(1).max(50000).optional()
}).strict();

export function zodErrorMessage(error: z.ZodError) {
  return error.issues.map((issue) => issue.message).join(" ");
}
