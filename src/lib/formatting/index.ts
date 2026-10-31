import { currencyScale, dec, type DecimalInput } from "@/lib/money";

export interface LocaleContext {
  locale: string;
  currency: string;
  timezone: string;
}

export function formatMoney(value: DecimalInput, ctx: Pick<LocaleContext, "locale" | "currency">, withCode = true): string {
  const scale = currencyScale(ctx.currency);
  const formatted = new Intl.NumberFormat(ctx.locale, {
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  }).format(Number(dec(value).toFixed(scale)));
  return withCode ? `${formatted} ${ctx.currency}` : formatted;
}

/** Format a DATE column (UTC midnight) as a calendar day without shifting it. */
export function formatDay(value: Date | null | undefined, locale: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(value);
}

export function formatDateTime(value: Date | null | undefined, ctx: Pick<LocaleContext, "locale" | "timezone">): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(ctx.locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ctx.timezone,
    timeZoneName: "short",
  }).format(value);
}

export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

export const intervalLabel: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
};
