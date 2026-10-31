import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { CurrentUser } from "@/server/identity/session";
import { AppError } from "@/server/platform/errors";
import { formatDateOnly, todayIn } from "@/lib/dates";

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

const { createQuotation, getSubscription, listSubscriptions, transitionSubscription, updateQuotation } = await import("@/server/sales/subscriptions");

const db = new PrismaClient();
const tag = `m3${Date.now()}`;
let orgId: string;
let admin: CurrentUser;
let sales: CurrentUser;
let customerId: string;
let planId: string;
let strictPlanId: string;
let crmId: string;
let supportId: string;
let odooId: string;
let discountId: string;
const today = formatDateOnly(todayIn("Asia/Kolkata"));

async function asUser(email: string, role: "ADMIN" | "STAFF", permissions: string[]): Promise<CurrentUser> {
  const user = await db.user.create({
    data: { organizationId: orgId, email: `${email}.${tag}@x.test`, name: email, role, permissions, passwordHash: "x" },
    include: { organization: true },
  });
  return { ...user, customerId: null, organization: user.organization };
}

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "OK";
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
}

const quote = (patch: Record<string, unknown> = {}) => ({
  customerId,
  planId,
  startDate: today,
  lines: [
    { productId: crmId, variantId: odooId, quantity: 5 },
    { productId: supportId, quantity: 1 },
  ],
  ...patch,
});

beforeAll(async () => {
  orgId = (await db.organization.create({ data: { legalName: `Org ${tag}` } })).id;
  admin = await asUser("admin", "ADMIN", []);
  sales = await asUser("sales", "STAFF", []);
  customerId = (await db.customer.create({ data: { organizationId: orgId, businessName: "Acme", contactName: "A", email: `acme.${tag}@x.test` } })).id;
  const crm = await db.product.create({ data: { organizationId: orgId, name: "CRM", salePrice: "2000" } });
  crmId = crm.id;
  odooId = (await db.productVariant.create({ data: { productId: crm.id, attribute: "Brand", value: "Odoo", adjustmentType: "FIXED", adjustmentValue: "560" } })).id;
  supportId = (await db.product.create({ data: { organizationId: orgId, name: "Support", salePrice: "1500" } })).id;
  planId = (await db.plan.create({ data: { organizationId: orgId, productId: crm.id, name: "CRM Monthly", interval: "MONTHLY", price: "2000", minQuantity: 2, allowPause: true } })).id;
  strictPlanId = (await db.plan.create({ data: { organizationId: orgId, productId: crm.id, name: "CRM Strict", interval: "MONTHLY", price: "2000", termLength: 12, allowPause: false, allowEarlyClose: false } })).id;
  await db.taxRule.create({ data: { organizationId: orgId, name: "GST", rate: "18", effectiveFrom: new Date("2020-01-01") } });
  discountId = (await db.discountRule.create({ data: { organizationId: orgId, name: "10%", type: "PERCENT", value: "10", scope: "SUBSCRIPTION", startsAt: new Date("2020-01-01"), createdById: admin.id } })).id;
});

beforeEach(() => {
  current = admin;
});

afterAll(async () => {
  await db.auditEvent.deleteMany({ where: { organizationId: orgId } });
  await db.outboxEvent.deleteMany({ where: { dedupeKey: { startsWith: "quote-sent:" }, payload: { path: ["to"], equals: `acme.${tag}@x.test` } } });
  await db.subscription.updateMany({ where: { organizationId: orgId }, data: { renewedFromId: null } });
  await db.subscriptionLine.deleteMany({ where: { subscription: { organizationId: orgId } } });
  await db.subscription.deleteMany({ where: { organizationId: orgId } });
  await db.discountRule.deleteMany({ where: { organizationId: orgId } });
  await db.taxRule.deleteMany({ where: { organizationId: orgId } });
  await db.plan.deleteMany({ where: { organizationId: orgId } });
  await db.productVariant.deleteMany({ where: { product: { organizationId: orgId } } });
  await db.product.deleteMany({ where: { organizationId: orgId } });
  await db.customer.deleteMany({ where: { organizationId: orgId } });
  await db.user.deleteMany({ where: { organizationId: orgId } });
  await db.sequence.deleteMany({ where: { organizationId: orgId } });
  await db.organization.deleteMany({ where: { id: orgId } });
  await db.$disconnect();
});

