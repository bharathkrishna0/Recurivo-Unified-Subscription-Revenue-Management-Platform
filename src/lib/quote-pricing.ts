import { dec, roundMoney, type Decimal, type DecimalInput } from "./money";
import { discountAmount, taxAmount } from "./pricing";

export interface QuoteLineInput {
  productId: string;
  quantity: number;
  unitPrice: DecimalInput;
}

export interface QuoteTax {
  id: string;
  name: string;
  rate: DecimalInput;
  scope: "ALL_PRODUCTS" | "SELECTED_PRODUCTS";
  productIds: string[];
}

export interface QuoteDiscount {
  id: string;
  name: string;
  type: "FIXED" | "PERCENT";
  value: DecimalInput;
  scope: "PRODUCT" | "SUBSCRIPTION";
  productId: string | null;
  minQuantity: number | null;
  minAmount: DecimalInput | null;
}

export interface TaxPart {
  taxRuleId: string;
  name: string;
  rate: string;
  amount: string;
}

export interface PricedLine {
  lineSubtotal: Decimal;
  discountAmount: Decimal;
  discountRuleId: string | null;
  taxableAmount: Decimal;
  taxRate: Decimal;
  taxAmount: Decimal;
  total: Decimal;
  taxBreakdown: TaxPart[];
}

export interface PricedQuote {
  lines: PricedLine[];
  subtotal: Decimal;
  discountTotal: Decimal;
  taxTotal: Decimal;
  total: Decimal;
  /** Why a requested discount did not apply, if it didn't. */
  discountNotApplied?: string;
}

const sum = (values: Decimal[]) => values.reduce((a, b) => a.plus(b), dec(0));

function discountTargets(lines: QuoteLineInput[], d: QuoteDiscount): number[] {
  return lines.flatMap((l, i) => (d.scope === "SUBSCRIPTION" || l.productId === d.productId ? [i] : []));
}

/**
 * Server-side quotation pricing (QUO-03). Per line:
 *   subtotal = unitPrice × quantity
 *   taxable  = subtotal − discount
 *   tax      = Σ round(taxable × rate) over every tax rule that covers the product
 * A fixed discount is spread across eligible lines in proportion to their
 * subtotals; the rounding remainder lands on the last eligible line.
 */
export function priceQuote(
  input: QuoteLineInput[],
  opts: { taxes: QuoteTax[]; discount?: QuoteDiscount | null; currency: string },
): PricedQuote {
  const { currency } = opts;
  const subtotals = input.map((l) => roundMoney(dec(l.unitPrice).mul(l.quantity), currency));
  const discounts = input.map(() => dec(0));
  let discountNotApplied: string | undefined;

  const d = opts.discount;
  if (d) {
    const targets = discountTargets(input, d);
    const qty = targets.reduce((n, i) => n + input[i].quantity, 0);
    const base = sum(targets.map((i) => subtotals[i]));
    if (targets.length === 0) discountNotApplied = "No line uses the discounted product.";
    else if (d.minQuantity !== null && qty < d.minQuantity) discountNotApplied = `Needs a quantity of at least ${d.minQuantity}.`;
    else if (d.minAmount !== null && base.lt(dec(d.minAmount))) discountNotApplied = `Needs an amount of at least ${dec(d.minAmount).toFixed(2)}.`;
    else if (d.type === "PERCENT") {
      for (const i of targets) discounts[i] = discountAmount(subtotals[i], d, currency);
    } else if (base.gt(0)) {
      const totalOff = discountAmount(base, d, currency);
      let remaining = totalOff;
      targets.forEach((i, k) => {
        const share = k === targets.length - 1 ? remaining : roundMoney(totalOff.mul(subtotals[i]).div(base), currency);
        discounts[i] = share.gt(subtotals[i]) ? subtotals[i] : share;
        remaining = remaining.minus(discounts[i]);
      });
    }
  }

  const lines = input.map((l, i): PricedLine => {
    const taxable = subtotals[i].minus(discounts[i]);
    const applicable = opts.taxes.filter((t) => t.scope === "ALL_PRODUCTS" || t.productIds.includes(l.productId));
    const parts = applicable.map((t) => ({ t, amount: taxAmount(taxable, t.rate, currency) }));
    const tax = sum(parts.map((p) => p.amount));
    return {
      lineSubtotal: subtotals[i],
      discountAmount: discounts[i],
      discountRuleId: discounts[i].gt(0) && d ? d.id : null,
      taxableAmount: taxable,
      taxRate: sum(applicable.map((t) => dec(t.rate))),
      taxAmount: tax,
      total: taxable.plus(tax),
      taxBreakdown: parts.map((p) => ({ taxRuleId: p.t.id, name: p.t.name, rate: dec(p.t.rate).toString(), amount: p.amount.toFixed(4) })),
    };
  });

  return {
    lines,
    subtotal: sum(lines.map((l) => l.lineSubtotal)),
    discountTotal: sum(lines.map((l) => l.discountAmount)),
    taxTotal: sum(lines.map((l) => l.taxAmount)),
    total: sum(lines.map((l) => l.total)),
    discountNotApplied,
  };
}
