import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { dec } from "@/lib/money";
import { compareDates, todayIn } from "@/lib/dates";
import { recordAudit } from "@/server/platform/audit";
import { enqueueOutbox } from "@/server/platform/outbox";
import { AppError, invalid, notFound } from "@/server/platform/errors";
import { actorOf, requireStaff, requireUser, type CurrentUser } from "@/server/identity/session";
import { requirePermissionFor } from "@/server/identity/access";
import { PAGE_SIZE, pageOf, textParam, type Page } from "@/server/platform/validation";
import { runDueCycles, type BillingRunResult } from "./engine";
import { loadInvoiceDocument, renderInvoicePdf } from "./delivery";

export type PaymentState = "Paid" | "Partially paid" | "Overdue" | "Unpaid" | "Cancelled";

export function paymentStateOf(inv: { status: string; total: { toString(): string }; amountPaid: { toString(): string }; dueDate: Date }, today: Date): PaymentState {
  if (inv.status === "CANCELLED") return "Cancelled";
  if (inv.status === "PAID") return "Paid";
  if (compareDates(inv.dueDate, today) < 0) return "Overdue";
  return dec(inv.amountPaid).gt(0) ? "Partially paid" : "Unpaid";
}

const today = (user: CurrentUser) => todayIn(user.organization.timezone);

export interface InvoiceRow {
  id: string;
  number: string;
  customer: string;
  issueDate: Date;
  dueDate: Date;
  total: string;
  outstanding: string;
  state: PaymentState;
  deliveryStatus: string;
}

export async function listInvoices(params: { q?: unknown; status?: unknown; customerId?: unknown; page?: unknown }): Promise<Page<InvoiceRow>> {
  const user = await requireStaff();
  const q = textParam(params.q);
  const page = pageOf(params.page);
  const day = today(user);
  const status = String(params.status ?? "");
  const filter: Prisma.InvoiceWhereInput =
    status === "OVERDUE"
      ? { status: "CONFIRMED", dueDate: { lt: day } }
      : status === "OPEN"
        ? { status: "CONFIRMED" }
        : ["DRAFT", "CONFIRMED", "PAID", "CANCELLED"].includes(status)
          ? { status: status as "DRAFT" }
          : {};
  const where: Prisma.InvoiceWhereInput = {
    organizationId: user.organizationId,
    ...filter,
    ...(typeof params.customerId === "string" && params.customerId ? { customerId: params.customerId } : {}),
    ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { customer: { businessName: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    db.invoice.count({ where }),
    db.invoice.findMany({
      where,
      orderBy: status === "OVERDUE" ? [{ dueDate: "asc" }] : [{ issueDate: "desc" }, { number: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { customer: { select: { businessName: true } } },
    }),
  ]);
  return {
    total,
    page,
    pageSize: PAGE_SIZE,
    rows: rows.map((i) => ({
      id: i.id,
      number: i.number,
      customer: i.customer.businessName,
      issueDate: i.issueDate,
      dueDate: i.dueDate,
      total: i.total.toString(),
      outstanding: i.status === "CANCELLED" ? "0" : dec(i.total).minus(dec(i.amountPaid)).toString(),
      state: paymentStateOf(i, day),
      deliveryStatus: i.deliveryStatus,
    })),
  };
}

/** Staff see any invoice in their organization; customers only their own (AT-10: other IDs are NOT_FOUND). */
async function scopeFor(user: CurrentUser): Promise<Prisma.InvoiceWhereInput> {
  if (user.role === "CUSTOMER") return { organizationId: user.organizationId, customerId: user.customerId ?? "__none__", status: { not: "DRAFT" } };
  return { organizationId: user.organizationId };
}

export async function getInvoice(id: string) {
  const user = await requireStaff();
  const inv = await db.invoice.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      customer: true,
      subscription: { select: { id: true, number: true } },
      lines: { orderBy: { position: "asc" } },
      allocations: { orderBy: { createdAt: "asc" }, include: { payment: { select: { id: true, number: true, method: true, receivedOn: true, status: true } } } },
      redemptions: { include: { discountRule: { select: { name: true } } } },
    },
  });
  if (!inv) throw notFound("Invoice not found.");
  const activity = await db.auditEvent.findMany({ where: { organizationId: user.organizationId, objectType: "Invoice", objectId: id }, orderBy: { createdAt: "desc" }, take: 50 });
  return { ...inv, outstanding: dec(inv.total).minus(dec(inv.amountPaid)).toString(), state: paymentStateOf(inv, today(user)), activity };
}

