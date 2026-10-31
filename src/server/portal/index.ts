import "server-only";
import { db } from "@/server/db";
import { requireUser, type CurrentUser } from "@/server/identity/session";
import { forbidden, notFound } from "@/server/platform/errors";
import { customerActions, isQuoteExpired } from "@/lib/lifecycle";
import { compareDates, todayIn } from "@/lib/dates";
import { dec } from "@/lib/money";
import { paymentStateOf } from "@/server/billing/invoices";

/**
 * Customer portal reads. Every query is pinned to the signed-in customer's own id, so a changed URL id
 * resolves to NOT_FOUND rather than another account's record (AT-10). Internal fields (owner, notes,
 * audit metadata, delivery errors) are never selected.
 */
type Customer = CurrentUser & { customerId: string };

async function requireCustomer(): Promise<Customer> {
  const user = await requireUser();
  if (user.role !== "CUSTOMER" || !user.customerId) throw forbidden();
  return user as Customer;
}

const own = (u: Customer) => ({ organizationId: u.organizationId, customerId: u.customerId });
const day = (u: Customer) => todayIn(u.organization.timezone);
const planSelect = { name: true, interval: true, termLength: true, allowPause: true, allowEarlyClose: true, allowRenewal: true, customerSelfService: true } as const;

function invoiceSummary(i: { id: string; number: string; status: string; issueDate: Date; dueDate: Date; total: { toString(): string }; amountPaid: { toString(): string } }, today: Date) {
  return {
    id: i.id,
    number: i.number,
    issueDate: i.issueDate,
    dueDate: i.dueDate,
    total: i.total.toString(),
    outstanding: i.status === "CANCELLED" || i.status === "PAID" ? "0" : dec(i.total).minus(dec(i.amountPaid)).toString(),
    state: paymentStateOf(i, today),
  };
}

export async function mySubscriptions() {
  const user = await requireCustomer();
  const today = day(user);
  const subs = await db.subscription.findMany({
    where: { ...own(user), status: { not: "DRAFT" } },
    orderBy: [{ createdAt: "desc" }],
    include: { plan: { select: planSelect }, renewal: { select: { id: true } } },
  });
  return subs.map((s) => ({
    id: s.id,
    number: s.number,
    plan: s.plan.name,
    interval: s.plan.interval,
    status: s.status,
    expired: isQuoteExpired(s, today),
    startDate: s.startDate,
    endDate: s.endDate,
    nextBillDate: s.nextBillDate,
    quoteValidUntil: s.quoteValidUntil,
    total: s.total.toString(),
    actions: customerActions({ ...s, hasRenewal: !!s.renewal }, today),
  }));
}

export async function mySubscription(id: string) {
  const user = await requireCustomer();
  const today = day(user);
  const s = await db.subscription.findFirst({
    where: { id, ...own(user), status: { not: "DRAFT" } },
    include: {
      plan: { select: planSelect },
      lines: { orderBy: { position: "asc" }, select: { id: true, description: true, quantity: true, unitPrice: true, discountAmount: true, taxAmount: true, total: true } },
      renewal: { select: { id: true, number: true, status: true } },
      renewedFrom: { select: { id: true, number: true } },
      invoices: { where: { status: { not: "DRAFT" } }, orderBy: { issueDate: "desc" }, take: 24 },
    },
  });
  if (!s) throw notFound("Subscription not found.");
  return {
    id: s.id,
    number: s.number,
    status: s.status,
    version: s.version,
    plan: s.plan,
    startDate: s.startDate,
    endDate: s.endDate,
    nextBillDate: s.nextBillDate,
    quoteValidUntil: s.quoteValidUntil,
    expired: isQuoteExpired(s, today),
    paymentTermsDays: s.paymentTermsDays,
    terms: s.terms,
    closeReason: s.closeReason,
    subtotal: s.subtotal.toString(),
    discountTotal: s.discountTotal.toString(),
    taxTotal: s.taxTotal.toString(),
    total: s.total.toString(),
    lines: s.lines,
    renewal: s.renewal && s.renewal.status !== "DRAFT" ? { id: s.renewal.id, number: s.renewal.number } : null,
    renewalRequested: !!s.renewal,
    renewedFrom: s.renewedFrom,
    invoices: s.invoices.map((i) => invoiceSummary(i, today)),
    actions: customerActions({ ...s, hasRenewal: !!s.renewal }, today),
  };
}

