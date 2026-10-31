import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { dec, isValidMoneyString, roundMoney } from "@/lib/money";
import { recordAudit } from "@/server/platform/audit";
import { AppError, invalid, notFound } from "@/server/platform/errors";
import { nextNumber } from "@/server/platform/sequence";
import { parseOrThrow } from "@/server/identity/service";
import { actorOf, requireStaff } from "@/server/identity/session";
import { requirePermissionFor } from "@/server/identity/access";
import { dateOnly, optional, PAGE_SIZE, pageOf, type Page } from "@/server/platform/validation";

export const PAYMENT_METHODS = ["BANK_TRANSFER", "UPI", "CARD_EXTERNAL", "CHEQUE", "CASH", "OTHER"] as const;

const moneyString = z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Enter an amount like 1500 or 1500.50");

export const paymentSchema = z.object({
  customerId: z.string().min(1, "Choose a customer"),
  method: z.enum(PAYMENT_METHODS, "Choose a payment method"),
  amount: moneyString,
  receivedOn: dateOnly("Enter the date the money was received"),
  reference: optional(z.string().trim().max(120)),
  note: optional(z.string().trim().max(1000)),
  idempotencyKey: z.string().trim().min(8).max(100),
  allocations: z.array(z.object({ invoiceId: z.string().min(1), amount: moneyString })).max(100).default([]),
});

/**
 * Record a manual payment and apply it to open invoices (PAY-01/02/04).
 * Invoices are row-locked, allocations can never exceed an invoice's balance
 * or the payment amount, and replaying the same idempotency key returns the
 * original payment instead of recording a second one.
 */
export async function recordPayment(input: unknown): Promise<{ id: string; number: string; replayed: boolean }> {
  const user = await requirePermissionFor("payments.record", "payment.record");
  const data = parseOrThrow(paymentSchema, input);
  const currency = user.organization.currency;
  if (!isValidMoneyString(data.amount, currency) || dec(data.amount).lte(0)) throw invalid("Check the highlighted fields.", { amount: "Enter an amount greater than zero" });
  const existing = await db.payment.findUnique({ where: { organizationId_idempotencyKey: { organizationId: user.organizationId, idempotencyKey: data.idempotencyKey } } });
  if (existing) return { id: existing.id, number: existing.number, replayed: true };

  return db.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: data.customerId, organizationId: user.organizationId } });
    if (!customer) throw invalid("Check the highlighted fields.", { customerId: "Choose a customer" });
    const wanted = data.allocations.filter((a) => dec(a.amount).gt(0));
    const ids = [...new Set(wanted.map((a) => a.invoiceId))];
    const locked = ids.length
      ? await tx.$queryRaw<{ id: string; number: string; customerId: string; status: string; total: string; amountPaid: string }[]>`
          SELECT "id", "number", "customerId", "status", "total"::text, "amountPaid"::text FROM "Invoice"
          WHERE "id" = ANY(${ids}::text[]) AND "organizationId" = ${user.organizationId} ORDER BY "id" FOR UPDATE`
      : [];
    const byId = new Map(locked.map((i) => [i.id, i]));
    const errors: Record<string, string> = {};
    let allocated = dec(0);
    wanted.forEach((a, i) => {
      const inv = byId.get(a.invoiceId);
      const amount = roundMoney(a.amount, currency);
      if (!inv || inv.customerId !== customer.id || inv.status !== "CONFIRMED") {
        errors[`allocations.${i}.amount`] = "This invoice is not open for this customer";
        return;
      }
      const balance = dec(inv.total).minus(dec(inv.amountPaid));
      if (amount.gt(balance)) errors[`allocations.${i}.amount`] = `More than the ${balance.toFixed(2)} still due`;
      allocated = allocated.plus(amount);
    });
    if (allocated.gt(dec(data.amount))) errors.amount = "Allocations add up to more than the payment";
    if (Object.keys(errors).length) throw invalid("Check the highlighted fields.", errors);

    const number = await nextNumber(tx, user.organizationId, "PAY");
    const payment = await tx.payment.create({
      data: {
        organizationId: user.organizationId,
        number,
        customerId: customer.id,
        method: data.method,
        amount: roundMoney(data.amount, currency).toFixed(4),
        receivedOn: data.receivedOn,
        reference: data.reference ?? null,
        note: data.note ?? null,
        idempotencyKey: data.idempotencyKey,
        recordedById: user.id,
      },
    });
    for (const a of wanted) {
      const amount = roundMoney(a.amount, currency);
      const inv = byId.get(a.invoiceId)!;
      await tx.paymentAllocation.create({ data: { paymentId: payment.id, invoiceId: inv.id, amount: amount.toFixed(4) } });
      const paid = dec(inv.amountPaid).plus(amount);
      const settled = paid.gte(dec(inv.total));
      await tx.invoice.update({
        where: { id: inv.id },
        data: { amountPaid: paid.toFixed(4), version: { increment: 1 }, ...(settled ? { status: "PAID", paidAt: new Date() } : {}) },
      });
      inv.amountPaid = paid.toString();
      await recordAudit(tx, actorOf(user), {
        action: settled ? "invoice.paid" : "invoice.payment_applied",
        objectType: "Invoice",
        objectId: inv.id,
        summary: `${settled ? "Paid in full by" : "Applied"} ${number}: ${amount.toFixed(2)}`,
      });
    }
    const unapplied = dec(data.amount).minus(allocated);
    await recordAudit(tx, actorOf(user), {
      action: "payment.recorded",
      objectType: "Payment",
      objectId: payment.id,
      summary: `Recorded ${number} from ${customer.businessName}: ${dec(data.amount).toFixed(2)}${unapplied.gt(0) ? ` (${unapplied.toFixed(2)} unapplied)` : ""}`,
    });
    return { id: payment.id, number, replayed: false };
  });
}

