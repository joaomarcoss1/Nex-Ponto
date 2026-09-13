import { describe, expect, it } from "vitest";
import { calculatePayrollItemWithEngines } from "@/lib/services/payroll-engine";
import type { Employee, MinimalHoliday, SystemSettings, TimeEntry } from "@/types/domain";

const employee = {
  id: "emp-1",
  registration_code: "001",
  full_name: "Funcionário Teste",
  document: null,
  phone: null,
  role: "Atendente",
  branch_id: "branch-1",
  employment_type: "mensalista",
  monthly_salary: 3000,
  daily_rate: null,
  daily_rate_mode: "automatic",
  pix_key: null,
  bank_name: null,
  bank_agency: null,
  bank_account: null,
  bank_account_type: null,
  pin_hash: "preservado",
  active: true,
  admission_date: "2026-01-01",
  expected_start_time: "08:00",
  expected_end_time: "18:00",
  expected_daily_minutes: 480,
  expected_lunch_minutes: 60,
  expected_lunch_start_time: "12:00",
  expected_lunch_end_time: "13:00",
  work_days: [1, 2, 3, 4, 5],
  allow_overtime: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z"
} satisfies Employee;

const settings: SystemSettings = {
  late_tolerance_minutes: 15,
  early_leave_tolerance_minutes: 15,
  default_radius_meters: 900,
  overtime_multiplier: 1.5,
  daily_rate_calculation: "fixed_30",
  company_name: "NexPonto",
  company_document: "",
  company_address: "",
  report_footer: ""
};

function calculate(overrides: Partial<Employee> = {}, params: { periodType?: "monthly" | "biweekly"; holidays?: MinimalHoliday[]; entries?: TimeEntry[]; overtimeReviews?: unknown[] } = {}) {
  return calculatePayrollItemWithEngines({
    employee: { ...employee, ...overrides } as Employee,
    entries: params.entries || [],
    justifications: [],
    holidays: params.holidays || [],
    schedules: [],
    overtimeReviews: params.overtimeReviews || [],
    settings,
    startDate: "2026-07-01",
    endDate: params.periodType === "biweekly" ? "2026-07-15" : "2026-07-31",
    periodType: params.periodType || "monthly"
  });
}

describe("motor de folha v019", () => {
  it("usa 100% do salário no período mensal", () => {
    const result = calculate();
    expect(result.base_salary).toBe(3000);
    expect(result.base_calculation_rule).toBe("monthly_100_percent");
  });

  it("usa exatamente 50% do salário no período quinzenal", () => {
    const result = calculate({}, { periodType: "biweekly" });
    expect(result.base_salary).toBe(1500);
    expect(result.base_calculation_rule).toBe("biweekly_50_percent");
  });

  it("feriado fechado não gera falta nem reduz o salário", () => {
    const result = calculate({}, { holidays: [{ id: "h1", holiday_date: "2026-07-06", branch_id: "branch-1", type: "holiday", active: true, operation_status: "closed" }] });
    expect(result.base_salary).toBe(3000);
    expect(result.discounted_absences).toBeGreaterThanOrEqual(0);
    expect(result.paid_holiday_days).toBe(1);
  });

  it("feriado aberto permanece como jornada normal", () => {
    const result = calculate({}, { holidays: [{ id: "h1", holiday_date: "2026-07-06", branch_id: "branch-1", type: "holiday", active: true, operation_status: "open" }] });
    expect(result.paid_holiday_days).toBe(0);
    expect(result.identified_absences).toBeGreaterThan(0);
  });

  it("feriado pendente não gera desconto antes da decisão", () => {
    const result = calculate({}, { holidays: [{ id: "h1", holiday_date: "2026-07-06", branch_id: "branch-1", type: "holiday", active: true, operation_status: "pending" }] });
    expect(result.base_salary).toBe(3000);
    expect(result.paid_holiday_days).toBe(1);
    expect(result.identified_absences).toBe(22);
  });

  it("diarista recebe o dia de fechamento remunerado", () => {
    const result = calculate({ employment_type: "diarista", monthly_salary: 0, daily_rate: 120, daily_rate_mode: "manual" }, { holidays: [{ id: "h1", holiday_date: "2026-07-06", branch_id: "branch-1", type: "holiday", active: true, operation_status: "closed" }] });
    expect(result.base_salary).toBe(120);
  });

  it("faz proporcionalidade para admissão no meio do período", () => {
    const result = calculate({ admission_date: "2026-07-16" });
    expect(result.base_salary).toBeCloseTo(3000 * 16 / 31, 2);
    expect(result.base_calculation_rule).toBe("monthly_prorated_employment_period");
  });

  it("faz proporcionalidade para desligamento no período", () => {
    const result = calculate({ termination_date: "2026-07-15" });
    expect(result.base_salary).toBeCloseTo(3000 * 15 / 31, 2);
  });
});
