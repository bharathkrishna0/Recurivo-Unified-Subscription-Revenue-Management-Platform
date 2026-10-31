import { describe, expect, it } from "vitest";
import { priceQuote, type QuoteDiscount, type QuoteTax } from "@/lib/quote-pricing";

const gst: QuoteTax = { id: "gst", name: "GST 18%", rate: "18", scope: "ALL_PRODUCTS", productIds: [] };
const cess: QuoteTax = { id: "cess", name: "Cess 1%", rate: "1", scope: "SELECTED_PRODUCTS", productIds: ["crm"] };
const lines = [
  { productId: "crm", quantity: 5, unitPrice: "2560" },
  { productId: "support", quantity: 1, unitPrice: "1500" },
];
const fixed = (value: string, extra: Partial<QuoteDiscount> = {}): QuoteDiscount => ({
  id: "d",
  name: "Promo",
  type: "FIXED",
  value,
  scope: "SUBSCRIPTION",
  productId: null,
  minQuantity: null,
  minAmount: null,
  ...extra,
});

describe("priceQuote", () => {
  it("computes subtotal, per-product taxes and totals", () => {
    const q = priceQuote(lines, { taxes: [gst, cess], currency: "INR" });
    expect(q.lines[0].lineSubtotal.toFixed(2)).toBe("12800.00");
    expect(q.lines[0].taxRate.toString()).toBe("19");
    expect(q.lines[0].taxAmount.toFixed(2)).toBe("2432.00");
    expect(q.lines[1].taxBreakdown.map((t) => t.taxRuleId)).toEqual(["gst"]);
    expect(q.subtotal.toFixed(2)).toBe("14300.00");
    expect(q.taxTotal.toFixed(2)).toBe("2702.00");
    expect(q.total.toFixed(2)).toBe("17002.00");
  });

  it("applies a percentage subscription discount before tax", () => {
    const q = priceQuote(lines, { taxes: [gst], currency: "INR", discount: fixed("10", { type: "PERCENT" }) });
    expect(q.discountTotal.toFixed(2)).toBe("1430.00");
    expect(q.lines[0].taxableAmount.toFixed(2)).toBe("11520.00");
    expect(q.taxTotal.toFixed(2)).toBe("2316.60");
    expect(q.total.toFixed(2)).toBe("15186.60");
  });

  it("spreads a fixed discount proportionally without losing a paisa", () => {
    const q = priceQuote(
      [
        { productId: "a", quantity: 1, unitPrice: "100" },
        { productId: "b", quantity: 1, unitPrice: "100" },
        { productId: "c", quantity: 1, unitPrice: "100" },
      ],
      { taxes: [], currency: "INR", discount: fixed("100") },
    );
    expect(q.lines.map((l) => l.discountAmount.toFixed(2))).toEqual(["33.33", "33.33", "33.34"]);
    expect(q.discountTotal.toFixed(2)).toBe("100.00");
  });

  it("caps a fixed discount at the eligible amount", () => {
    const q = priceQuote([{ productId: "a", quantity: 1, unitPrice: "50" }], { taxes: [gst], currency: "INR", discount: fixed("80") });
    expect(q.lines[0].discountAmount.toFixed(2)).toBe("50.00");
    expect(q.total.toFixed(2)).toBe("0.00");
  });

  it("limits a product discount to that product's lines", () => {
    const q = priceQuote(lines, { taxes: [], currency: "INR", discount: fixed("10", { type: "PERCENT", scope: "PRODUCT", productId: "support" }) });
    expect(q.lines.map((l) => l.discountAmount.toFixed(2))).toEqual(["0.00", "150.00"]);
    expect(q.lines[0].discountRuleId).toBeNull();
    expect(q.lines[1].discountRuleId).toBe("d");
  });

  it("explains why a discount did not apply", () => {
    expect(priceQuote(lines, { taxes: [], currency: "INR", discount: fixed("10", { minQuantity: 10 }) }).discountNotApplied).toMatch(/at least 10/);
    expect(priceQuote(lines, { taxes: [], currency: "INR", discount: fixed("10", { minAmount: "20000" }) }).discountNotApplied).toMatch(/amount/);
    expect(priceQuote(lines, { taxes: [], currency: "INR", discount: fixed("10", { scope: "PRODUCT", productId: "x" }) }).discountNotApplied).toMatch(/No line/);
  });
});