describe("quotation pricing", () => {
  it("prices lines on the server and numbers quotations sequentially", async () => {
    const a = await createQuotation(quote({ lines: [{ productId: crmId, variantId: odooId, quantity: 5, unitPrice: "1" }, { productId: supportId, quantity: 1 }] }));
    const b = await createQuotation(quote());
    expect(Number(b.number.slice(4))).toBe(Number(a.number.slice(4)) + 1);
    const s = await getSubscription(a.id);
    expect(s.lines.map((l) => l.unitPrice.toString())).toEqual(["2560", "1500"]);
    expect(s.subtotal.toString()).toBe("14300");
    expect(s.taxTotal.toString()).toBe("2574");
    expect(s.total.toString()).toBe("16874");
  });

  it("applies an eligible discount and rejects quantities below the plan minimum", async () => {
    const { id } = await createQuotation(quote({ discountRuleId: discountId }));
    expect((await getSubscription(id)).total.toString()).toBe("15186.6");
    expect(await code(createQuotation(quote({ lines: [{ productId: crmId, quantity: 1 }] })))).toBe("VALIDATION_FAILED");
  });

  it("uses the plan term for the end date", async () => {
    const { id } = await createQuotation(quote({ planId: strictPlanId, startDate: "2026-01-31" }));
    expect(formatDateOnly((await getSubscription(id)).endDate!)).toBe("2027-01-30");
  });
});

describe("lifecycle", () => {
  it("goes draft → quotation → confirmed → active and records each step", async () => {
    const { id } = await createQuotation(quote());
    expect(await code(transitionSubscription(id, "activate"))).toBe("INVALID_TRANSITION");
    await transitionSubscription(id, "send");
    const sent = await getSubscription(id);
    expect(sent.quoteValidUntil).not.toBeNull();
    expect(await db.outboxEvent.count({ where: { dedupeKey: `quote-sent:${id}:1` } })).toBe(1);
    await transitionSubscription(id, "confirm");
    await transitionSubscription(id, "activate");
    const active = await getSubscription(id);
    expect(active.status).toBe("ACTIVE");
    expect(formatDateOnly(active.nextBillDate!)).toBe(today);
    expect(active.activity.map((e) => e.action)).toEqual(["subscription.activate", "subscription.confirm", "subscription.send", "subscription.drafted"]);
  });

  it("rejects a stale or concurrent duplicate activation", async () => {
    const { id } = await createQuotation(quote());
    await transitionSubscription(id, "send");
    await transitionSubscription(id, "confirm");
    const { version } = await getSubscription(id);
    const results = await Promise.all([1, 2, 3].map(() => code(transitionSubscription(id, "activate", { expectedVersion: version }))));
    expect(results.filter((r) => r === "OK")).toHaveLength(1);
    expect(await db.auditEvent.count({ where: { objectId: id, action: "subscription.activate" } })).toBe(1);
  });

  it("enforces plan policy and requires a reason to close", async () => {
    const { id } = await createQuotation(quote({ planId: strictPlanId }));
    for (const a of ["send", "confirm", "activate"] as const) await transitionSubscription(id, a);
    expect(await code(transitionSubscription(id, "pause"))).toBe("INVALID_TRANSITION");
    expect(await code(transitionSubscription(id, "close", { reason: "Customer left" }))).toBe("INVALID_TRANSITION");
    const { renewalId } = await transitionSubscription(id, "renew");
    const renewal = await getSubscription(renewalId!);
    expect(renewal.status).toBe("DRAFT");
    expect(renewal.renewedFrom?.id).toBe(id);
    expect(await code(transitionSubscription(id, "renew"))).toBe("INVALID_TRANSITION");
  });

  it("revises a sent quotation back to draft", async () => {
    const { id } = await createQuotation(quote());
    await transitionSubscription(id, "send");
    await updateQuotation(id, quote({ lines: [{ productId: crmId, quantity: 3 }] }));
    const s = await getSubscription(id);
    expect([s.status, s.revision, s.quoteValidUntil]).toEqual(["DRAFT", 2, null]);
    expect(await code(transitionSubscription(id, "cancel", { reason: "" }))).toBe("VALIDATION_FAILED");
    await transitionSubscription(id, "cancel", { reason: "Lost to competitor" });
    expect((await getSubscription(id)).status).toBe("CLOSED");
  });
});

describe("visibility", () => {
  it("limits staff without subscriptions.all to their own records", async () => {
    const { id } = await createQuotation(quote());
    current = sales;
    const own = await createQuotation(quote());
    expect(await code(getSubscription(id))).toBe("NOT_FOUND");
    expect(await code(transitionSubscription(id, "send"))).toBe("NOT_FOUND");
    const list = await listSubscriptions("quotations", {});
    expect(list.rows.map((r) => r.id)).toEqual([own.id]);
  });
});
