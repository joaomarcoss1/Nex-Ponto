export type MoneyCents = bigint;

export function moneyToCents(value: string | number | bigint | null | undefined): MoneyCents {
  if (typeof value === "bigint") return value;
  if (value === null || value === undefined || value === "") return 0n;
  const normalized = String(value).trim().replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) throw new Error(`Valor monetário inválido: ${value}`);
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction = ""] = unsigned.split(".");
  const cents = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  return negative ? -cents : cents;
}

export function centsToString(value: MoneyCents): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 100n;
  const cents = String(absolute % 100n).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${cents}`;
}

export function multiplyCents(value: MoneyCents, numerator: bigint, denominator: bigint, rounding: "half_up" | "truncate" = "half_up"): MoneyCents {
  if (denominator === 0n) throw new Error("Divisor monetário não pode ser zero.");
  const product = value * numerator;
  if (rounding === "truncate") return product / denominator;
  const sign = product < 0n ? -1n : 1n;
  const absolute = product < 0n ? -product : product;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return rounded * sign;
}

export function sumCents(values: Iterable<MoneyCents>): MoneyCents {
  let total = 0n;
  for (const value of values) total += value;
  return total;
}
