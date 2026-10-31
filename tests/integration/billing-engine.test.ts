import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { runDueCycles } from "@/server/billing/engine";
import { processOutboxBatch } from "@/worker/outbox";

const db = new PrismaClient();
const tag = `m4e${Date.now()}`;
let orgId: string;
let customerId: string;
let crmId: string;
let planId: string;
let discountId: string;

async function activeSub(opts: { start: string; end?: string; qty?: number; discount?: boolean; plan?: string }) {
  const n = crypto.randomUUID().slice(0, 8);
  const qty = opts.qty ?? 2;
  const sub = await db.subscription.create({
    data: {
      organizationId: orgId,
      number: `${tag}-${n}`,
      customerId,
      planId: opts.plan ?? planId,
      status: "ACTIVE",
      startDate: new Date(opts.start),
      endDate: opts.end ? new Date(opts.end) : null,
      nextBillDate: new Date(opts.start),
      paymentTermsDays: 15,
      discountRuleId: opts.discount ? discountId : null,
      lines: { create: [{ productId: crmId, description: "CRM", quantity: qty, unitPrice: "1000", lineSubtotal: String(qty * 1000), taxableAmount: String(qty * 1000), total: String(qty * 1000) }] },
    },
  });
  return sub.id;
}

const invoicesOf = (subscriptionId: string) => db.invoice.findMany({ where: { subscriptionId }, orderBy: { periodStart: "asc" }, include: { lines: true } });

beforeAll(async () => {
  orgId = (await db.organization.create({ data: { legalName: `Org ${tag}`, timezone: "UTC" } })).id;
  customerId = (await db.customer.create({ data: { organizationId: orgId, businessName: "Acme", contactName: "A", email: `acme.${tag}@x.test` } })).id;
  crmId = (await db.product.create({ data: { organizationId: orgId, name: "CRM", salePrice: "1000" } })).id;
  planId = (await db.plan.create({ data: { organizationId: orgId, productId: crmId, name: "Monthly", interval: "MONTHLY", price: "1000" } })).id;
  await db.taxRule.create({ data: { organizationId: orgId, name: "GST", rate: "18", effectiveFrom: new Date("2020-01-01") } });
  const admin = await db.user.create({ data: { organizationId: orgId, email: `a.${tag}@x.test`, name: "A", role: "ADMIN", passwordHash: "x" } });
  discountId = (await db.discountRule.create({ data: { organizationId: orgId, name: "10%", type: "PERCENT", value: "10", scope: "SUBSCRIPTION", startsAt: new Date("2020-01-01"), usageLimit: 2, createdById: admin.id } })).id;
});

afterAll(async () => {
  const subs = { organizationId: orgId };
  await db.outboxEvent.deleteMany({ where: { type: "invoice.send", payload: { path: ["invoiceId"], string_starts_with: "" }, dedupeKey: { in: (await db.invoice.findMany({ where: subs, select: { id: true } })).map((i) => `invoice-send:${i.id}:1`) } } });
  await db.discountRedemption.deleteMany({ where: { invoice: subs } });
  await db.invoice.deleteMany({ where: subs });
  await db.billingCycle.deleteMany({ where: { subscription: subs } });
  await db.billingException.deleteMany({ where: subs });
  await db.auditEvent.deleteMany({ where: subs });
  await db.subscriptionLine.deleteMany({ where: { subscription: subs } });
  await db.subscription.deleteMany({ where: subs });
  await db.discountRule.deleteMany({ where: subs });
  await db.taxRule.deleteMany({ where: subs });
  await db.plan.deleteMany({ where: subs });
  await db.product.deleteMany({ where: subs });
  await db.customer.deleteMany({ where: subs });
  await db.user.deleteMany({ where: subs });
  await db.sequence.deleteMany({ where: subs });
  await db.organization.delete({ where: { id: orgId } });
  await db.$disconnect();
});

