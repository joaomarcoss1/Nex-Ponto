import { describe, expect, it } from "vitest";
import { createEmployeeImportTemplateBuffer, parseEmployeeImportFile } from "@/lib/services/employee-import";
import { createProfessionalPayrollXlsxV51 } from "@/lib/services/professional-report-v51";

function isZip(buffer: Buffer) {
  return buffer[0] === 0x50 && buffer[1] === 0x4b;
}

describe("XLSX regression", () => {
  it("creates and reads the employee import template", async () => {
    const buffer = await createEmployeeImportTemplateBuffer();
    expect(isZip(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1_000);
    const rows = await parseEmployeeImportFile(new File([buffer], "modelo.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }));
    expect(Array.isArray(rows)).toBe(true);
  });

  it("creates the professional pre-payroll workbook", async () => {
    const buffer = await createProfessionalPayrollXlsxV51({
      run: { id: "run", version: 1, status: "calculated", summary: {}, created_at: "2026-07-29T00:00:00Z" },
      period: { title: "Julho/2026", start_date: "2026-07-01", end_date: "2026-07-31", branch_id: null },
      employees: [{ id: "employee", full_name: "Funcionário Teste", registration_code: "001", branch_id: "branch", role: "Analista" }],
      rubrics: [{ employee_id: "employee", rubric_code: "BASE_SALARY", rubric_name: "Salário-base", rubric_type: "earning", final_value: "3000.00", formula_snapshot: {} }],
      divergences: [],
      approvals: [],
    });
    expect(isZip(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(5_000);
  });
});

