import { describe, expect, it } from "vitest";
import { buildAbsenceReport } from "@/lib/services/absence-engine";
import type { Employee, SystemSettings, TimeEntry } from "@/types/domain";

function employee(overrides: Partial<Employee> = {}): Employee {
  return {
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
    work_days: [0, 1, 2, 3, 4, 5, 6],
    allow_overtime: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as Employee;
}

function entry(overrides: Partial<TimeEntry>): TimeEntry {
  return {
    id: "entry-1",
    branch_id: "branch-1",
    entry_timestamp: "2026-01-05T11:00:00Z",
    latitude: null,
    longitude: null,
    distance_meters: null,
    inside_allowed_radius: true,
    late_minutes: 0,
    early_leave_minutes: 0,
    required_justification: false,
    ...overrides,
  } as TimeEntry;
}

const settings: SystemSettings = {
  late_tolerance_minutes: 10,
  early_leave_tolerance_minutes: 10,
  default_radius_meters: 250,
  overtime_multiplier: 1.5,
  daily_rate_calculation: "expected_work_days",
  company_name: "NexPonto",
  company_document: "",
  company_address: "",
  report_footer: "",
};

describe("buildAbsenceReport", () => {
  it("marks a day with a valid start entry as not absent, and an unjustified missing day as a discount", () => {
    const employeeA = employee({ id: "emp-a" });
    const rows = buildAbsenceReport({
      employees: [employeeA],
      entries: [
        entry({ employee_id: "emp-a", entry_date: "2026-01-05", action: "start_shift", status: "valid" }),
      ],
      justifications: [],
      schedules: [],
      holidays: [],
      settings,
      startDate: "2026-01-05",
      endDate: "2026-01-06",
    });

    const day1 = rows.find((row) => row.date === "2026-01-05");
    const day2 = rows.find((row) => row.date === "2026-01-06");
    expect(day1?.has_start_entry).toBe(true);
    expect(day1?.absence_status).toBe("not_absent");
    expect(day1?.generates_discount).toBe(false);
    expect(day2?.has_start_entry).toBe(false);
    expect(day2?.absence_status).toBe("without_justification");
    expect(day2?.generates_discount).toBe(true);
  });

  it("uses an approved justification instead of discounting, and keeps entries/justifications scoped per employee", () => {
    const employeeA = employee({ id: "emp-a" });
    const employeeB = employee({ id: "emp-b" });
    const rows = buildAbsenceReport({
      employees: [employeeA, employeeB],
      // Only emp-a has an entry on 01-05; it must never be attributed to emp-b.
      entries: [entry({ employee_id: "emp-a", entry_date: "2026-01-05", action: "start_shift", status: "valid" })],
      justifications: [
        { employee_id: "emp-b", absence_date: "2026-01-05", status: "approved", justification_text: "Atestado médico" },
      ],
      schedules: [],
      holidays: [],
      settings,
      startDate: "2026-01-05",
      endDate: "2026-01-05",
    });

    const rowA = rows.find((row) => row.employee_id === "emp-a");
    const rowB = rows.find((row) => row.employee_id === "emp-b");
    expect(rowA?.has_start_entry).toBe(true);
    expect(rowB?.has_start_entry).toBe(false);
    expect(rowB?.absence_status).toBe("approved");
    expect(rowB?.generates_discount).toBe(false);
    expect(rowB?.justification_text).toBe("Atestado médico");
  });
});
