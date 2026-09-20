export type CycleTypeV51 = "5x2" | "6x1" | "12x36" | "week_ab" | "rotating_sundays" | "custom";
export type CycleDayV51 = { dayIndex: number; shiftTemplateId: string | null; isDayOff: boolean };
export type ScheduleCycleV51 = { cycleType: CycleTypeV51; cycleLengthDays: number; days: CycleDayV51[] };

export function cycleDayIndexV51(cycleStartDate: string, workDate: string, cycleLengthDays: number): number {
  if (!Number.isInteger(cycleLengthDays) || cycleLengthDays < 1) throw new Error("Ciclo inválido.");
  const start = Date.parse(`${cycleStartDate}T00:00:00Z`);
  const current = Date.parse(`${workDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(current)) throw new Error("Data de ciclo inválida.");
  const days = Math.floor((current - start) / 86_400_000);
  return ((days % cycleLengthDays) + cycleLengthDays) % cycleLengthDays;
}

export function resolveCycleDayV51(cycle: ScheduleCycleV51, cycleStartDate: string, workDate: string): CycleDayV51 {
  const index = cycleDayIndexV51(cycleStartDate, workDate, cycle.cycleLengthDays);
  const day = cycle.days.find((item) => item.dayIndex === index);
  if (!day) throw new Error(`O ciclo não possui configuração para o índice ${index}.`);
  return day;
}

export type CoverageRequirementV51 = {
  id: string;
  minimumPeople: number;
  maximumPeople?: number | null;
  policy: "block" | "justify" | "warn";
};
export type CoverageResultV51 = { requirementId: string; actual: number; minimum: number; maximum: number | null; status: "ok" | "deficit" | "excess"; blocking: boolean };

export function evaluateCoverageV51(requirement: CoverageRequirementV51, actual: number): CoverageResultV51 {
  if (actual < requirement.minimumPeople) return { requirementId: requirement.id, actual, minimum: requirement.minimumPeople, maximum: requirement.maximumPeople ?? null, status: "deficit", blocking: requirement.policy === "block" };
  if (requirement.maximumPeople !== null && requirement.maximumPeople !== undefined && actual > requirement.maximumPeople) return { requirementId: requirement.id, actual, minimum: requirement.minimumPeople, maximum: requirement.maximumPeople, status: "excess", blocking: false };
  return { requirementId: requirement.id, actual, minimum: requirement.minimumPeople, maximum: requirement.maximumPeople ?? null, status: "ok", blocking: false };
}
