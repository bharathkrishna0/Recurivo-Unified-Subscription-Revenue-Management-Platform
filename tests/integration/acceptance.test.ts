import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { CurrentUser } from "@/server/identity/session";
import { AppError } from "@/server/platform/errors";
import { formatDateOnly, todayIn } from "@/lib/dates";

let current: CurrentUser;

vi.mock("@/server/identity/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/identity/session")>();
  return { ...original, requireUser: vi.fn(async () => current), requireStaff: vi.fn(async () => current) };
});

const { registerCustomer } = await import("@/server/identity/service");
const { createQuotation, previewQuotation, transitionSubscription } = await import("@/server/sales/subscriptions");
const { runDueCycles } = await import("@/server/billing/engine");

const db = new PrismaClient();
const tag = `at${Date.now()}`;
let orgId: string;
let customerId: string;
let crmId: string;
let odooId: string;
let planId: string;

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
  const u = await db.user.create({ data: { organizationId: orgId, email: `admin.${tag}@x.test`, name: "Admin", role: "ADMIN", passwordHash: "x" }, include: { organization: true } });
  current = { ...u, customerId: null, organization: u.organization };
  customerId = (await db.customer.create({ data: { organizationId: orgId, businessName: "Acme", contactName: "A", email: `acme.${tag}@x.test` } })).id;
  crmId = (await db.product.create({ data: { organizationId: orgId, name: "CRM", salePrice: "2000" } })).id;
  odooId = (await db.productVariant.create({ data: { productId: crmId, attribute: "Brand", value: "Odoo", adjustmentType: "FIXED", adjustmentValue: "560" } })).id;
  planId = (await db.plan.create({ data: { organizationId: orgId, productId: crmId, name: "CRM Monthly", interval: "MONTHLY", price: "2000" } })).id;
  await db.taxRule.create({ data: { organizationId: orgId, name: "GST", rate: "18", effectiveFrom: new Date("2020-01-01") } });
});

afterAll(async () => {
  const users = await db.user.findMany({ where: { email: `dup.${tag}@x.test` }, select: { id: true } });
  const ids = users.map((u) => u.id);
  const custs = await db.customer.findMany({ where: { portalUserId: { in: ids } }, select: { id: true } });
  await db.auditEvent.deleteMany({ where: { objectId: { in: custs.map((c) => c.id) } } });
  await db.customer.deleteMany({ where: { id: { in: custs.map((c) => c.id) } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  const org = { organizationId: orgId };
  const invoices = await db.invoice.findMany({ where: org, select: { id: true } });
  await db.outboxEvent.deleteMany({ where: { dedupeKey: { in: invoices.map((i) => `invoice-send:${i.id}:1`) } } });
  await db.outboxEvent.deleteMany({ where: { payload: { path: ["to"], equals: `acme.${tag}@x.test` } } });
  await db.invoiceLine.deleteMany({ where: { invoice: org } });
  await db.invoice.deleteMany({ where: org });
  await db.billingCycle.deleteMany({ where: { subscription: org } });
  await db.billingException.deleteMany({ where: org });
  await db.auditEvent.deleteMany({ where: org });
  await db.subscriptionLine.deleteMany({ where: { subscription: org } });
  await db.subscription.deleteMany({ where: org });
  await db.taxRule.deleteMany({ where: org });
  await db.plan.deleteMany({ where: org });
  await db.productVariant.deleteMany({ where: { productId: crmId } });
  await db.product.deleteMany({ where: org });
  await db.customer.deleteMany({ where: org });
  await db.user.deleteMany({ where: org });
  await db.sequence.deleteMany({ where: org });
  await db.organization.delete({ where: { id: orgId } });
  await db.$disconnect();
});

describe("release acceptance scenarios", () => {
  it("AT-01: concurrent sign-ups with the same email in different case create exactly one account", async () => {
    const attempt = (email: string, n: number) =>
      code(registerCustomer({ name: "Dup", businessName: "Dup", email, password: "Correct-horse-9", confirmPassword: "Correct-horse-9", acceptTerms: "on" }, `10.9.${n}.1`));
    const results = await Promise.all([`dup.${tag}@x.test`, `DUP.${tag}@X.TEST`, `Dup.${tag}@x.Test`].map(attempt));
    expect(results.filter((r) => r === "OK")).toHaveLength(1);
    expect(results.filter((r) => r !== "OK").every((r) => r === "CONFLICT")).toBe(true);
    expect(await db.user.count({ where: { email: { equals: `dup.${tag}@x.test`, mode: "insensitive" } } })).toBe(1);
  });

  it("AT-03: the Odoo +560 surcharge in the preview is exactly what the invoice bills", async () => {
    const input = { customerId, planId, startDate: formatDateOnly(todayIn(current.organization.timezone)), lines: [{ productId: crmId, variantId: odooId, quantity: 3 }] };
    const preview = await previewQuotation(input);
    const { id } = await createQuotation(input);
    for (const step of ["send", "confirm", "activate"] as const) await transitionSubscription(id, step);
    await runDueCycles(db, { organizationId: orgId, now: new Date() });
    const invoice = await db.invoice.findFirstOrThrow({ where: { subscriptionId: id }, include: { lines: true } });
    expect(invoice.lines[0].unitPrice.toString()).toBe("2560");
    expect(invoice.lines[0].variantId).toBe(odooId);
    expect(invoice.total.toFixed(2)).toBe(Number(preview.totals.total).toFixed(2));
    expect(invoice.total.toFixed(2)).toBe("9062.40");
    expect(await db.auditEvent.count({ where: { organizationId: orgId, objectId: invoice.id } })).toBeGreaterThan(0);
  });
});
