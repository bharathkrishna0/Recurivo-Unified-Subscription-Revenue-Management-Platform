import { describe, expect, it, vi } from "vitest";
import { PrismaClient, type Prisma } from "@prisma/client";
import type { CurrentUser } from "@/server/identity/session";
import { addDays, formatDateOnly, todayIn } from "@/lib/dates";

/**
 * AT-11 performance profile. Opt-in (PERF=1 npm run perf): seeds a separate "Recurivo Perf Profile"
 * organization with PERF_SUBSCRIPTIONS (default 10,000) subscriptions, 3 invoices each and payments for
 * two of them, then measures p95/p99 of the reporting and list queries behind the busiest pages and one
 * due-billing batch. PERF_RESET=1 drops and reseeds the profile.
 */
let current: CurrentUser;
vi.mock("@/server/identity/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/identity/session")>();
  return { ...original, requireUser: vi.fn(async () => current), requireStaff: vi.fn(async () => current) };
});

const ORG = "Recurivo Perf Profile";
const SUBS = Number(process.env.PERF_SUBSCRIPTIONS ?? 10_000);
const CUSTOMERS = 300;
const RUNS = 30;
const BATCH = 2_000;
const db = new PrismaClient();

async function chunked<T>(rows: T[], insert: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += BATCH) await insert(rows.slice(i, i + BATCH));
}

async function reset() {
  const org = await db.organization.findFirst({ where: { legalName: ORG } });
  if (!org) return;
  const o = { organizationId: org.id };
  await db.paymentAllocation.deleteMany({ where: { payment: o } });
  await db.payment.deleteMany({ where: o });
  await db.discountRedemption.deleteMany({ where: { invoice: o } });
  await db.invoiceLine.deleteMany({ where: { invoice: o } });
  await db.invoice.deleteMany({ where: o });
  await db.billingCycle.deleteMany({ where: { subscription: o } });
  await db.billingException.deleteMany({ where: o });
  await db.subscriptionLine.deleteMany({ where: { subscription: o } });
  await db.subscription.deleteMany({ where: o });
  await db.taxRule.deleteMany({ where: o });
  await db.plan.deleteMany({ where: o });
  await db.product.deleteMany({ where: o });
  await db.customer.deleteMany({ where: o });
  await db.auditEvent.deleteMany({ where: o });
  await db.session.deleteMany({ where: { user: o } });
  await db.user.deleteMany({ where: o });
  await db.sequence.deleteMany({ where: o });
  await db.organization.delete({ where: { id: org.id } });
}

