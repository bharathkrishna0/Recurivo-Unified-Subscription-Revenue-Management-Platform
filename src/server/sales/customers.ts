import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { dec } from "@/lib/money";
import { recordAudit } from "@/server/platform/audit";
import { AppError, notFound } from "@/server/platform/errors";
import { parseOrThrow } from "@/server/identity/service";
import { actorOf, requireStaff } from "@/server/identity/session";
import { optional, PAGE_SIZE, pageOf, textParam, type Page } from "@/server/platform/validation";

export const customerSchema = z.object({
  businessName: z.string().trim().min(1, "Enter the business name").max(160),
  contactName: z.string().trim().min(1, "Enter a contact name").max(120),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  phone: optional(z.string().trim().max(40)),
  billingAddress: optional(z.string().trim().max(500)),
  taxId: optional(z.string().trim().max(40)),
});

export interface CustomerRow {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  activeSubscriptions: number;
  outstanding: string;
  updatedAt: Date;
}

async function outstandingByCustomer(organizationId: string, customerIds: string[]): Promise<Map<string, string>> {
  if (customerIds.length === 0) return new Map();
  const sums = await db.invoice.groupBy({
    by: ["customerId"],
    where: { organizationId, customerId: { in: customerIds }, status: "CONFIRMED" },
    _sum: { total: true, amountPaid: true },
  });
  return new Map(sums.map((s) => [s.customerId, dec(s._sum.total ?? 0).minus(dec(s._sum.amountPaid ?? 0)).toString()]));
}

export async function listCustomers(params: { q?: unknown; page?: unknown }): Promise<Page<CustomerRow>> {
  const user = await requireStaff();
  const q = textParam(params.q);
  const page = pageOf(params.page);
  const where: Prisma.CustomerWhereInput = {
    organizationId: user.organizationId,
    archivedAt: null,
    ...(q
      ? { OR: [{ businessName: { contains: q, mode: "insensitive" } }, { contactName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }
      : {}),
  };
  const [total, rows] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({
      where,
      orderBy: { businessName: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { _count: { select: { subscriptions: { where: { status: { in: ["ACTIVE", "PAUSED"] } } } } } },
    }),
  ]);
  const owed = await outstandingByCustomer(user.organizationId, rows.map((r) => r.id));
  return {
    total,
    page,
    pageSize: PAGE_SIZE,
    rows: rows.map((c) => ({
      id: c.id,
      businessName: c.businessName,
      contactName: c.contactName,
      email: c.email,
      activeSubscriptions: c._count.subscriptions,
      outstanding: owed.get(c.id) ?? "0",
      updatedAt: c.updatedAt,
    })),
  };
}

export async function getCustomer(id: string) {
  const user = await requireStaff();
  const customer = await db.customer.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      portalUser: { select: { status: true } },
      subscriptions: { orderBy: { createdAt: "desc" }, take: 50, include: { plan: { select: { name: true, interval: true } } } },
      invoices: { orderBy: { issueDate: "desc" }, take: 20 },
    },
  });
  if (!customer) throw notFound("Customer not found.");
  const owed = await outstandingByCustomer(user.organizationId, [id]);
  return { ...customer, outstanding: owed.get(id) ?? "0" };
}

export async function customerOptions() {
  const user = await requireStaff();
  return db.customer.findMany({
    where: { organizationId: user.organizationId, archivedAt: null },
    orderBy: { businessName: "asc" },
    select: { id: true, businessName: true, email: true },
  });
}

async function assertEmailFree(tx: Prisma.TransactionClient, organizationId: string, email: string, exceptId?: string) {
  const clash = await tx.customer.findFirst({ where: { organizationId, email, archivedAt: null, ...(exceptId ? { NOT: { id: exceptId } } : {}) } });
  if (clash) throw new AppError("CONFLICT", "Another customer already uses this email.", { email: "Another customer already uses this email" });
}

export async function createCustomer(input: unknown): Promise<{ id: string }> {
  const user = await requireStaff();
  const data = parseOrThrow(customerSchema, input);
  return db.$transaction(async (tx) => {
    await assertEmailFree(tx, user.organizationId, data.email);
    const customer = await tx.customer.create({ data: { ...data, organizationId: user.organizationId } });
    await recordAudit(tx, actorOf(user), {
      action: "customer.created",
      objectType: "Customer",
      objectId: customer.id,
      summary: `Added customer ${customer.businessName}`,
    });
    return { id: customer.id };
  });
}

export async function updateCustomer(id: string, input: unknown): Promise<void> {
  const user = await requireStaff();
  const data = parseOrThrow(customerSchema, input);
  await db.$transaction(async (tx) => {
    const before = await tx.customer.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!before) throw notFound("Customer not found.");
    await assertEmailFree(tx, user.organizationId, data.email, id);
    await tx.customer.update({
      where: { id },
      data: { ...data, phone: data.phone ?? null, billingAddress: data.billingAddress ?? null, taxId: data.taxId ?? null },
    });
    await recordAudit(tx, actorOf(user), {
      action: "customer.updated",
      objectType: "Customer",
      objectId: id,
      summary: `Updated customer ${data.businessName}`,
      changes: { email: { from: before.email, to: data.email } },
    });
  });
}
