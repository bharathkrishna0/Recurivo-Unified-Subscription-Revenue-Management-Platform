import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { processOutboxBatch } from "@/worker/outbox";

const db = new PrismaClient();
let orgId: string;
let subscriptionId: string;
let customerId: string;
const tag = `t${Date.now()}`;

beforeAll(async () => {
  const org = await db.organization.create({ data: { legalName: `Test ${tag}` } });
  orgId = org.id;
  const customer = await db.customer.create({ data: { organizationId: orgId, businessName: "Test Co", contactName: "T", email: `${tag}@x.test` } });
  customerId = customer.id;
  const product = await db.product.create({ data: { organizationId: orgId, name: "Seat", salePrice: "100" } });
  const plan = await db.plan.create({ data: { organizationId: orgId, productId: product.id, name: "Monthly", interval: "MONTHLY", price: "100" } });
  const sub = await db.subscription.create({
    data: { organizationId: orgId, number: `SUB-${tag}`, customerId, planId: plan.id, startDate: new Date("2026-01-31"), paymentTermsDays: 15, status: "ACTIVE" },
  });
  subscriptionId = sub.id;
});

afterAll(async () => {
  await db.invoice.deleteMany({ where: { organizationId: orgId } });
  await db.billingCycle.deleteMany({ where: { subscriptionId } });
  await db.subscription.deleteMany({ where: { organizationId: orgId } });
  await db.plan.deleteMany({ where: { organizationId: orgId } });
  await db.product.deleteMany({ where: { organizationId: orgId } });
  await db.customer.deleteMany({ where: { organizationId: orgId } });
  await db.organization.delete({ where: { id: orgId } });
  await db.outboxEvent.deleteMany({ where: { dedupeKey: { startsWith: tag } } });
  await db.$disconnect();
});

const invoiceData = (cycleId: string, n: string, status: "CONFIRMED" | "CANCELLED" = "CONFIRMED") => ({
  organizationId: orgId,
  number: `INV-${tag}-${n}`,
  customerId,
  subscriptionId,
  cycleId,
  status,
  currency: "INR",
  issueDate: new Date("2026-01-31"),
  dueDate: new Date("2026-02-15"),
  subtotal: "100",
  discountTotal: "0",
  taxTotal: "0",
  total: "100",
});

describe("database billing guarantees", () => {
  it("rejects a second billing cycle for the same period", async () => {
    const period = { subscriptionId, periodStart: new Date("2026-01-31"), periodEnd: new Date("2026-02-27"), revision: 1, status: "INVOICED" as const };
    await db.billingCycle.create({ data: period });
    await expect(db.billingCycle.create({ data: period })).rejects.toMatchObject({ code: "P2002" });
  });

  it("concurrent cycle inserts produce exactly one row", async () => {
    const period = { subscriptionId, periodStart: new Date("2026-02-28"), periodEnd: new Date("2026-03-30"), revision: 1, status: "INVOICED" as const };
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => db.billingCycle.create({ data: period })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.billingCycle.count({ where: { subscriptionId, periodStart: period.periodStart } })).toBe(1);
  });

  it("allows only one non-cancelled invoice per cycle", async () => {
    const cycle = await db.billingCycle.findFirstOrThrow({ where: { subscriptionId, periodStart: new Date("2026-01-31") } });
    await db.invoice.create({ data: invoiceData(cycle.id, "1") });
    await expect(db.invoice.create({ data: invoiceData(cycle.id, "2") })).rejects.toBeTruthy();
    await db.invoice.update({ where: { organizationId_number: { organizationId: orgId, number: `INV-${tag}-1` } }, data: { status: "CANCELLED" } });
    await expect(db.invoice.create({ data: invoiceData(cycle.id, "3") })).resolves.toBeTruthy();
  });

  it("rejects overpaid invoices and negative prices at the database layer", async () => {
    const cycle = await db.billingCycle.findFirstOrThrow({ where: { subscriptionId, periodStart: new Date("2026-02-28") } });
    await expect(db.invoice.create({ data: { ...invoiceData(cycle.id, "4"), amountPaid: "150" } })).rejects.toBeTruthy();
    await expect(db.product.create({ data: { organizationId: orgId, name: "Bad", salePrice: "-1" } })).rejects.toBeTruthy();
  });
});

describe("outbox worker", () => {
  it("delivers each pending event exactly once across concurrent workers", async () => {
    await db.outboxEvent.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        type: "email.send",
        dedupeKey: `${tag}-mail-${i}`,
        payload: { to: `${tag}-${i}@x.test`, subject: `Test ${tag}`, text: "hello" },
      })),
    });
    const before = await db.sandboxEmail.count({ where: { subject: `Test ${tag}` } });
    await Promise.all([processOutboxBatch(db), processOutboxBatch(db), processOutboxBatch(db)]);
    const after = await db.sandboxEmail.count({ where: { subject: `Test ${tag}` } });
    expect(after - before).toBe(5);
    expect(await db.outboxEvent.count({ where: { dedupeKey: { startsWith: tag }, status: "DONE" } })).toBe(5);
    await db.sandboxEmail.deleteMany({ where: { subject: `Test ${tag}` } });
  });

  it("backs off and records the error for unknown event types", async () => {
    await db.outboxEvent.create({ data: { type: "unknown.type", dedupeKey: `${tag}-bad`, payload: {} } });
    await processOutboxBatch(db);
    const row = await db.outboxEvent.findUniqueOrThrow({ where: { dedupeKey: `${tag}-bad` } });
    expect(row.status).toBe("PENDING");
    expect(row.lastError).toContain("No handler");
    expect(row.availableAt.getTime()).toBeGreaterThan(Date.now());
  });
});
