import Decimal from "decimal.js";
import type { BillingIntervalName } from "./dates";

/**
 * MRR normalisation: the recurring amount before tax, after discount, converted to a month.
 * Daily × 365/12, weekly × 52/12, monthly × 1, yearly ÷ 12. ARR = MRR × 12.
 */
export const MONTHLY_FACTOR: Record<BillingIntervalName, Decimal> = {
  DAILY: new Decimal(365).div(12),
  WEEKLY: new Decimal(52).div(12),
  MONTHLY: new Decimal(1),
  YEARLY: new Decimal(1).div(12),
};

export function monthlyRecurring(amount: Decimal.Value, interval: BillingIntervalName): Decimal {
  return new Decimal(amount).times(MONTHLY_FACTOR[interval]);
}

/** Calendar months (YYYY-MM) from the month of `from` through the month of `to`, inclusive. */
export function monthsBetween(from: Date, to: Date): string[] {
  const out: string[] = [];
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth();
  while (y < to.getUTCFullYear() || (y === to.getUTCFullYear() && m <= to.getUTCMonth())) {
    out.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    m++;
    if (m === 12) {
      m = 0;
      y++;
    }
  }
  return out;
}
