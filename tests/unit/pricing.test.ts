import { describe, expect, it } from "vitest";
import { discountAmount, discountState, isPlanSellable, taxAmount, taxRuleInEffect, variantUnitPrice } from "@/lib/pricing";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("variantUnitPrice", () => {
  it("adds a fixed modifier to the base price (CAT-02 example)", () => {
    expect(variantUnitPrice("2000", { adjustmentType: "FIXED", adjustmentValue: "560" }, "INR").toFixed(2)).toBe("2560.00");
  });
  it("applies percentage modifiers with half-up rounding", () => {
    expect(variantUnitPrice("999.99", { adjustmentType: "PERCENT", adjustmentValue: "12.5" }, "INR").toFixed(2)).toBe("1124.99");
  });
  it("supports reductions and no variant", () => {
    expect(variantUnitPrice("100", { adjustmentType: "FIXED", adjustmentValue: "-25" }, "INR").toFixed(2)).toBe("75.00");
    expect(variantUnitPrice("100.005", null, "INR").toFixed(2)).toBe("100.01");
  });
});

describe("isPlanSellable", () => {
  const plan = { status: "ACTIVE" as const, availableFrom: d("2026-01-01"), availableUntil: d("2026-12-31") };
  it("respects inclusive availability bounds", () => {
    expect(isPlanSellable(plan, d("2026-01-01"))).toBe(true);
    expect(isPlanSellable(plan, d("2026-12-31"))).toBe(true);
    expect(isPlanSellable(plan, d("2025-12-31"))).toBe(false);
    expect(isPlanSellable(plan, d("2027-01-01"))).toBe(false);
  });
  it("never sells archived plans", () => {
    expect(isPlanSellable({ ...plan, status: "ARCHIVED" }, d("2026-06-01"))).toBe(false);
  });
});

describe("tax and discount maths", () => {
  it("computes tax on decimal amounts", () => {
    expect(taxAmount("2560", "18", "INR").toFixed(2)).toBe("460.80");
  });
  it("caps a discount at the amount it applies to", () => {
    expect(discountAmount("300", { type: "FIXED", value: "500" }, "INR").toFixed(2)).toBe("300.00");
    expect(discountAmount("2560", { type: "PERCENT", value: "10" }, "INR").toFixed(2)).toBe("256.00");
  });
  it("derives a discount state from dates and usage", () => {
    const base = { status: "ACTIVE" as const, startsAt: d("2026-02-01"), endsAt: d("2026-02-28"), usageLimit: 2, usageCount: 0 };
    expect(discountState(base, d("2026-01-31"))).toBe("SCHEDULED");
    expect(discountState(base, d("2026-02-28"))).toBe("ACTIVE");
    expect(discountState(base, d("2026-03-01"))).toBe("EXPIRED");
    expect(discountState({ ...base, usageCount: 2 }, d("2026-02-10"))).toBe("EXHAUSTED");
    expect(discountState({ ...base, status: "ARCHIVED" }, d("2026-02-10"))).toBe("ARCHIVED");
  });
  it("checks tax effective windows", () => {
    const rule = { status: "ACTIVE" as const, effectiveFrom: d("2026-04-01"), effectiveUntil: null };
    expect(taxRuleInEffect(rule, d("2026-03-31"))).toBe(false);
    expect(taxRuleInEffect(rule, d("2026-04-01"))).toBe(true);
  });
});
