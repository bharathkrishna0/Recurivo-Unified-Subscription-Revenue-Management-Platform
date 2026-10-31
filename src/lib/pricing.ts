import { compareDates } from "./dates";
import { dec, roundMoney, type Decimal, type DecimalInput } from "./money";

export interface VariantAdjustment {
  adjustmentType: "FIXED" | "PERCENT";
  adjustmentValue: DecimalInput;
}

/** Base price plus a variant modifier, e.g. 2,000.00 + Odoo 560.00 = 2,560.00 (CAT-02). */
export function variantUnitPrice(base: DecimalInput, variant: VariantAdjustment | null | undefined, currency: string): Decimal {
  const b = dec(base);
  if (!variant) return roundMoney(b, currency);
  const adj = variant.adjustmentType === "PERCENT" ? b.mul(dec(variant.adjustmentValue)).div(100) : dec(variant.adjustmentValue);
  return roundMoney(b.plus(adj), currency);
}

export interface SellableWindow {
  status: "ACTIVE" | "ARCHIVED";
  availableFrom: Date | null;
  availableUntil: Date | null;
}

/** A plan can be newly sold only when active and inside its availability window (CAT-04). */
export function isPlanSellable(plan: SellableWindow, today: Date): boolean {
  if (plan.status !== "ACTIVE") return false;
  if (plan.availableFrom && compareDates(today, plan.availableFrom) < 0) return false;
  if (plan.availableUntil && compareDates(today, plan.availableUntil) > 0) return false;
  return true;
}

export function taxAmount(base: DecimalInput, ratePercent: DecimalInput, currency: string): Decimal {
  return roundMoney(dec(base).mul(dec(ratePercent)).div(100), currency);
}

export interface DiscountShape {
  type: "FIXED" | "PERCENT";
  value: DecimalInput;
}

/** Discount never exceeds the amount it applies to. */
export function discountAmount(base: DecimalInput, rule: DiscountShape, currency: string): Decimal {
  const b = dec(base);
  const raw = rule.type === "PERCENT" ? b.mul(dec(rule.value)).div(100) : dec(rule.value);
  return roundMoney(raw.gt(b) ? b : raw, currency);
}

export type DiscountState = "SCHEDULED" | "ACTIVE" | "EXPIRED" | "EXHAUSTED" | "ARCHIVED";

export function discountState(
  rule: { status: "ACTIVE" | "ARCHIVED"; startsAt: Date; endsAt: Date | null; usageLimit: number | null; usageCount: number },
  today: Date,
): DiscountState {
  if (rule.status === "ARCHIVED") return "ARCHIVED";
  if (rule.usageLimit !== null && rule.usageCount >= rule.usageLimit) return "EXHAUSTED";
  if (compareDates(today, rule.startsAt) < 0) return "SCHEDULED";
  if (rule.endsAt && compareDates(today, rule.endsAt) > 0) return "EXPIRED";
  return "ACTIVE";
}

export function taxRuleInEffect(rule: { status: "ACTIVE" | "ARCHIVED"; effectiveFrom: Date; effectiveUntil: Date | null }, day: Date): boolean {
  if (rule.status !== "ACTIVE") return false;
  if (compareDates(day, rule.effectiveFrom) < 0) return false;
  return !rule.effectiveUntil || compareDates(day, rule.effectiveUntil) <= 0;
}
