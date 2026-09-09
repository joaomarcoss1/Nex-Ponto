import { describe, expect, it } from "vitest";
import { approvedOvertimeForDate } from "@/lib/services/overtime-engine";

describe("horas extras aprovadas", () => {
  it("soma múltiplas aprovações do mesmo dia", () => {
    expect(approvedOvertimeForDate([
      { id: "a", employee_id: "e", entry_date: "2026-07-01", status: "approved", approved_overtime_minutes: 30 },
      { id: "b", employee_id: "e", entry_date: "2026-07-01", status: "adjusted", approved_overtime_minutes: 45 }
    ], "e", "2026-07-01")).toBe(75);
  });

  it("ignora rejeitados e duplicidade pela chave de origem", () => {
    expect(approvedOvertimeForDate([
      { id: "a", idempotency_key: "same", employee_id: "e", entry_date: "2026-07-01", status: "approved", approved_overtime_minutes: 30 },
      { id: "b", idempotency_key: "same", employee_id: "e", entry_date: "2026-07-01", status: "approved", approved_overtime_minutes: 30 },
      { id: "c", employee_id: "e", entry_date: "2026-07-01", status: "rejected", approved_overtime_minutes: 99 }
    ], "e", "2026-07-01")).toBe(30);
  });
});