async function seed(): Promise<string> {
  const { hashPassword } = await import("@/server/identity/password");
  const org = await db.organization.create({ data: { legalName: ORG, currency: "INR", timezone: "Asia/Kolkata", locale: "en-IN" } });
  const o = org.id;
  const admin = await db.user.create({ data: { organizationId: o, email: "perf.admin@recurivo.test", name: "Perf Admin", role: "ADMIN", passwordHash: await hashPassword(process.env.SEED_PASSWORD ?? "Recurivo#2026") } });
  const product = await db.product.create({ data: { organizationId: o, name: "CRM seat", salePrice: "1000" } });
  await db.taxRule.create({ data: { organizationId: o, name: "GST", rate: "18", effectiveFrom: new Date("2020-01-01") } });
  const plans = await Promise.all(
    (["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const).map((interval) => db.plan.create({ data: { organizationId: o, productId: product.id, name: `CRM ${interval.toLowerCase()}`, interval, price: "1000" } })),
  );
  const customers = Array.from({ length: CUSTOMERS }, (_, i) => ({ id: `perfc${i}`, organizationId: o, businessName: `Customer ${String(i).padStart(4, "0")}`, contactName: "Perf", email: `c${i}@perf.test` }));
  await db.customer.createMany({ data: customers });

  const today = todayIn(org.timezone);
  const subs: Prisma.SubscriptionCreateManyInput[] = [];
  const lines: Prisma.SubscriptionLineCreateManyInput[] = [];
  const invoices: Prisma.InvoiceCreateManyInput[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];
  const allocations: Prisma.PaymentAllocationCreateManyInput[] = [];
  for (let i = 0; i < SUBS; i++) {
    const id = `perfs${i}`;
    const qty = 1 + (i % 5);
    const amount = String(qty * 1000);
    const customerId = customers[i % CUSTOMERS].id;
    const status = i % 10 === 8 ? "PAUSED" : i % 10 === 9 ? "CLOSED" : "ACTIVE";
    subs.push({ id, organizationId: o, number: `PERF-${String(i).padStart(6, "0")}`, customerId, planId: plans[i % 4].id, ownerId: admin.id, status, startDate: addDays(today, -200), nextBillDate: status === "ACTIVE" ? addDays(today, 1 + (i % 28)) : null, paymentTermsDays: 15, subtotal: amount, taxTotal: String(qty * 180), total: String(qty * 1180) });
    lines.push({ subscriptionId: id, productId: product.id, description: "CRM seat", quantity: qty, unitPrice: "1000", lineSubtotal: amount, taxableAmount: amount, taxRate: "18", taxAmount: String(qty * 180), total: String(qty * 1180) });
    for (let k = 0; k < 3; k++) {
      const invId = `perfi${i}_${k}`;
      const issue = addDays(today, -30 * (2 - k) - (i % 28));
      const total = String(qty * 1180);
      const paid = k < 2;
      invoices.push({ id: invId, organizationId: o, number: `PINV-${i}-${k}`, customerId, subscriptionId: id, status: paid ? "PAID" : "CONFIRMED", currency: "INR", issueDate: issue, dueDate: addDays(issue, 15), subtotal: amount, discountTotal: "0", taxTotal: String(qty * 180), total, amountPaid: paid ? total : "0" });
      if (paid) {
        payments.push({ id: `perfp${i}_${k}`, organizationId: o, number: `PPAY-${i}-${k}`, customerId, method: "BANK_TRANSFER", amount: total, receivedOn: addDays(issue, 5), idempotencyKey: `perf-${i}-${k}`, recordedById: admin.id });
        allocations.push({ paymentId: `perfp${i}_${k}`, invoiceId: invId, amount: total });
      }
    }
  }
  await chunked(subs, (b) => db.subscription.createMany({ data: b }));
  await chunked(lines, (b) => db.subscriptionLine.createMany({ data: b }));
  await chunked(invoices, (b) => db.invoice.createMany({ data: b }));
  await chunked(payments, (b) => db.payment.createMany({ data: b }));
  await chunked(allocations, (b) => db.paymentAllocation.createMany({ data: b }));
  await db.$executeRaw`ANALYZE`;
  return o;
}

async function measure(name: string, fn: () => Promise<unknown>) {
  await fn();
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t = performance.now();
    await fn();
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  const pct = (p: number) => times[Math.min(times.length - 1, Math.ceil((p / 100) * times.length) - 1)];
  return { name, p50: pct(50), p95: pct(95), p99: pct(99) };
}

describe.skipIf(!process.env.PERF)("AT-11 performance profile", () => {
  it("keeps reporting, list and portal queries under 2 s at p95", { timeout: 30 * 60_000 }, async () => {
    if (process.env.PERF_RESET) await reset();
    let org = await db.organization.findFirst({ where: { legalName: ORG } });
    const t0 = performance.now();
    if (!org) org = await db.organization.findUniqueOrThrow({ where: { id: await seed() } });
    const seedMs = performance.now() - t0;
    const adminUser = await db.user.findFirstOrThrow({ where: { organizationId: org.id, role: "ADMIN" }, include: { organization: true } });
    const admin: CurrentUser = { ...adminUser, customerId: null, organization: adminUser.organization };
    const customer: CurrentUser = { ...admin, role: "CUSTOMER", permissions: [], customerId: "perfc7" };
    const plan = await db.plan.findFirstOrThrow({ where: { organizationId: org.id, interval: "MONTHLY" } });

    const { computeInsights, parseInsightFilters } = await import("@/server/reports/insights");
    const { listSubscriptions } = await import("@/server/sales/subscriptions");
    const { listInvoices } = await import("@/server/billing/invoices");
    const { mySubscriptions, myInvoices } = await import("@/server/portal");
    const { exportCsv } = await import("@/server/reports/exports");
    const { runDueCycles } = await import("@/server/billing/engine");
    const tz = org.timezone;
    const asAdmin = <T,>(fn: () => Promise<T>) => () => ((current = admin), fn());
    const asCustomer = <T,>(fn: () => Promise<T>) => () => ((current = customer), fn());

    const results = [
      await measure("Insights, default 6 months", asAdmin(() => computeInsights(admin, parseInsightFilters({}, tz)))),
      await measure("Insights, 12 months filtered by plan", asAdmin(() => computeInsights(admin, parseInsightFilters({ from: formatDateOnly(addDays(todayIn(tz), -365)), planId: plan.id }, tz)))),
      await measure("Subscriptions list, page 1", asAdmin(() => listSubscriptions("subscriptions", {}))),
      await measure("Subscriptions search by number", asAdmin(() => listSubscriptions("subscriptions", { q: "PERF-0099" }))),
      await measure("Invoices list, page 1", asAdmin(() => listInvoices({}))),
      await measure("Invoices search by customer", asAdmin(() => listInvoices({ q: "Customer 0042" }))),
      await measure("Portal subscriptions (33 records)", asCustomer(() => mySubscriptions())),
      await measure("Portal invoices (100 records)", asCustomer(() => myInvoices())),
    ];
    current = admin;
    const tExport = performance.now();
    await exportCsv("invoices", {});
    const exportMs = performance.now() - tExport;

    // One due-billing batch: 1,000 active subscriptions due today.
    const due = await db.subscription.findMany({ where: { organizationId: org.id, status: "ACTIVE", cycles: { none: {} } }, select: { id: true }, take: 1000 });
    await db.subscription.updateMany({ where: { id: { in: due.map((s) => s.id) } }, data: { nextBillDate: todayIn(tz) } });
    const tBill = performance.now();
    const run = await runDueCycles(db, { organizationId: org.id, now: new Date(), limit: 1000 });
    const billMs = performance.now() - tBill;

    const fmt = (ms: number) => `${ms.toFixed(0)} ms`;
    console.log(
      [
        `Profile: ${SUBS} subscriptions, ${CUSTOMERS} customers, ${SUBS * 3} invoices, ${SUBS * 2} payments${seedMs > 1000 ? ` (seeded in ${(seedMs / 1000).toFixed(1)} s)` : ""}`,
        "| Query | p50 | p95 | p99 |",
        "|---|---|---|---|",
        ...results.map((r) => `| ${r.name} | ${fmt(r.p50)} | ${fmt(r.p95)} | ${fmt(r.p99)} |`),
        `Invoice CSV export (6 months): ${fmt(exportMs)}`,
        `Due-billing batch: ${run.invoiced} invoiced, ${run.skipped} skipped, ${run.failed} failed in ${fmt(billMs)} (${due.length} due)`,
      ].join("\n"),
    );
    for (const r of results) expect(r.p95, r.name).toBeLessThan(2000);
    expect(run.failed).toBe(0);
    await db.$disconnect();
  });
});
