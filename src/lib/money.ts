import Decimal from "decimal.js";

export { Decimal };
export type DecimalInput = Decimal.Value | { toString(): string };

export function dec(value: DecimalInput | null | undefined): Decimal {
  if (value === null || value === undefined || value === "") return new Decimal(0);
  return new Decimal(typeof value === "object" && !(value instanceof Decimal) ? value.toString() : (value as Decimal.Value));
}

/** Minor-unit precision for an ISO 4217 currency (INR/USD 2, JPY 0, KWD 3). */
export function currencyScale(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** Round half-up to the currency's minor unit. */
export function roundMoney(value: DecimalInput, currency: string): Decimal {
  return dec(value).toDecimalPlaces(currencyScale(currency), Decimal.ROUND_HALF_UP);
}

export function toDbMoney(value: DecimalInput): string {
  return dec(value).toFixed(4);
}

export function isValidMoneyString(value: string, currency: string): boolean {
  const scale = currencyScale(currency);
  const pattern = scale === 0 ? /^\d{1,14}$/ : new RegExp(`^\\d{1,14}(\\.\\d{1,${scale}})?$`);
  return pattern.test(value.trim());
}
