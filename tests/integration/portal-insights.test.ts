import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { CurrentUser } from "@/server/identity/session";
import { AppError } from "@/server/platform/errors";

let current: CurrentUser;

vi.mock("@/server/identity/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/identity/session")>();
  const { forbidden } = await import("@/server/platform/errors");
  return {
    ...original,
    requireUser: vi.fn(async () => current),
    requireStaff: vi.fn(async () => {
      if (current.role === "CUSTOMER") throw forbidden();
      return current;
    }),
  };
});

const { customerTransition } = await import("@/server/sales/subscriptions");
const { myInvoice, myInvoices, mySubscription, mySubscriptions } = await import("@/server/portal");
const { getInsights } = await import("@/server/reports/insights");
const { exportCsv } = await import("@/server/reports/exports");

const db = new PrismaClient();
const tag = `m5${Date.now()}`;
let orgId: string;
let admin: CurrentUser;
let sales: CurrentUser;
let portalA: CurrentUser;
let custA: string;
let custB: string;
let monthlyPlan: string;
let yearlyPlan: string;
let subA: string;
let subLocked: string;
let subB: string;
let quoteA: string;
let invA1: string;
let invB: string;
let seq = 0;

async function user(name: string, role: "ADMIN" | "STAFF" | "CUSTOMER", permissions: string[] = [], customerId?: string): Promise<CurrentUser> {
  const u = await db.user.create({ data: { organizationId: orgId, email: `${name}.${tag}@x.test`, name, role, permissions, passwordHash: "x" }, include: { organization: true } });
  if (customerId) await db.customer.update({ where: { id: customerId }, data: { portalUserId: u.id } });
  return { ...u, customerId: customerId ?? null, organization: u.organization };
}

async function sub(customerId: string, planId: string, status: "ACTIVE" | "QUOTATION", amount: string) {
  seq++;
  return (
    await db.subscription.create({
      data: { organizationId: orgId, number: `S-${tag}-${seq}`, customerId, planId, status, startDate: new Date("2026-01-01"), paymentTermsDays: 15, subtotal: amount, total: amount, nextBillDate: status === "ACTIVE" ? new Date("2026-11-01") : null },
    })
  ).id;
}

async function invoice(customerId: string, subscriptionId: string, total: string, issueDate: string, dueDate: string) {
  seq++;
  return (
    await db.invoice.create({
      data: { organizationId: orgId, number: `I-${tag}-${seq}`, customerId, subscriptionId, status: "CONFIRMED", currency: "INR", issueDate: new Date(issueDate), dueDate: new Date(dueDate), subtotal: total, discountTotal: "0", taxTotal: "0", total },
    })
  ).id;
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "OK";
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
}

beforeAll(async () => {
  orgId = (await db.organization.create({ data: { legalName: `Org ${tag}` } })).id;
  custA = (await db.customer.create({ data: { organizationId: orgId, businessName: "=Acme", contactName: "A", email: `a.${tag}@x.test` } })).id;
  custB = (await db.customer.create({ data: { organizationId: orgId, businessName: "Beta", contactName: "B", email: `b.${tag}@x.test` } })).id;
  const product = (await db.product.create({ data: { organizationId: orgId, name: `P ${tag}`, salePrice: "100" } })).id;
  monthlyPlan = (await db.plan.create({ data: { organizationId: orgId, productId: product, name: "Monthly", interval: "MONTHLY", price: "1000", allowPause: true, allowEarlyClose: true, customerSelfService: true } })).id;
  yearlyPlan = (await db.plan.create({ data: { organizationId: orgId, productId: product, name: "Yearly", interval: "YEARLY", price: "12000", allowPause: true } })).id;
  subA = await sub(custA, monthlyPlan, "ACTIVE", "1000");
  subLocked = await sub(custA, yearlyPlan, "ACTIVE", "12000");
  subB = await sub(custB, monthlyPlan, "ACTIVE", "1000");
  quoteA = await sub(custA, monthlyPlan, "QUOTATION", "1000");
  invA1 = await invoice(custA, subA, "1000.00", "2026-09-01", "2026-09-16");
  await invoice(custA, subLocked, "12000.00", "2026-10-01", "2099-01-01");
  invB = await invoice(custB, subB, "1000.00", "2026-10-01", "2099-01-01");
  await db.invoice.update({ where: { id: invB }, data: { amountPaid: "400" } });
  await db.payment.create({
    data: { organizationId: orgId, number: `PAY-${tag}`, customerId: custB, method: "UPI", amount: "500", receivedOn: new Date("2026-10-05"), idempotencyKey: tag, recordedById: "x", allocations: { create: [{ invoiceId: invB, amount: "400" }] } },
  });
  admin = await user("admin", "ADMIN");
  sales = await user("sales", "STAFF");
  portalA = await user("portal", "CUSTOMER", [], custA);
});

afterAll(async () => {
  const org = { organizationId: orgId };
  await db.paymentAllocation.deleteMany({ where: { payment: org } });
  await db.payment.deleteMany({ where: org });
  await db.invoice.deleteMany({ where: org });
  await db.subscriptionLine.deleteMany({ where: { subscription: org } });
  await db.subscription.updateMany({ where: org, data: { renewedFromId: null } });
  await db.subscription.deleteMany({ where: org });
  await db.plan.deleteMany({ where: org });
  await db.product.deleteMany({ where: org });
  await db.auditEvent.deleteMany({ where: org });
  await db.customer.updateMany({ where: org, data: { portalUserId: null } });
  await db.customer.deleteMany({ where: org });
  await db.user.deleteMany({ where: org });
  await db.organization.delete({ where: { id: orgId } });
  await db.$disconnect();
});