describe("billing engine", () => {
  it("invoices each due period once, catching up missed periods on the anchor day", async () => {
    const id = await activeSub({ start: "2026-01-31" });
    const run = await runDueCycles(db, { organizationId: orgId, now: new Date("2026-03-31T12:00:00Z") });
    expect(run.invoiced).toBe(3);
    const inv = await invoicesOf(id);
    expect(inv.map((i) => [i.periodStart!.toISOString().slice(0, 10), i.periodEnd!.toISOString().slice(0, 10)])).toEqual([
      ["2026-01-31", "2026-02-27"],
      ["2026-02-28", "2026-03-30"],
      ["2026-03-31", "2026-04-29"],
    ]);
    expect(inv[0].total.toString()).toBe("2360");
    expect(inv[0].status).toBe("CONFIRMED");
    expect((await runDueCycles(db, { organizationId: orgId, now: new Date("2026-03-31T12:00:00Z") })).invoiced).toBe(0);
    expect((await db.subscription.findUniqueOrThrow({ where: { id } })).nextBillDate!.toISOString().slice(0, 10)).toBe("2026-04-30");
  });

  it("lets only one of several concurrent workers bill a period (AT-05)", async () => {
    const id = await activeSub({ start: "2026-05-01" });
    const now = new Date("2026-05-01T08:00:00Z");
    await Promise.all([1, 2, 3, 4].map(() => runDueCycles(db, { organizationId: orgId, now })));
    expect(await db.invoice.count({ where: { subscriptionId: id } })).toBe(1);
    expect(await db.billingCycle.count({ where: { subscriptionId: id } })).toBe(1);
  });

  it("observes an existing cycle after a crash instead of billing again (AT-06)", async () => {
    const id = await activeSub({ start: "2026-06-01" });
    const now = new Date("2026-06-01T08:00:00Z");
    await runDueCycles(db, { organizationId: orgId, now });
    // Simulate a lost schedule update: the period is already billed but the subscription points back at it.
    await db.subscription.update({ where: { id }, data: { nextBillDate: new Date("2026-06-01") } });
    const rerun = await runDueCycles(db, { organizationId: orgId, now });
    expect(rerun.skipped).toBe(1);
    expect(await db.invoice.count({ where: { subscriptionId: id } })).toBe(1);
  });

  it("keeps posted invoices when the contract is re-rated later (SUB-04)", async () => {
    const id = await activeSub({ start: "2026-07-01" });
    await runDueCycles(db, { organizationId: orgId, now: new Date("2026-07-01T08:00:00Z") });
    await db.subscriptionLine.updateMany({ where: { subscriptionId: id }, data: { unitPrice: "1500" } });
    await runDueCycles(db, { organizationId: orgId, now: new Date("2026-08-01T08:00:00Z") });
    const inv = await invoicesOf(id);
    expect(inv.map((i) => i.lines[0].unitPrice.toString())).toEqual(["1000", "1500"]);
  });

  it("never redeems a discount beyond its usage limit, even concurrently (AT-07)", async () => {
    const ids = await Promise.all([1, 2, 3, 4].map(() => activeSub({ start: "2026-09-01", discount: true })));
    const now = new Date("2026-09-01T08:00:00Z");
    await Promise.all([1, 2, 3].map(() => runDueCycles(db, { organizationId: orgId, now })));
    const invoices = await db.invoice.findMany({ where: { subscriptionId: { in: ids } } });
    expect(invoices).toHaveLength(4);
    expect(invoices.filter((i) => Number(i.discountTotal) > 0)).toHaveLength(2);
    expect((await db.discountRule.findUniqueOrThrow({ where: { id: discountId } })).usageCount).toBe(2);
    expect(await db.discountRedemption.count({ where: { discountRuleId: discountId } })).toBe(2);
  });

  it("closes a fixed-term subscription after its last period", async () => {
    const id = await activeSub({ start: "2026-10-01", end: "2026-11-30" });
    const run = await runDueCycles(db, { organizationId: orgId, now: new Date("2026-12-05T08:00:00Z") });
    expect(run.invoiced).toBeGreaterThanOrEqual(2);
    const sub = await db.subscription.findUniqueOrThrow({ where: { id } });
    expect([sub.status, sub.nextBillDate]).toEqual(["CLOSED", null]);
    expect(await db.invoice.count({ where: { subscriptionId: id } })).toBe(2);
  });

  it("emails a PDF through the outbox and records delivery", async () => {
    const id = await activeSub({ start: "2026-12-10" });
    await runDueCycles(db, { organizationId: orgId, now: new Date("2026-12-10T08:00:00Z") });
    const [inv] = await invoicesOf(id);
    expect(inv.deliveryStatus).toBe("QUEUED");
    for (let i = 0; i < 20 && (await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).deliveryStatus === "QUEUED"; i++) {
      await db.outboxEvent.updateMany({ where: { status: "PENDING" }, data: { availableAt: new Date(0) } });
      await processOutboxBatch(db, 200);
    }
    const sent = await db.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(sent.deliveryStatus).toBe("SENT");
    expect(await db.sandboxEmail.count({ where: { to: `acme.${tag}@x.test`, subject: { contains: inv.number } } })).toBe(1);
  });
});
