import { describe, expect, it } from "vitest";
import { materializeOperationalHolidays, pendingHolidayDecisions } from "@/lib/services/holiday-operations";

describe("decisões de feriados", () => {
  it("decisão específica de filial prevalece sobre a global", () => {
    const rows = materializeOperationalHolidays({
      holidays: [{ id: "h", holiday_date: "2026-07-10", branch_id: null, type: "holiday", active: true }],
      decisions: [
        { id: "g", holiday_id: "h", branch_id: null, operation_status: "closed" },
        { id: "b", holiday_id: "h", branch_id: "branch-2", operation_status: "open" }
      ],
      branchIds: ["branch-1", "branch-2"]
    });
    expect(rows.find((row) => row.branch_id === "branch-1")?.operation_status).toBe("closed");
    expect(rows.find((row) => row.branch_id === "branch-2")?.operation_status).toBe("open");
  });

  it("feriado sem decisão fica pendente", () => {
    const rows = materializeOperationalHolidays({ holidays: [{ id: "h", holiday_date: "2026-07-10", branch_id: "b", type: "holiday", active: true }], decisions: [], branchIds: ["b"] });
    expect(pendingHolidayDecisions(rows)).toHaveLength(1);
  });
});