describe("customer portal (PORT-01/02, AT-10)", () => {
  it("shows only the customer's own records", async () => {
    current = portalA;
    const subs = await mySubscriptions();
    expect(subs.map((s) => s.id).sort()).toEqual([subA, subLocked, quoteA].sort());
    expect(await code(mySubscription(subB))).toBe("NOT_FOUND");
    expect(await code(myInvoice(invB))).toBe("NOT_FOUND");
    const billing = await myInvoices();
    expect(billing.invoices).toHaveLength(2);
    expect([billing.balance, billing.overdue, billing.overdueCount]).toEqual(["13000", "1000", 1]);
    expect((await myInvoice(invA1)).state).toBe("Overdue");
  });

  it("allows only plan-permitted self-service actions", async () => {
    current = portalA;
    expect((await mySubscription(subA)).actions).toEqual(["pause", "close"]);
    expect((await mySubscription(subLocked)).actions).toEqual([]);
    expect(await code(customerTransition(subLocked, "pause"))).toBe("FORBIDDEN");
    expect(await code(customerTransition(subA, "activate"))).toBe("FORBIDDEN");
    expect(await code(customerTransition(subB, "pause"))).toBe("NOT_FOUND");
    expect((await customerTransition(subA, "pause")).status).toBe("PAUSED");
    expect((await customerTransition(quoteA, "confirm")).status).toBe("CONFIRMED");
    current = admin;
    expect(await code(customerTransition(subA, "resume"))).toBe("FORBIDDEN");
  });
});

describe("insights (REP-01/02/04)", () => {
  it("reconciles totals and per-plan rows", async () => {
    current = admin;
    const r = await getInsights({ from: "2026-09-01", to: "2026-10-31" });
    expect([r.billed, r.collected, r.outstanding, r.overdue, r.overdueCount]).toEqual(["14000.00", "500.00", "13600.00", "1000.00", 1]);
    expect(r.subscriptions).toBe(2);
    expect([r.mrr, r.arr]).toEqual(["2000.00", "24000.00"]);
    const sumOf = (k: "billed" | "collected" | "outstanding") => r.byPlan.reduce((s, x) => s + Number(x[k]), 0).toFixed(2);
    expect([sumOf("billed"), sumOf("collected"), sumOf("outstanding")]).toEqual([r.billed, r.collected, r.outstanding]);
    expect(r.trend.map((t) => t.month)).toEqual(["2026-09", "2026-10"]);
  });

  it("applies plan and customer filters", async () => {
    current = admin;
    const byPlan = await getInsights({ from: "2026-09-01", to: "2026-10-31", planId: yearlyPlan });
    expect([byPlan.billed, byPlan.collected, byPlan.mrr, byPlan.subscriptions]).toEqual(["12000.00", "0.00", "1000.00", 1]);
    const byCustomer = await getInsights({ from: "2026-09-01", to: "2026-10-31", customerId: custB });
    expect([byCustomer.billed, byCustomer.collected, byCustomer.outstanding]).toEqual(["1000.00", "500.00", "600.00"]);
    expect(await code(getInsights({ from: "2026-12-01", to: "2026-01-01" }))).toBe("VALIDATION_FAILED");
  });

  it("requires reports.view", async () => {
    current = sales;
    expect(await code(getInsights({}))).toBe("FORBIDDEN");
    current = portalA;
    expect(await code(getInsights({}))).toBe("FORBIDDEN");
  });
});

describe("CSV exports (REP-03)", () => {
  it("escapes formulas, stays in the organization, and is audit-logged", async () => {
    current = admin;
    const { csv, filename } = await exportCsv("invoices", { from: "2026-09-01", to: "2026-10-31" });
    expect(filename).toBe("recurivo-invoices-2026-09-01_2026-10-31.csv");
    expect(csv.split("\r\n")).toHaveLength(5);
    expect(csv).toContain("'=Acme");
    expect(csv).not.toMatch(/,=Acme/);
    const logged = await db.auditEvent.findFirst({ where: { organizationId: orgId, action: "report.exported", objectId: "invoices" } });
    expect(logged?.summary).toContain("3 rows");
    expect((await exportCsv("revenue-by-plan", { from: "2026-09-01", to: "2026-10-31" })).csv).toContain("Total,2,2000.00,14000.00,500.00,13600.00");
    expect((await exportCsv("audit", {})).csv).toContain("report.exported");
  });

  it("rejects unauthorized and unknown exports", async () => {
    current = sales;
    expect(await code(exportCsv("payments", {}))).toBe("FORBIDDEN");
    current = { ...sales, permissions: ["reports.view"] };
    expect(await code(exportCsv("audit", {}))).toBe("FORBIDDEN");
    expect(await code(exportCsv("users", {}))).toBe("NOT_FOUND");
    current = portalA;
    expect(await code(exportCsv("invoices", {}))).toBe("FORBIDDEN");
  });
});
