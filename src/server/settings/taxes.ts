import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { compareDates } from "@/lib/dates";
import { recordAudit } from "@/server/platform/audit";
import { invalid, notFound } from "@/server/platform/errors";
import { parseOrThrow } from "@/server/identity/service";
import { actorOf, requireStaff } from "@/server/identity/session";
import { requirePermissionFor } from "@/server/identity/access";
import { dateOnly, optional, percent } from "@/server/platform/validation";

export const taxSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a tax name, e.g. GST 18%").max(120),
    jurisdiction: optional(z.string().trim().max(120)),
    rate: percent(),
    scope: z.enum(["ALL_PRODUCTS", "SELECTED_PRODUCTS"], "Choose where the tax applies"),
    productIds: z.array(z.string()).max(500),
    effectiveFrom: dateOnly("Enter the date the tax starts"),
    effectiveUntil: optional(dateOnly("Enter a valid end date")),
  })
  .refine((t) => !t.effectiveUntil || compareDates(t.effectiveUntil, t.effectiveFrom) >= 0, {
    path: ["effectiveUntil"],
    message: "End date must be on or after the start date",
  })
  .refine((t) => t.scope === "ALL_PRODUCTS" || t.productIds.length > 0, { path: ["productIds"], message: "Choose at least one product" });

export async function listTaxRules() {
  const user = await requireStaff();
  return db.taxRule.findMany({
    where: { organizationId: user.organizationId },
    orderBy: [{ status: "asc" }, { effectiveFrom: "desc" }],
    include: { products: { select: { id: true, name: true } } },
  });
}

export async function getTaxRule(id: string) {
  const user = await requireStaff();
  const rule = await db.taxRule.findFirst({ where: { id, organizationId: user.organizationId }, include: { products: { select: { id: true, name: true } } } });
  if (!rule) throw notFound("Tax rule not found.");
  return rule;
}

async function scopedProducts(organizationId: string, ids: string[]) {
  if (!ids.length) return [];
  const found = await db.product.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true } });
  if (found.length !== new Set(ids).size) throw invalid("Check the highlighted fields.", { productIds: "One of the products is not available" });
  return found;
}

export async function saveTaxRule(id: string | null, input: unknown): Promise<{ id: string }> {
  const user = await requirePermissionFor("catalog.write", id ? "tax.update" : "tax.create");
  const { productIds, ...data } = parseOrThrow(taxSchema, input);
  const products = data.scope === "SELECTED_PRODUCTS" ? await scopedProducts(user.organizationId, productIds) : [];
  return db.$transaction(async (tx) => {
    let ruleId = id;
    if (id) {
      const before = await tx.taxRule.findFirst({ where: { id, organizationId: user.organizationId } });
      if (!before) throw notFound("Tax rule not found.");
      await tx.taxRule.update({
        where: { id },
        data: { ...data, jurisdiction: data.jurisdiction ?? null, effectiveUntil: data.effectiveUntil ?? null, products: { set: products } },
      });
      await recordAudit(tx, actorOf(user), {
        action: "tax.updated",
        objectType: "TaxRule",
        objectId: id,
        summary: `Updated tax rule ${data.name}`,
        changes: { rate: { from: before.rate.toString(), to: data.rate } },
      });
    } else {
      const rule = await tx.taxRule.create({ data: { ...data, organizationId: user.organizationId, products: { connect: products } } });
      ruleId = rule.id;
      await recordAudit(tx, actorOf(user), {
        action: "tax.created",
        objectType: "TaxRule",
        objectId: rule.id,
        summary: `Created tax rule ${data.name} at ${data.rate}%`,
      });
    }
    return { id: ruleId! };
  });
}

export async function setTaxRuleStatus(id: string, status: "ACTIVE" | "ARCHIVED"): Promise<void> {
  const user = await requirePermissionFor("catalog.write", "tax.archive");
  await db.$transaction(async (tx) => {
    const rule = await tx.taxRule.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!rule) throw notFound("Tax rule not found.");
    await tx.taxRule.update({ where: { id }, data: { status } });
    await recordAudit(tx, actorOf(user), {
      action: status === "ARCHIVED" ? "tax.archived" : "tax.restored",
      objectType: "TaxRule",
      objectId: id,
      summary: `${status === "ARCHIVED" ? "Archived" : "Restored"} tax rule ${rule.name}`,
    });
  });
}
