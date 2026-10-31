import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { compareDates } from "@/lib/dates";
import { dec } from "@/lib/money";
import { recordAudit } from "@/server/platform/audit";
import { invalid, notFound } from "@/server/platform/errors";
import { parseOrThrow } from "@/server/identity/service";
import { actorOf, requireStaff } from "@/server/identity/session";
import { requirePermissionFor } from "@/server/identity/access";
import { dateOnly, money, optional, PAGE_SIZE, pageOf, textParam, wholeNumber, type Page } from "@/server/platform/validation";

export const planSchema = z
  .object({
    productId: z.string().min(1, "Choose a product"),
    name: z.string().trim().min(1, "Enter a plan name").max(120),
    interval: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"], "Choose a billing period"),
    price: money("Enter the price per unit, e.g. 2000.00"),
    minQuantity: wholeNumber(1, "Minimum quantity must be a whole number of at least 1"),
    termLength: optional(wholeNumber(1, "Term must be a whole number of periods")),
    availableFrom: optional(dateOnly("Enter a valid start date")),
    availableUntil: optional(dateOnly("Enter a valid end date")),
    allowPause: z.boolean(),
    allowEarlyClose: z.boolean(),
    allowRenewal: z.boolean(),
    autoCloseAtExpiry: z.boolean(),
    customerSelfService: z.boolean(),
  })
  .refine((p) => !p.availableFrom || !p.availableUntil || compareDates(p.availableUntil, p.availableFrom) >= 0, {
    path: ["availableUntil"],
    message: "End date must be on or after the start date",
  });

export interface PlanRow {
  id: string;
  name: string;
  productName: string;
  price: string;
  interval: string;
  minQuantity: number;
  availableFrom: Date | null;
  availableUntil: Date | null;
  status: "ACTIVE" | "ARCHIVED";
  version: number;
}

export async function listPlans(params: { q?: unknown; status?: unknown; interval?: unknown; page?: unknown }): Promise<Page<PlanRow>> {
  const user = await requireStaff();
  const q = textParam(params.q);
  const status = params.status === "ARCHIVED" ? "ARCHIVED" : params.status === "all" ? undefined : "ACTIVE";
  const interval = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(String(params.interval)) ? (params.interval as PlanRow["interval"]) : undefined;
  const page = pageOf(params.page);
  const where: Prisma.PlanWhereInput = {
    organizationId: user.organizationId,
    ...(status ? { status } : {}),
    ...(interval ? { interval: interval as Prisma.PlanWhereInput["interval"] } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { product: { name: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    db.plan.count({ where }),
    db.plan.findMany({
      where,
      orderBy: [{ status: "asc" }, { name: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { product: { select: { name: true } } },
    }),
  ]);
  return {
    total,
    page,
    pageSize: PAGE_SIZE,
    rows: rows.map((p) => ({
      id: p.id,
      name: p.name,
      productName: p.product.name,
      price: p.price.toString(),
      interval: p.interval,
      minQuantity: p.minQuantity,
      availableFrom: p.availableFrom,
      availableUntil: p.availableUntil,
      status: p.status,
      version: p.version,
    })),
  };
}

export async function getPlan(id: string) {
  const user = await requireStaff();
  const plan = await db.plan.findFirst({
    where: { id, organizationId: user.organizationId },
    include: { product: { select: { id: true, name: true, status: true } }, versions: { orderBy: { version: "desc" } } },
  });
  if (!plan) throw notFound("Plan not found.");
  const activeSubscriptions = await db.subscription.count({ where: { planId: id, status: { in: ["ACTIVE", "PAUSED"] } } });
  return { ...plan, activeSubscriptions };
}

export async function planProductOptions() {
  const user = await requireStaff();
  return db.product.findMany({
    where: { organizationId: user.organizationId, status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, salePrice: true },
  });
}

export async function createPlan(input: unknown): Promise<{ id: string }> {
  const user = await requirePermissionFor("catalog.write", "plan.create");
  const data = parseOrThrow(planSchema, input);
  return db.$transaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { id: data.productId, organizationId: user.organizationId } });
    if (!product) throw invalid("Check the highlighted fields.", { productId: "Choose a product" });
    if (product.status !== "ACTIVE") throw invalid("Check the highlighted fields.", { productId: "This product is archived" });
    const plan = await tx.plan.create({ data: { ...data, organizationId: user.organizationId, version: 1 } });
    await tx.planVersion.create({ data: { planId: plan.id, version: 1, price: data.price, minQuantity: data.minQuantity, changedById: user.id } });
    await recordAudit(tx, actorOf(user), {
      action: "plan.created",
      objectType: "Plan",
      objectId: plan.id,
      summary: `Created plan ${plan.name} (${data.interval.toLowerCase()}) for ${product.name}`,
      changes: { price: data.price, minQuantity: data.minQuantity },
    });
    return { id: plan.id };
  });
}

/**
 * Price or minimum-quantity edits create a new plan version. Existing
 * subscriptions keep their own line snapshots and are not repriced (CAT-06).
 */
export async function updatePlan(id: string, input: unknown): Promise<{ version: number; newVersion: boolean }> {
  const user = await requirePermissionFor("catalog.write", "plan.update");
  const data = parseOrThrow(planSchema, input);
  return db.$transaction(async (tx) => {
    const before = await tx.plan.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!before) throw notFound("Plan not found.");
    if (data.productId !== before.productId) throw invalid("Check the highlighted fields.", { productId: "A plan's product cannot be changed" });
    const pricingChanged = !dec(before.price).eq(data.price) || before.minQuantity !== data.minQuantity;
    const version = pricingChanged ? before.version + 1 : before.version;
    const updated = await tx.plan.updateMany({
      where: { id, version: before.version },
      data: {
        ...data,
        termLength: data.termLength ?? null,
        availableFrom: data.availableFrom ?? null,
        availableUntil: data.availableUntil ?? null,
        version,
      },
    });
    if (updated.count !== 1) throw invalid("This plan was changed by someone else. Reload and try again.");
    if (pricingChanged) {
      await tx.planVersion.create({ data: { planId: id, version, price: data.price, minQuantity: data.minQuantity, changedById: user.id } });
    }
    await recordAudit(tx, actorOf(user), {
      action: "plan.updated",
      objectType: "Plan",
      objectId: id,
      summary: pricingChanged ? `Published version ${version} of plan ${data.name}` : `Updated plan ${data.name}`,
      changes: {
        price: { from: before.price.toString(), to: data.price },
        minQuantity: { from: before.minQuantity, to: data.minQuantity },
        version,
      },
    });
    return { version, newVersion: pricingChanged };
  });
}

export async function setPlanStatus(id: string, status: "ACTIVE" | "ARCHIVED"): Promise<void> {
  const user = await requirePermissionFor("catalog.write", "plan.archive");
  await db.$transaction(async (tx) => {
    const plan = await tx.plan.findFirst({ where: { id, organizationId: user.organizationId }, include: { product: true } });
    if (!plan) throw notFound("Plan not found.");
    if (status === "ACTIVE" && plan.product.status !== "ACTIVE") throw invalid("Restore the product before restoring this plan.");
    await tx.plan.update({ where: { id }, data: { status } });
    await recordAudit(tx, actorOf(user), {
      action: status === "ARCHIVED" ? "plan.archived" : "plan.restored",
      objectType: "Plan",
      objectId: id,
      summary: `${status === "ARCHIVED" ? "Archived" : "Restored"} plan ${plan.name}`,
    });
  });
}
