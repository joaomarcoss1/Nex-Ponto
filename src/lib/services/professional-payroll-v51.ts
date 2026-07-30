import { centsToString, moneyToCents, multiplyCents, sumCents, type MoneyCents } from "@/lib/services/money-v51";
import { summarizeHourBankV51, type HourBankMovementV51 } from "@/lib/services/hour-bank-v51";
import type { SessionAttendanceResultV51 } from "@/lib/services/session-attendance-v51";

export type SalarySegmentV51 = {
  startDate: string;
  endDate: string;
  monthlySalary: string | number;
  eligibleDays: number;
  divisorDays: number;
  fullCompetence?: boolean;
};
export type ContractSegmentV51 = { startDate: string; endDate: string; salaryHourDivisor: number; nightPremiumPercent: number; homologated: boolean };
export type OvertimeApprovalV51 = { entryDate?: string | null; minutes: number; percentage: number; approvedValue?: string | number | null; destination: "payment" | "hour_bank" };
export type LegalBracketV51 = { lowerBound: string | number; upperBound?: string | number | null; rateBasisPoints: number; deduction?: string | number };

export type ProfessionalPayrollInputV51 = {
  employeeId: string;
  competenceStart: string;
  competenceEnd: string;
  salarySegments: SalarySegmentV51[];
  contractSegments: ContractSegmentV51[];
  overtime: OvertimeApprovalV51[];
  nightMinutes: number;
  nightByDate?: Array<{ date: string; minutes: number }>;
  hourBankMovements: HourBankMovementV51[];
  attendance?: SessionAttendanceResultV51;
  deductions: Array<{ code: string; name: string; amount: string | number }>;
  earnings: Array<{ code: string; name: string; amount: string | number }>;
  inssBrackets?: LegalBracketV51[];
  fgtsRateBasisPoints?: number;
};

export type PayrollRubricResultV51 = { code: string; name: string; type: "earning" | "deduction" | "informational" | "employer_charge"; value: string; memory: Record<string, unknown> };
export type PayrollDivergenceV51 = { code: string; severity: "warning" | "critical"; message: string };

function progressiveContribution(baseCents: MoneyCents, brackets: LegalBracketV51[]): MoneyCents {
  let total = 0n;
  for (const bracket of [...brackets].sort((a, b) => Number(a.lowerBound) - Number(b.lowerBound))) {
    const lower = moneyToCents(bracket.lowerBound);
    const upper = bracket.upperBound === null || bracket.upperBound === undefined ? baseCents : moneyToCents(bracket.upperBound);
    if (baseCents <= lower) continue;
    const taxable = (baseCents < upper ? baseCents : upper) - lower;
    if (taxable > 0n) total += multiplyCents(taxable, BigInt(bracket.rateBasisPoints), 10_000n);
  }
  return total;
}

function segmentForDate<T extends { startDate: string; endDate: string }>(segments: T[], date?: string | null): T | undefined {
  if (date) {
    const exact = segments.find((segment) => segment.startDate <= date && segment.endDate >= date);
    if (exact) return exact;
  }
  return segments[0];
}

function hourlyRateForDate(input: ProfessionalPayrollInputV51, date?: string | null): MoneyCents {
  const salary = segmentForDate(input.salarySegments, date);
  const contract = segmentForDate(input.contractSegments, date);
  if (!salary || !contract || contract.salaryHourDivisor <= 0) return 0n;
  return multiplyCents(moneyToCents(salary.monthlySalary), 1n, BigInt(Math.round(contract.salaryHourDivisor)));
}

