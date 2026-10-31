import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { compareDates } from "@/lib/dates";
import { dec } from "@/lib/money";
import { recordAudit } from "@/server/platform/audit";
import { invalid, notFound } from "@/server/platform/errors";
import { parseOrThrow } from "@/server/identity/service";
import { actorOf, requireStaff } from "@/server/identity/session";
import { requireAdminFor } from "@/server/identity/access";
import { dateOnly, money, optional, wholeNumber } from "@/server/platform/validation";

export const discountSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a discount name").max(120),
    type: z.enum(["FIXED", "PERCENT"], "Choose fixed amount or percentage"),
    value: money("Enter the discount value"),
    scope: z.enum(["PRODUCT", "SUBSCRIPTION"], "Choose what the discount applies to"),
    productId: optional(z.string().min(1)),
    minQuantity: optional(wholeNumber(1, "Minimum quantity must be a whole number of at least 1")),
    minAmount: optional(money("Enter a valid minimum amount")),
    startsAt: dateOnly("Enter the start date"),
    endsAt: optional(dateOnly("Enter a valid end date")),
    usageLimit: optional(wholeNumber(1, "Usage limit must be a whole number of at least 1")),
    priority: wholeNumber(0, "Priority must be a whole number of 0 or more"),
  })
  .refine((d) => d.type !== "PERCENT" || dec(d.value).lte(100), { path: ["value"], message: "A percentage cannot exceed 100" })
  .refine((d) => dec(d.value).gt(0), { path: ["value"], message: "Enter a value above zero" })
  .refine((d) => d.scope !== "PRODUCT" || Boolean(d.productId), { path: ["productId"], message: "Choose the product this discount applies to" })
  .refine((d) => !d.endsAt || compareDates(d.endsAt, d.startsAt) >= 0, { path: ["endsAt"], message: "End date must be on or after the start date" });

export async function listDiscountRules() {
  const user = await requireStaff();
  return db.discountRule.findMany({
    where: { organizationId: user.organizationId },
    orderBy: [{ status: "asc" }, { priority: "desc" }, { startsAt: "desc" }],
    include: { product: { select: { id: true, name: true } }, _count: { select: { redemptions: { where: { reversedAt: null } } } } },
  });
}

export async function getDiscountRule(id: string) {
  const user = await requireStaff();
  const rule = await db.discountRule.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      product: { select: { id: true, name: true } },
      redemptions: { orderBy: { createdAt: "desc" }, take: 50, include: { invoice: { select: { id: true, number: true } } } },
    },
  });
  if (!rule) throw notFound("Discount not found.");
  return rule;
}

/** Only administrators create or change discount rules; other attempts are denied and logged (DIS-01). */
export async function createDiscountRule(input: unknown): Promise<{ id: string }> {
  const user = await requireAdminFor("discount.create");
  const data = parseOrThrow(discountSchema, input);
  return db.$transaction(async (tx) => {
    if (data.scope === "PRODUCT") {
      const product = await tx.product.findFirst({ where: { id: data.productId, organizationId: user.organizationId } });
      if (!product) throw invalid("Check the highlighted fields.", { productId: "Choose a product" });
    }
    const rule = await tx.discountRule.create({
      data: { ...data, productId: data.scope === "PRODUCT" ? data.productId : null, organizationId: user.organizationId, createdById: user.id },
    });
    await recordAudit(tx, actorOf(user), {
      action: "discount.created",
      objectType: "DiscountRule",
      objectId: rule.id,
      summary: `Created discount ${rule.name} (${data.type === "PERCENT" ? `${data.value}%` : data.value})`,
      changes: { type: data.type, value: data.value, scope: data.scope, usageLimit: data.usageLimit ?? null },
    });
    return { id: rule.id };
  });
}

export async function setDiscountRuleStatus(id: string, status: "ACTIVE" | "ARCHIVED"): Promise<void> {
  const user = await requireAdminFor(status === "ARCHIVED" ? "discount.archive" : "discount.restore");
  await db.$transaction(async (tx) => {
    const rule = await tx.discountRule.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!rule) throw notFound("Discount not found.");
    await tx.discountRule.update({ where: { id }, data: { status } });
    await recordAudit(tx, actorOf(user), {
      action: status === "ARCHIVED" ? "discount.archived" : "discount.restored",
      objectType: "DiscountRule",
      objectId: id,
      summary: `${status === "ARCHIVED" ? "Archived" : "Restored"} discount ${rule.name}`,
    });
  });
}