/** Reversal restores each invoice's balance; the payment and its allocations stay on record, marked reversed. */
export async function reversePayment(id: string, reason: unknown): Promise<void> {
  const user = await requirePermissionFor("billing.manage", "payment.reverse");
  const parsed = z.string().trim().min(3, "Give a short reason").max(500).safeParse(reason);
  if (!parsed.success) throw invalid("Check the highlighted fields.", { reason: parsed.error.issues[0].message });
  await db.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({ where: { id, organizationId: user.organizationId }, include: { allocations: { where: { reversedAt: null } } } });
    if (!payment) throw notFound("Payment not found.");
    const done = await tx.payment.updateMany({ where: { id, status: "RECORDED" }, data: { status: "REVERSED", reversedAt: new Date(), reversalReason: parsed.data } });
    if (done.count !== 1) throw new AppError("INVALID_TRANSITION", "This payment is already reversed.");
    for (const a of payment.allocations) {
      await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${a.invoiceId} FOR UPDATE`;
      const inv = await tx.invoice.findUniqueOrThrow({ where: { id: a.invoiceId } });
      await tx.paymentAllocation.update({ where: { id: a.id }, data: { reversedAt: new Date() } });
      await tx.invoice.update({
        where: { id: inv.id },
        data: { amountPaid: dec(inv.amountPaid).minus(dec(a.amount)).toFixed(4), status: inv.status === "PAID" ? "CONFIRMED" : inv.status, paidAt: null, version: { increment: 1 } },
      });
      await recordAudit(tx, actorOf(user), { action: "invoice.payment_reversed", objectType: "Invoice", objectId: inv.id, summary: `Reversed ${payment.number} (${dec(a.amount).toFixed(2)}): ${parsed.data}` });
    }
    await recordAudit(tx, actorOf(user), { action: "payment.reversed", objectType: "Payment", objectId: id, summary: `Reversed ${payment.number}: ${parsed.data}` });
  });
}

export async function listPayments(params: { page?: unknown; customerId?: unknown }): Promise<Page<{ id: string; number: string; customer: string; method: string; amount: string; applied: string; receivedOn: Date; reference: string | null; status: string }>> {
  const user = await requireStaff();
  const page = pageOf(params.page);
  const where = { organizationId: user.organizationId, ...(typeof params.customerId === "string" && params.customerId ? { customerId: params.customerId } : {}) };
  const [total, rows] = await Promise.all([
    db.payment.count({ where }),
    db.payment.findMany({
      where,
      orderBy: [{ receivedOn: "desc" }, { number: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { customer: { select: { businessName: true } }, allocations: { where: { reversedAt: null }, select: { amount: true } } },
    }),
  ]);
  return {
    total,
    page,
    pageSize: PAGE_SIZE,
    rows: rows.map((p) => ({
      id: p.id,
      number: p.number,
      customer: p.customer.businessName,
      method: p.method,
      amount: p.amount.toString(),
      applied: p.allocations.reduce((s, a) => s.plus(dec(a.amount)), dec(0)).toString(),
      receivedOn: p.receivedOn,
      reference: p.reference,
      status: p.status,
    })),
  };
}

export async function getPayment(id: string) {
  const user = await requireStaff();
  const p = await db.payment.findFirst({
    where: { id, organizationId: user.organizationId },
    include: { customer: { select: { id: true, businessName: true } }, allocations: { include: { invoice: { select: { id: true, number: true } } } } },
  });
  if (!p) throw notFound("Payment not found.");
  return p;
}

export async function openInvoicesFor(customerId: string) {
  const user = await requireStaff();
  return db.invoice.findMany({
    where: { organizationId: user.organizationId, customerId, status: "CONFIRMED" },
    orderBy: [{ dueDate: "asc" }, { number: "asc" }],
    select: { id: true, number: true, dueDate: true, total: true, amountPaid: true },
  });
}