export async function invoicePdf(id: string): Promise<{ filename: string; pdf: Buffer }> {
  const user = await requireUser();
  const visible = await db.invoice.findFirst({ where: { id, ...(await scopeFor(user)) }, select: { id: true } });
  if (!visible) throw notFound("Invoice not found.");
  const doc = await loadInvoiceDocument(db, id);
  return { filename: `${doc!.number}.pdf`, pdf: await renderInvoicePdf(doc!) };
}

export async function confirmInvoice(id: string): Promise<void> {
  const user = await requirePermissionFor("billing.manage", "invoice.confirm");
  await db.$transaction(async (tx) => {
    const inv = await tx.invoice.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!inv) throw notFound("Invoice not found.");
    const done = await tx.invoice.updateMany({ where: { id, status: "DRAFT" }, data: { status: "CONFIRMED", confirmedAt: new Date(), version: { increment: 1 } } });
    if (done.count !== 1) throw new AppError("INVALID_TRANSITION", "Only a draft invoice can be confirmed.");
    await recordAudit(tx, actorOf(user), { action: "invoice.confirmed", objectType: "Invoice", objectId: id, summary: `Confirmed ${inv.number}` });
  });
}

/** Queue (re)delivery. The PDF is rendered from the stored invoice, so resending never changes amounts (BILL-05). */
export async function sendInvoice(id: string): Promise<void> {
  const user = await requirePermissionFor("billing.manage", "invoice.send");
  await db.$transaction(async (tx) => {
    const inv = await tx.invoice.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!inv) throw notFound("Invoice not found.");
    if (inv.status === "DRAFT" || inv.status === "CANCELLED") throw new AppError("INVALID_TRANSITION", "Confirm the invoice before sending it.");
    const updated = await tx.invoice.updateMany({ where: { id, version: inv.version }, data: { deliveryStatus: "QUEUED", deliveryError: null, version: { increment: 1 } } });
    if (updated.count !== 1) throw new AppError("CONFLICT", "This invoice was changed by someone else. Reload and try again.");
    await enqueueOutbox(tx, "invoice.send", `invoice-send:${id}:v${inv.version + 1}`, { invoiceId: id });
    await tx.billingException.updateMany({
      where: { organizationId: user.organizationId, dedupeKey: `send:${id}`, status: "OPEN" },
      data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById: user.id, resolution: "Resent" },
    });
    await recordAudit(tx, actorOf(user), { action: "invoice.sent", objectType: "Invoice", objectId: id, summary: `Queued ${inv.number} for email to the customer` });
  });
}

const cancelSchema = z.string().trim().min(3, "Give a short reason").max(500);

/** Cancel is only allowed before any payment is applied; afterwards reverse the payment first (financial history is never edited). */
export async function cancelInvoice(id: string, reason: unknown): Promise<void> {
  const user = await requirePermissionFor("billing.manage", "invoice.cancel");
  const parsed = cancelSchema.safeParse(reason);
  if (!parsed.success) throw invalid("Check the highlighted fields.", { reason: parsed.error.issues[0].message });
  await db.$transaction(async (tx) => {
    const [inv] = await tx.$queryRaw<{ id: string; number: string; status: string; amountPaid: string }[]>`
      SELECT "id", "number", "status", "amountPaid"::text FROM "Invoice" WHERE "id" = ${id} AND "organizationId" = ${user.organizationId} FOR UPDATE`;
    if (!inv) throw notFound("Invoice not found.");
    if (inv.status === "PAID" || inv.status === "CANCELLED") throw new AppError("INVALID_TRANSITION", inv.status === "PAID" ? "A paid invoice cannot be cancelled." : "This invoice is already cancelled.");
    if (dec(inv.amountPaid).gt(0)) throw new AppError("INVALID_TRANSITION", "Reverse the payments applied to this invoice before cancelling it.");
    await tx.invoice.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: parsed.data, version: { increment: 1 } } });
    const redemptions = await tx.discountRedemption.findMany({ where: { invoiceId: id, reversedAt: null } });
    for (const r of redemptions) {
      await tx.discountRedemption.update({ where: { id: r.id }, data: { reversedAt: new Date() } });
      await tx.discountRule.update({ where: { id: r.discountRuleId }, data: { usageCount: { decrement: 1 } } });
    }
    await recordAudit(tx, actorOf(user), { action: "invoice.cancelled", objectType: "Invoice", objectId: id, summary: `Cancelled ${inv.number}: ${parsed.data}` });
  });
}

export async function runBillingNow(): Promise<BillingRunResult> {
  const user = await requirePermissionFor("billing.manage", "billing.run");
  const result = await runDueCycles(db, { organizationId: user.organizationId });
  await db.$transaction((tx) =>
    recordAudit(tx, actorOf(user), { action: "billing.run", objectType: "Organization", objectId: user.organizationId, summary: `Ran billing: ${result.invoiced} invoiced, ${result.failed} failed`, changes: { ...result } }),
  );
  return result;
}
