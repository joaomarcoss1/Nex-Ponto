import { describe, expect, it } from "vitest";
import { calculateProfessionalPayrollV51 } from "@/lib/services/professional-payroll-v51";

describe("professional payroll v5.1", () => {
  for (const competence of [
    ["2026-02-01", "2026-02-28"],
    ["2028-02-01", "2028-02-29"],
    ["2026-04-01", "2026-04-30"],
    ["2026-07-01", "2026-07-31"],
  ] as const) {
    it(`pays exactly one monthly salary for full competence ${competence[1]}`, () => {
      const result = calculateProfessionalPayrollV51({
        employeeId: "monthly",
        competenceStart: competence[0],
        competenceEnd: competence[1],
        salarySegments: [{
          startDate: competence[0],
          endDate: competence[1],
          monthlySalary: "3000.00",
          eligibleDays: Number(competence[1].slice(-2)),
          divisorDays: 30,
          fullCompetence: true,
        }],
        contractSegments: [{ startDate: competence[0], endDate: competence[1], salaryHourDivisor: 220, nightPremiumPercent: 20, homologated: true }],
        overtime: [],
        nightMinutes: 0,
        hourBankMovements: [],
        earnings: [],
        deductions: [],
        inssBrackets: [{ lowerBound: 0, upperBound: null, rateBasisPoints: 0 }],
      });
      expect(result.rubrics.find((item) => item.code === "BASE_SALARY")?.value).toBe("3000.00");
    });
  }

  it("uses approved overtime value and preserves negative net", () => {
    const result = calculateProfessionalPayrollV51({
      employeeId: "e1",
      competenceStart: "2026-07-01",
      competenceEnd: "2026-07-31",
      salarySegments: [{ startDate: "2026-07-01", endDate: "2026-07-31", monthlySalary: "3000.00", eligibleDays: 30, divisorDays: 30 }],
      contractSegments: [{ startDate: "2026-07-01", endDate: "2026-07-31", salaryHourDivisor: 220, nightPremiumPercent: 20, homologated: true }],
      overtime: [{ minutes: 60, percentage: 50, approvedValue: "30.00", destination: "payment" }],
      nightMinutes: 0,
      hourBankMovements: [],
      earnings: [],
      deductions: [{ code: "BIG", name: "Desconto autorizado", amount: "4000.00" }],
      inssBrackets: [{ lowerBound: 0, upperBound: null, rateBasisPoints: 0 }],
      fgtsRateBasisPoints: 800,
    });
    expect(result.rubrics.find((item) => item.code === "OVERTIME_50")?.value).toBe("30.00");
    expect(result.totals.net.startsWith("-")).toBe(true);
    expect(result.divergences.some((item) => item.code === "NEGATIVE_NET")).toBe(true);
  });

  it("uses salary and divisor effective on overtime date", () => {
    const result = calculateProfessionalPayrollV51({
      employeeId: "e2", competenceStart: "2026-07-01", competenceEnd: "2026-07-31",
      salarySegments: [
        { startDate: "2026-07-01", endDate: "2026-07-15", monthlySalary: 2200, eligibleDays: 15, divisorDays: 30 },
        { startDate: "2026-07-16", endDate: "2026-07-31", monthlySalary: 4000, eligibleDays: 15, divisorDays: 30 },
      ],
      contractSegments: [
        { startDate: "2026-07-01", endDate: "2026-07-15", salaryHourDivisor: 220, nightPremiumPercent: 20, homologated: true },
        { startDate: "2026-07-16", endDate: "2026-07-31", salaryHourDivisor: 200, nightPremiumPercent: 20, homologated: true },
      ],
      overtime: [{ entryDate: "2026-07-20", minutes: 60, percentage: 50, destination: "payment" }],
      nightMinutes: 0, hourBankMovements: [], earnings: [], deductions: [],
      inssBrackets: [{ lowerBound: 0, upperBound: null, rateBasisPoints: 0 }],
    });
    expect(result.rubrics.find((item) => item.code === "OVERTIME_50")?.value).toBe("30.00");
  });

  it("marks missing legal table as critical", () => {
    const result = calculateProfessionalPayrollV51({
      employeeId: "e1", competenceStart: "2026-07-01", competenceEnd: "2026-07-31",
      salarySegments: [{ startDate: "2026-07-01", endDate: "2026-07-31", monthlySalary: 1000, eligibleDays: 30, divisorDays: 30 }],
      contractSegments: [{ startDate: "2026-07-01", endDate: "2026-07-31", salaryHourDivisor: 220, nightPremiumPercent: 20, homologated: true }],
      overtime: [], nightMinutes: 0, hourBankMovements: [], earnings: [], deductions: [],
    });
    expect(result.divergences.some((item) => item.code === "INSS_TABLE_MISSING")).toBe(true);
  });
});
