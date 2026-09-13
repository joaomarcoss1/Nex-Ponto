import { describe, expect, it } from "vitest";
import { payrollCreateSchema } from "@/lib/validation/schemas";

const base = {
  title: "Folha julho",
  period_type: "biweekly" as const,
  start_date: "2026-07-01",
  end_date: "2026-07-15",
  branch_id: null,
  payment_day: null,
  employment_type: "",
  employee_id: null,
  role: "",
  notes: "",
};

describe("validação dos períodos da folha", () => {
  it("aceita a primeira quinzena exata", () => {
    expect(payrollCreateSchema.safeParse(base).success).toBe(true);
  });

  it("aceita a segunda quinzena até o último dia real do mês", () => {
    expect(payrollCreateSchema.safeParse({ ...base, start_date: "2026-02-16", end_date: "2026-02-28" }).success).toBe(true);
  });

  it("rejeita período quinzenal parcial ou atravessando meses", () => {
    expect(payrollCreateSchema.safeParse({ ...base, start_date: "2026-07-16", end_date: "2026-07-30" }).success).toBe(false);
    expect(payrollCreateSchema.safeParse({ ...base, start_date: "2026-07-16", end_date: "2026-08-15" }).success).toBe(false);
  });
});
