import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { can } from "@/lib/permissions";
import { dec } from "@/lib/money";
import { recordAudit } from "@/server/platform/audit";
import { AppError, invalid, notFound } from "@/server/platform/errors";
import { isUniqueViolation, parseOrThrow } from "@/server/identity/service";
import { actorOf, requireStaff } from "@/server/identity/session";
import { requirePermissionFor } from "@/server/identity/access";
import { money, optional, PAGE_SIZE, pageOf, signedMoney, textParam, type Page } from "@/server/platform/validation";

export const productSchema = z.object({
  name: z.string().trim().min(1, "Enter a product name").max(160),
  type: z.enum(["SERVICE", "GOODS"], "Choose a product type"),
  salePrice: money("Enter the sale price, e.g. 2000.00"),
  costPrice: optional(money("Enter a valid cost price")),
  notes: optional(z.string().trim().max(2000)),
});

export const variantSchema = z
  .object({
    attribute: z.string().trim().min(1, "Enter an attribute, e.g. Brand").max(80),
    value: z.string().trim().min(1, "Enter a value, e.g. Odoo").max(80),
    adjustmentType: z.enum(["FIXED", "PERCENT"], "Choose how the price changes"),
    adjustmentValue: signedMoney(),
  })
  .refine((v) => v.adjustmentType !== "PERCENT" || dec(v.adjustmentValue).gte(-100), {
    path: ["adjustmentValue"],
    message: "A percentage reduction cannot exceed 100",
  });

export interface ProductRow {
  id: string;
  name: string;
  type: "SERVICE" | "GOODS";
  salePrice: string;
  activePlans: number;
  variants: number;
  status: "ACTIVE" | "ARCHIVED";
  updatedAt: Date;
}

export async function listProducts(params: { q?: unknown; status?: unknown; page?: unknown }): Promise<Page<ProductRow>> {
  const user = await requireStaff();
  const q = textParam(params.q);
  const status = params.status === "ARCHIVED" ? "ARCHIVED" : params.status === "all" ? undefined : "ACTIVE";
  const page = pageOf(params.page);
  const where: Prisma.ProductWhereInput = {
    organizationId: user.organizationId,
    ...(status ? { status } : {}),
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
  };
  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: [{ status: "asc" }, { name: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { _count: { select: { plans: { where: { status: "ACTIVE" } }, variants: { where: { status: "ACTIVE" } } } } },
    }),
  ]);
  return {
    total,
    page,
    pageSize: PAGE_SIZE,
    rows: rows.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      salePrice: p.salePrice.toString(),
      activePlans: p._count.plans,
      variants: p._count.variants,
      status: p.status,
      updatedAt: p.updatedAt,
    })),
  };
}

/** Out-of-organization IDs are reported as not found so they are not confirmed. */
export async function getProduct(id: string) {
  const user = await requireStaff();
  const product = await db.product.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      variants: { orderBy: [{ status: "asc" }, { attribute: "asc" }, { value: "asc" }] },
      plans: { orderBy: [{ status: "asc" }, { name: "asc" }] },
    },
  });
  if (!product) throw notFound("Product not found.");
  const canSeeCost = can(user, "catalog.write");
  return { ...product, costPrice: canSeeCost ? product.costPrice : null, canEdit: canSeeCost };
}

export async function createProduct(input: unknown): Promise<{ id: string }> {
  const user = await requirePermissionFor("catalog.write", "product.create");
  const data = parseOrThrow(productSchema, input);
  return db.$transaction(async (tx) => {
    const product = await tx.product.create({ data: { ...data, organizationId: user.organizationId } });
    await recordAudit(tx, actorOf(user), {
      action: "product.created",
      objectType: "Product",
      objectId: product.id,
      summary: `Created product ${product.name}`,
      changes: { salePrice: data.salePrice },
    });
    return { id: product.id };
  });
}

export async function updateProduct(id: string, input: unknown): Promise<void> {
  const user = await requirePermissionFor("catalog.write", "product.update");
  const data = parseOrThrow(productSchema, input);
  await db.$transaction(async (tx) => {
    const before = await tx.product.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!before) throw notFound("Product not found.");
    await tx.product.update({ where: { id }, data: { ...data, costPrice: data.costPrice ?? null, notes: data.notes ?? null } });
    await recordAudit(tx, actorOf(user), {
      action: "product.updated",
      objectType: "Product",
      objectId: id,
      summary: `Updated product ${data.name}`,
      changes: { salePrice: { from: before.salePrice.toString(), to: data.salePrice }, name: { from: before.name, to: data.name } },
    });
  });
}

/** Archiving hides a product from new sales; invoices and subscriptions keep their references (CAT-01). */
export async function setProductStatus(id: string, status: "ACTIVE" | "ARCHIVED"): Promise<void> {
  const user = await requirePermissionFor("catalog.write", "product.archive");
  await db.$transaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!product) throw notFound("Product not found.");
    await tx.product.update({ where: { id }, data: { status } });
    if (status === "ARCHIVED") await tx.plan.updateMany({ where: { productId: id, status: "ACTIVE" }, data: { status: "ARCHIVED" } });
    await recordAudit(tx, actorOf(user), {
      action: status === "ARCHIVED" ? "product.archived" : "product.restored",
      objectType: "Product",
      objectId: id,
      summary: `${status === "ARCHIVED" ? "Archived" : "Restored"} product ${product.name}`,
    });
  });
}

export async function addVariant(productId: string, input: unknown): Promise<{ id: string }> {
  const user = await requirePermissionFor("catalog.write", "variant.create");
  const data = parseOrThrow(variantSchema, input);
  try {
    return await db.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id: productId, organizationId: user.organizationId } });
      if (!product) throw notFound("Product not found.");
      if (product.status !== "ACTIVE") throw invalid("Restore the product before adding variants.");
      if (dec(product.salePrice).plus(data.adjustmentType === "FIXED" ? data.adjustmentValue : 0).lt(0)) {
        throw invalid("Check the highlighted fields.", { adjustmentValue: "The variant price cannot be below zero" });
      }
      const variant = await tx.productVariant.create({ data: { ...data, productId } });
      await recordAudit(tx, actorOf(user), {
        action: "variant.created",
        objectType: "ProductVariant",
        objectId: variant.id,
        summary: `Added variant ${data.attribute}: ${data.value} to ${product.name}`,
        changes: { adjustmentType: data.adjustmentType, adjustmentValue: data.adjustmentValue },
      });
      return { id: variant.id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError("CONFLICT", "This variant already exists.", { value: "Already defined for this attribute" });
    throw error;
  }
}

export async function setVariantStatus(variantId: string, status: "ACTIVE" | "ARCHIVED"): Promise<{ productId: string }> {
  const user = await requirePermissionFor("catalog.write", "variant.archive");
  return db.$transaction(async (tx) => {
    const variant = await tx.productVariant.findFirst({ where: { id: variantId, product: { organizationId: user.organizationId } } });
    if (!variant) throw notFound("Variant not found.");
    await tx.productVariant.update({ where: { id: variantId }, data: { status } });
    await recordAudit(tx, actorOf(user), {
      action: status === "ARCHIVED" ? "variant.archived" : "variant.restored",
      objectType: "ProductVariant",
      objectId: variantId,
      summary: `${status === "ARCHIVED" ? "Archived" : "Restored"} variant ${variant.attribute}: ${variant.value}`,
    });
    return { productId: variant.productId };
  });
}