export function calculateProfessionalPayrollV51(input: ProfessionalPayrollInputV51) {
  const divergences: PayrollDivergenceV51[] = [];
  const rubrics: PayrollRubricResultV51[] = [];
  if (!input.salarySegments.length) divergences.push({ code: "SALARY_MISSING", severity: "critical", message: "Funcionário sem remuneração vigente." });
  if (!input.contractSegments.length) divergences.push({ code: "CONTRACT_RULE_MISSING", severity: "critical", message: "Funcionário sem regras contratuais vigentes." });
  if (input.contractSegments.some((segment) => !segment.homologated)) divergences.push({ code: "CONTRACT_RULE_NOT_HOMOLOGATED", severity: "critical", message: "Há regra contratual aguardando homologação." });
  if (input.attendance) {
    for (const item of input.attendance.divergences) divergences.push({ code: item.code, severity: item.severity, message: item.message });
    rubrics.push({
      code: "ATTENDANCE_MEMORY",
      name: "Memória de jornada",
      type: "informational",
      value: "0.00",
      memory: {
        expectedMinutes: input.attendance.expectedMinutes,
        workedMinutes: input.attendance.workedMinutes,
        unpaidBreakMinutes: input.attendance.unpaidBreakMinutes,
        lateMinutes: input.attendance.lateMinutes,
        earlyLeaveMinutes: input.attendance.earlyLeaveMinutes,
        completedSessions: input.attendance.completedSessions,
        incompleteSessions: input.attendance.incompleteSessions,
      },
    });
  }

  for (const segment of input.salarySegments) {
    const monthly = moneyToCents(segment.monthlySalary);
    const value = segment.fullCompetence
      ? monthly
      : multiplyCents(monthly, BigInt(segment.eligibleDays), BigInt(segment.divisorDays));
    rubrics.push({ code: "BASE_SALARY", name: "Salário-base", type: "earning", value: centsToString(value), memory: segment });
  }

  const primaryContract = input.contractSegments[0];

  let overtimeBankMinutes = 0;
  for (const overtime of input.overtime) {
    if (overtime.destination === "hour_bank") { overtimeBankMinutes += overtime.minutes; continue; }
    const hourlyRate = hourlyRateForDate(input, overtime.entryDate);
    const calculated = multiplyCents(hourlyRate, BigInt(Math.round(overtime.minutes * (10_000 + overtime.percentage * 100))), 60n * 10_000n);
    const value = overtime.approvedValue !== null && overtime.approvedValue !== undefined ? moneyToCents(overtime.approvedValue) : calculated;
    rubrics.push({ code: `OVERTIME_${overtime.percentage}`, name: `Hora extra ${overtime.percentage}%`, type: "earning", value: centsToString(value), memory: { ...overtime, calculated: centsToString(calculated), approved: centsToString(value) } });
  }

  const nightSegments = input.nightByDate?.length ? input.nightByDate : input.nightMinutes > 0 ? [{ date: input.competenceStart, minutes: input.nightMinutes }] : [];
  for (const segment of nightSegments) {
    const contract = segmentForDate(input.contractSegments, segment.date) ?? primaryContract;
    if (!contract || segment.minutes <= 0 || contract.nightPremiumPercent <= 0) continue;
    const hourlyRate = hourlyRateForDate(input, segment.date);
    const value = multiplyCents(hourlyRate, BigInt(Math.round(segment.minutes * contract.nightPremiumPercent * 100)), 60n * 10_000n);
    rubrics.push({ code: "NIGHT_PREMIUM", name: "Adicional noturno", type: "earning", value: centsToString(value), memory: { date: segment.date, minutes: segment.minutes, percent: contract.nightPremiumPercent } });
  }

  for (const earning of input.earnings) rubrics.push({ code: earning.code, name: earning.name, type: "earning", value: centsToString(moneyToCents(earning.amount)), memory: { source: "manual_controlled" } });
  for (const deduction of input.deductions) rubrics.push({ code: deduction.code, name: deduction.name, type: "deduction", value: centsToString(moneyToCents(deduction.amount)), memory: { source: "manual_controlled" } });

  const earningsTotal = sumCents(rubrics.filter((item) => item.type === "earning").map((item) => moneyToCents(item.value)));
  const manualDeductions = sumCents(rubrics.filter((item) => item.type === "deduction").map((item) => moneyToCents(item.value)));
  const inss = input.inssBrackets?.length ? progressiveContribution(earningsTotal, input.inssBrackets) : 0n;
  if (!input.inssBrackets?.length) divergences.push({ code: "INSS_TABLE_MISSING", severity: "critical", message: "Tabela de INSS homologada não encontrada." });
  if (inss > 0n) rubrics.push({ code: "INSS", name: "INSS", type: "deduction", value: centsToString(inss), memory: { progressive: true } });
  const fgts = multiplyCents(earningsTotal, BigInt(input.fgtsRateBasisPoints ?? 0), 10_000n);
  if (fgts > 0n) rubrics.push({ code: "FGTS", name: "FGTS estimado", type: "employer_charge", value: centsToString(fgts), memory: { rateBasisPoints: input.fgtsRateBasisPoints } });

  const totalDeductions = manualDeductions + inss;
  const net = earningsTotal - totalDeductions;
  if (net < 0n) divergences.push({ code: "NEGATIVE_NET", severity: "critical", message: "O valor líquido é negativo e exige revisão." });

  const hourBank = summarizeHourBankV51(input.hourBankMovements, input.competenceStart, input.competenceEnd);
  rubrics.push({ code: "HOUR_BANK_INFO", name: "Banco de horas", type: "informational", value: "0.00", memory: { ...hourBank, overtimeBankMinutes } });

  return {
    employeeId: input.employeeId,
    rubrics,
    divergences,
    totals: { earnings: centsToString(earningsTotal), deductions: centsToString(totalDeductions), net: centsToString(net), employerCharges: centsToString(fgts) },
    hourBank,
  };
}
