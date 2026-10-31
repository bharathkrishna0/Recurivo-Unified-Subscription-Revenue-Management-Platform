/**
 * Date-only helpers. Billing dates are calendar days in the organization's
 * business timezone, stored as Postgres DATE and represented here as UTC
 * midnight Date objects so arithmetic never depends on the server timezone.
 */
export type BillingIntervalName = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export function parseDateOnly(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) throw new Error(`Invalid date: ${value}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCMonth() !== Number(m[2]) - 1) throw new Error(`Invalid date: ${value}`);
  return d;
}

export function isDateOnlyString(value: string): boolean {
  try {
    parseDateOnly(value);
    return true;
  } catch {
    return false;
  }
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today's calendar date in the given IANA timezone. */
export function todayIn(timeZone: string, now: Date = new Date()): Date {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parseDateOnly(s);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * End-of-month rule: adding months keeps the anchor day when it exists and
 * otherwise falls back to the last valid day (31 Jan + 1 month = 28/29 Feb).
 * Always compute from the original anchor so the 31st is restored in March.
 */
export function addMonthsClamped(anchor: Date, months: number): Date {
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth() + months;
  const targetYear = y + Math.floor(m / 12);
  const targetMonth = ((m % 12) + 12) % 12;
  const day = Math.min(anchor.getUTCDate(), daysInMonth(targetYear, targetMonth));
  return new Date(Date.UTC(targetYear, targetMonth, day));
}

export function addIntervals(anchor: Date, interval: BillingIntervalName, count: number): Date {
  switch (interval) {
    case "DAILY":
      return addDays(anchor, count);
    case "WEEKLY":
      return addDays(anchor, count * 7);
    case "MONTHLY":
      return addMonthsClamped(anchor, count);
    case "YEARLY":
      return addMonthsClamped(anchor, count * 12);
  }
}

/** The k-th billing period (0-based) of a subscription anchored at `start`. */
export function billingPeriod(start: Date, interval: BillingIntervalName, k: number): { start: Date; end: Date } {
  const periodStart = addIntervals(start, interval, k);
  const periodEnd = addDays(addIntervals(start, interval, k + 1), -1);
  return { start: periodStart, end: periodEnd };
}

export function compareDates(a: Date, b: Date): number {
  return a.getTime() - b.getTime();
}
