import "server-only";
import { z } from "zod";
import { invalid } from "@/server/platform/errors";
import type { Tx } from "@/server/db";
import { variantUnitPrice } from "@/lib/pricing";

export const lineSchema = z.object({
  productId: z.string().min(1, "Choose a product"),
  variantId: z.preprocess((v) => (v === "" ? null : v), z.string().nullish()),
  quantity: z.coerce.number().int("Quantity must be a whole number").min(1, "Quantity must be at least 1").max(100_000, "Quantity is too large"),
});

export const linesSchema = z.array(lineSchema).min(1, "Add at least one line").max(50, "A quotation can have at most 50 lines");

export type LineInput = z.infer<typeof lineSchema>;

export interface ResolvedLine extends LineInput {
  description: string;
  unitPrice: string;
}

/**
 * Resolve products/variants inside the organization and price each unit on
 * the server: the plan's own product uses the plan price, any add-on uses the
 * product's sale price, then the variant adjustment applies. Client-sent
 * prices are never trusted (QUO-03).
 */
export async function resolveLines(
  tx: Tx,
  organizationId: string,
  plan: { productId: string; price: { toString(): string } },
  lines: LineInput[],
  currency: string,
): Promise<ResolvedLine[]> {
  const products = await tx.product.findMany({
    where: { organizationId, id: { in: [...new Set(lines.map((l) => l.productId))] } },
    include: { variants: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const errors: Record<string, string> = {};
  const resolved = lines.map((l, i) => {
    const product = byId.get(l.productId);
    if (!product || product.status !== "ACTIVE") {
      errors[`lines.${i}.productId`] = product ? "This product is archived" : "Choose a product";
      return null;
    }
    const variant = l.variantId ? product.variants.find((v) => v.id === l.variantId) : null;
    if (l.variantId && (!variant || variant.status !== "ACTIVE")) {
      errors[`lines.${i}.variantId`] = "Choose an available variant";
      return null;
    }
    const base = product.id === plan.productId ? plan.price.toString() : product.salePrice.toString();
    const unit = variantUnitPrice(base, variant ? { adjustmentType: variant.adjustmentType, adjustmentValue: variant.adjustmentValue.toString() } : null, currency);
    return {
      ...l,
      variantId: variant?.id ?? null,
      description: variant ? `${product.name} — ${variant.attribute}: ${variant.value}` : product.name,
      unitPrice: unit.toFixed(4),
    };
  });
  if (Object.keys(errors).length) throw invalid("Check the highlighted lines.", errors);
  return resolved as ResolvedLine[];
}
