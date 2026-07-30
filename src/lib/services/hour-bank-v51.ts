export type HourBankMovementType = "credit" | "debit" | "compensation" | "manual_adjustment" | "reversal" | "expired" | "paid";

export type HourBankMovementV51 = {
  id: string;
  movementType: HourBankMovementType;
  minutes: number;
  status: "pending" | "approved" | "reversed" | "expired";
  movementDate: string;
  expiresOn?: string | null;
  reversalOf?: string | null;
};

export function signedHourBankMinutes(movementType: HourBankMovementType, minutes: number): number {
  if (!Number.isInteger(minutes) || minutes <= 0) throw new Error("Minutos do banco de horas devem ser inteiros positivos.");
  return movementType === "debit" || movementType === "compensation" || movementType === "expired" || movementType === "paid"
    ? -minutes
    : minutes;
}

export type HourBankSummaryV51 = {
  openingBalanceMinutes: number;
  creditMinutes: number;
  debitMinutes: number;
  compensationMinutes: number;
  expiredMinutes: number;
  paidMinutes: number;
  reversalMinutes: number;
  closingBalanceMinutes: number;
};

export function summarizeHourBankV51(
  movements: HourBankMovementV51[],
  competenceStart: string,
  competenceEnd: string,
): HourBankSummaryV51 {
  const active = movements.filter((movement) => movement.status === "approved" || movement.status === "pending");
  let openingBalanceMinutes = 0;
  let creditMinutes = 0;
  let debitMinutes = 0;
  let compensationMinutes = 0;
  let expiredMinutes = 0;
  let paidMinutes = 0;
  let reversalMinutes = 0;

  for (const movement of active) {
    const signed = signedHourBankMinutes(movement.movementType, movement.minutes);
    if (movement.movementDate < competenceStart) openingBalanceMinutes += signed;
    if (movement.movementDate < competenceStart || movement.movementDate > competenceEnd) continue;

    if (movement.movementType === "credit" || movement.movementType === "manual_adjustment") creditMinutes += movement.minutes;
    else if (movement.movementType === "debit") debitMinutes += movement.minutes;
    else if (movement.movementType === "compensation") compensationMinutes += movement.minutes;
    else if (movement.movementType === "expired") expiredMinutes += movement.minutes;
    else if (movement.movementType === "paid") paidMinutes += movement.minutes;
    else if (movement.movementType === "reversal") reversalMinutes += movement.minutes;
  }

  const closingBalanceMinutes = openingBalanceMinutes + creditMinutes + reversalMinutes - debitMinutes - compensationMinutes - expiredMinutes - paidMinutes;
  return { openingBalanceMinutes, creditMinutes, debitMinutes, compensationMinutes, expiredMinutes, paidMinutes, reversalMinutes, closingBalanceMinutes };
}
