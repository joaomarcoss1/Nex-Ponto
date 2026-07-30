import { describe, expect, it } from "vitest";
import { signedHourBankMinutes, summarizeHourBankV51 } from "@/lib/services/hour-bank-v51";

describe("hour bank v5.1", () => {
  it("uses positive minutes and type-defined sign", () => {
    expect(signedHourBankMinutes("credit", 60)).toBe(60);
    expect(signedHourBankMinutes("debit", 60)).toBe(-60);
    expect(() => signedHourBankMinutes("debit", -60)).toThrow();
  });

  it("does not invert debit in payroll snapshot", () => {
    const summary = summarizeHourBankV51([
      { id: "1", movementType: "credit", minutes: 120, status: "approved", movementDate: "2026-07-02" },
      { id: "2", movementType: "debit", minutes: 60, status: "approved", movementDate: "2026-07-10" },
    ], "2026-07-01", "2026-07-31");
    expect(summary.creditMinutes).toBe(120);
    expect(summary.debitMinutes).toBe(60);
    expect(summary.closingBalanceMinutes).toBe(60);
  });

  it("includes previous balance and current competence movements", () => {
    const summary = summarizeHourBankV51([
      { id: "1", movementType: "credit", minutes: 90, status: "approved", movementDate: "2026-06-20" },
      { id: "2", movementType: "compensation", minutes: 30, status: "approved", movementDate: "2026-07-08" },
    ], "2026-07-01", "2026-07-31");
    expect(summary.openingBalanceMinutes).toBe(90);
    expect(summary.closingBalanceMinutes).toBe(60);
  });
});
