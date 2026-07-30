import { z } from "zod";

export const overtimeApprovalSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "adjusted", "rejected"]),
  approved_overtime_minutes: z.coerce.number().int().min(0),
  approved_percentage: z.coerce.number().min(0).max(500).default(50),
  approved_amount: z.preprocess(
    (value) => value === "" || value === undefined ? null : value,
    z.coerce.number().min(0).nullable(),
  ).default(null),
  destination: z.enum(["payment", "hour_bank", "split"]).default("payment"),
  payment_minutes: z.coerce.number().int().min(0).default(0),
  bank_minutes: z.coerce.number().int().min(0).default(0),
  category: z.string().trim().min(2).max(80).default("overtime_50"),
  reason: z.string().trim().max(500).optional().default(""),
  idempotency_key: z.string().trim().min(8).max(180).optional(),
}).superRefine((value, context) => {
  if (value.status !== "rejected" && value.approved_overtime_minutes !== value.payment_minutes + value.bank_minutes) {
    context.addIssue({ code: "custom", message: "Pagamento e banco devem totalizar os minutos aprovados.", path: ["payment_minutes"] });
  }
  if (value.destination === "payment" && value.bank_minutes !== 0) {
    context.addIssue({ code: "custom", message: "Destino pagamento não aceita minutos de banco.", path: ["bank_minutes"] });
  }
  if (value.destination === "hour_bank" && value.payment_minutes !== 0) {
    context.addIssue({ code: "custom", message: "Destino banco não aceita minutos para pagamento.", path: ["payment_minutes"] });
  }
  if (value.status === "adjusted" && value.reason.length < 5) {
    context.addIssue({ code: "custom", message: "Informe o motivo do ajuste.", path: ["reason"] });
  }
});

export type OvertimeApprovalRequest = z.infer<typeof overtimeApprovalSchema>;

export type OvertimeReviewDto = {
  id: string;
  status: string;
  entry_date: string;
  expected_minutes: number;
  worked_minutes: number;
  calculated_overtime_minutes: number;
  overtime_minutes?: number;
  approved_overtime_minutes: number | null;
  approved_percentage: number | null;
  approved_amount: number | null;
  overtime_amount: number | null;
  destination: "payment" | "hour_bank" | "split" | null;
  payment_minutes: number | null;
  bank_minutes: number | null;
  category: string | null;
  reviewed_observation?: string | null;
  employees?: { full_name: string; role?: string } | null;
  branches?: { name: string } | null;
};