export async function myInvoices() {
  const user = await requireCustomer();
  const today = day(user);
  const rows = await db.invoice.findMany({ where: { ...own(user), status: { not: "DRAFT" } }, orderBy: [{ issueDate: "desc" }, { number: "desc" }], take: 200 });
  const invoices = rows.map((i) => invoiceSummary(i, today));
  const open = invoices.filter((i) => i.state !== "Paid" && i.state !== "Cancelled");
  return {
    invoices,
    balance: open.reduce((sum, i) => sum.plus(i.outstanding), dec(0)).toString(),
    overdue: open.filter((i) => i.state === "Overdue").reduce((sum, i) => sum.plus(i.outstanding), dec(0)).toString(),
    overdueCount: open.filter((i) => i.state === "Overdue").length,
  };
}

export async function myPayments() {
  const user = await requireCustomer();
  const rows = await db.payment.findMany({
    where: own(user),
    orderBy: [{ receivedOn: "desc" }, { number: "desc" }],
    take: 200,
    select: {
      id: true,
      number: true,
      method: true,
      amount: true,
      receivedOn: true,
      reference: true,
      status: true,
      allocations: { where: { reversedAt: null }, select: { amount: true, invoice: { select: { id: true, number: true } } } },
    },
  });
  return rows.map((p) => ({ ...p, amount: p.amount.toString(), allocations: p.allocations.map((a) => ({ ...a.invoice, amount: a.amount.toString() })) }));
}

export async function myInvoice(id: string) {
  const user = await requireCustomer();
  const i = await db.invoice.findFirst({
    where: { id, ...own(user), status: { not: "DRAFT" } },
    include: {
      subscription: { select: { id: true, number: true, plan: { select: { name: true } } } },
      lines: { orderBy: { position: "asc" }, select: { id: true, description: true, quantity: true, unitPrice: true, discountAmount: true, taxAmount: true, total: true } },
      allocations: { orderBy: { createdAt: "asc" }, select: { amount: true, reversedAt: true, payment: { select: { number: true, method: true, receivedOn: true, reference: true } } } },
    },
  });
  if (!i) throw notFound("Invoice not found.");
  return {
    ...invoiceSummary(i, day(user)),
    status: i.status,
    periodStart: i.periodStart,
    periodEnd: i.periodEnd,
    subtotal: i.subtotal.toString(),
    discountTotal: i.discountTotal.toString(),
    taxTotal: i.taxTotal.toString(),
    amountPaid: i.amountPaid.toString(),
    cancelReason: i.cancelReason,
    subscription: i.subscription,
    lines: i.lines,
    allocations: i.allocations,
  };
}

export async function portalHome() {
  const user = await requireCustomer();
  const today = day(user);
  const [subs, billing, pendingQuotes] = await Promise.all([
    db.subscription.findMany({
      where: { ...own(user), status: "ACTIVE" },
      orderBy: [{ nextBillDate: { sort: "asc", nulls: "last" } }],
      include: { plan: { select: { name: true, interval: true } } },
    }),
    myInvoices(),
    db.subscription.count({ where: { ...own(user), status: "QUOTATION", OR: [{ quoteValidUntil: null }, { quoteValidUntil: { gte: today } }] } }),
  ]);
  const next = subs.find((s) => s.nextBillDate && compareDates(s.nextBillDate, today) >= 0) ?? subs[0] ?? null;
  const nextDue = billing.invoices.filter((i) => i.state !== "Paid" && i.state !== "Cancelled").sort((a, b) => compareDates(a.dueDate, b.dueDate))[0] ?? null;
  return {
    activeCount: subs.length,
    next: next ? { id: next.id, number: next.number, plan: next.plan.name, interval: next.plan.interval, nextBillDate: next.nextBillDate, total: next.total.toString() } : null,
    balance: billing.balance,
    overdue: billing.overdue,
    overdueCount: billing.overdueCount,
    nextDue,
    pendingQuotes,
  };
}
