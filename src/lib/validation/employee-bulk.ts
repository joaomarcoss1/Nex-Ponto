import { z } from "zod";

const nullableText = (max: number) => z.string().trim().max(max).nullable();
const money = z.union([z.string().trim().regex(/^\d+(?:[.,]\d{1,2})?$/), z.number().nonnegative()]).nullable();

export const employeeBulkPatchSchema = z.object({
  branch_id: z.string().uuid().optional(),
  role: z.string().trim().min(2).max(120).optional(),
  sector: nullableText(120).optional(),
  employment_type: z.enum(["mensalista", "quinzenal", "diarista"]).optional(),
  monthly_salary: money.optional(),
  daily_rate: money.optional(),
  daily_rate_mode: z.enum(["automatic", "manual"]).optional(),
  pix_key: nullableText(180).optional(),
  bank_name: nullableText(120).optional(),
  bank_agency: nullableText(40).optional(),
  bank_account: nullableText(80).optional(),
  bank_account_type: nullableText(50).optional(),
  payment_day: z.coerce.number().int().min(1).max(31).nullable().optional(),
  active: z.boolean().optional(),
  termination_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  expected_start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  expected_end_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  expected_daily_minutes: z.coerce.number().int().min(1).max(1440).optional(),
  expected_lunch_minutes: z.coerce.number().int().min(0).max(720).optional(),
  expected_lunch_start_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  expected_lunch_end_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  work_days: z.array(z.coerce.number().int().min(0).max(6)).max(7).optional(),
  allow_overtime: z.boolean().optional(),
  profile_notes: nullableText(1000).optional(),
  pin: z.string().regex(/^\d{4}$/).optional(),
}).strict();

export const employeeBulkRequestSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  patch: employeeBulkPatchSchema.default({}),
  generatePins: z.boolean().optional().default(false),
  format: z.enum(["pdf", "xlsx"]).optional(),
}).strict().superRefine((value, context) => {
  if (value.generatePins && value.patch.pin) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["patch", "pin"],
      message: "generatePins e patch.pin são mutuamente exclusivos.",
    });
  }
  if (value.generatePins && Object.keys(value.patch).length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["patch"],
      message: "A geração de PINs deve ser executada separadamente de outras alterações em massa.",
    });
  }
});

export type EmployeeBulkRequest = z.infer<typeof employeeBulkRequestSchema>;
