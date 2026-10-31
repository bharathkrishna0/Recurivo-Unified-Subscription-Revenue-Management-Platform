import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
    createSession: vi.fn(async () => undefined),
    revokeAllSessions: vi.fn(async () => undefined),
  };
});

const { addVariant, createProduct, getProduct } = await import("@/server/catalog/products");
const { createPlan, getPlan, updatePlan } = await import("@/server/catalog/plans");
const { saveTaxRule } = await import("@/server/settings/taxes");
const { createDiscountRule } = await import("@/server/settings/discounts");
const { acceptInvitation, inviteStaff, updateStaffPermissions } = await import("@/server/identity/team");

const db = new PrismaClient();
const tag = `m2${Date.now()}`;
let orgId: string;
let otherOrgId: string;
let admin: CurrentUser;
let sales: CurrentUser;
let catalogStaff: CurrentUser;

async function asUser(email: string, role: "ADMIN" | "STAFF", permissions: string[], organizationId = orgId): Promise<CurrentUser> {
  const user = await db.user.create({
    data: { organizationId, email: `${email}.${tag}@x.test`, name: email, role, permissions, passwordHash: "x" },
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

const productInput = { name: "CRM Suite", type: "SERVICE", salePrice: "2000", costPrice: "800", notes: "" };
const planInput = (productId: string) => ({
  productId,
  name: "CRM Monthly",
  interval: "MONTHLY",
  price: "2000",
  minQuantity: "1",
  termLength: "",
  availableFrom: "",
  availableUntil: "",
  allowPause: true,
  allowEarlyClose: false,
  allowRenewal: true,
  autoCloseAtExpiry: true,
  customerSelfService: false,
});

beforeAll(async () => {
  orgId = (await db.organization.create({ data: { legalName: `Org ${tag}` } })).id;
  otherOrgId = (await db.organization.create({ data: { legalName: `Other ${tag}` } })).id;
  admin = await asUser("admin", "ADMIN", []);
  sales = await asUser("sales", "STAFF", []);
  catalogStaff = await asUser("catalog", "STAFF", ["catalog.write", "subscriptions.all", "billing.manage", "payments.record", "reports.view"]);
});

beforeEach(() => {
  current = admin;
});

afterAll(async () => {
  const orgs = [orgId, otherOrgId];
  await db.auditEvent.deleteMany({ where: { organizationId: { in: orgs } } });
  await db.staffInvitation.deleteMany({ where: { organizationId: { in: orgs } } });
  await db.discountRule.deleteMany({ where: { organizationId: { in: orgs } } });
  await db.taxRule.deleteMany({ where: { organizationId: { in: orgs } } });
  await db.planVersion.deleteMany({ where: { plan: { organizationId: { in: orgs } } } });
  await db.plan.deleteMany({ where: { organizationId: { in: orgs } } });
  await db.productVariant.deleteMany({ where: { product: { organizationId: { in: orgs } } } });
  await db.product.deleteMany({ where: { organizationId: { in: orgs } } });
  await db.user.deleteMany({ where: { organizationId: { in: orgs } } });
  await db.organization.deleteMany({ where: { id: { in: orgs } } });
  await db.$disconnect();
});

describe("catalog authorization", () => {
  it("denies product creation without catalog.write and logs the attempt", async () => {
    current = sales;
    expect(await code(createProduct(productInput))).toBe("FORBIDDEN");
    const denied = await db.auditEvent.findFirst({ where: { organizationId: orgId, action: "access.denied", objectId: "product.create", actorId: sales.id } });
    expect(denied).not.toBeNull();
  });

  it("hides cost price from staff without catalog.write", async () => {
    const { id } = await createProduct(productInput);
    current = sales;
    const product = await getProduct(id);
    expect(product.costPrice).toBeNull();
    expect(product.canEdit).toBe(false);
  });

  it("reports records from another organization as not found", async () => {
    const { id } = await createProduct(productInput);
    current = await asUser("outsider", "ADMIN", [], otherOrgId);
    expect(await code(getProduct(id))).toBe("NOT_FOUND");
    expect(await code(createPlan(planInput(id)))).toBe("VALIDATION_FAILED");
  });
});

describe("products and variants", () => {
  it("validates money fields", async () => {
    expect(await code(createProduct({ ...productInput, salePrice: "12.34567" }))).toBe("VALIDATION_FAILED");
    expect(await code(createProduct({ ...productInput, salePrice: "-1" }))).toBe("VALIDATION_FAILED");
  });

  it("adds variants once per attribute value", async () => {
    current = catalogStaff;
    const { id } = await createProduct(productInput);
    await addVariant(id, { attribute: "Brand", value: "Odoo", adjustmentType: "FIXED", adjustmentValue: "560" });
    expect(await code(addVariant(id, { attribute: "Brand", value: "Odoo", adjustmentType: "FIXED", adjustmentValue: "10" }))).toBe("CONFLICT");
    expect(await code(addVariant(id, { attribute: "Brand", value: "Free", adjustmentType: "FIXED", adjustmentValue: "-2500" }))).toBe("VALIDATION_FAILED");
  });
});

describe("plan versions", () => {
  it("publishes a new version only when price or minimum quantity changes", async () => {
    const { id: productId } = await createProduct(productInput);
    const { id } = await createPlan(planInput(productId));
    expect(await updatePlan(id, { ...planInput(productId), name: "CRM Monthly (renamed)" })).toEqual({ version: 1, newVersion: false });
    expect(await updatePlan(id, { ...planInput(productId), price: "2200" })).toEqual({ version: 2, newVersion: true });
    const plan = await getPlan(id);
    expect(plan.versions.map((v) => [v.version, v.price.toString()])).toEqual([
      [2, "2200"],
      [1, "2000"],
    ]);
  });

  it("rejects invalid availability windows and minimum quantities", async () => {
    const { id: productId } = await createProduct(productInput);
    expect(await code(createPlan({ ...planInput(productId), availableFrom: "2026-05-01", availableUntil: "2026-04-01" }))).toBe("VALIDATION_FAILED");
    expect(await code(createPlan({ ...planInput(productId), minQuantity: "0" }))).toBe("VALIDATION_FAILED");
  });
});

describe("taxes and discounts", () => {
  it("requires products for a selected-products tax", async () => {
    const base = { name: "GST 18%", jurisdiction: "India", rate: "18", effectiveFrom: "2026-04-01", effectiveUntil: "" };
    expect(await code(saveTaxRule(null, { ...base, scope: "SELECTED_PRODUCTS", productIds: [] }))).toBe("VALIDATION_FAILED");
    expect(await code(saveTaxRule(null, { ...base, rate: "120", scope: "ALL_PRODUCTS", productIds: [] }))).toBe("VALIDATION_FAILED");
    const { id: productId } = await createProduct(productInput);
    const { id } = await saveTaxRule(null, { ...base, scope: "SELECTED_PRODUCTS", productIds: [productId] });
    const rule = await db.taxRule.findUniqueOrThrow({ where: { id }, include: { products: true } });
    expect(rule.products.map((p) => p.id)).toEqual([productId]);
  });

  const discount = { name: "Launch 10%", type: "PERCENT", value: "10", scope: "SUBSCRIPTION", startsAt: "2026-01-01", priority: "0" };

  it("lets only administrators create discounts, logging staff attempts", async () => {
    current = catalogStaff;
    expect(await code(createDiscountRule(discount))).toBe("FORBIDDEN");
    expect(await db.auditEvent.count({ where: { organizationId: orgId, action: "access.denied", objectId: "discount.create" } })).toBe(1);
    current = admin;
    expect(await code(createDiscountRule(discount))).toBe("OK");
  });

  it("validates discount values and scope", async () => {
    expect(await code(createDiscountRule({ ...discount, value: "150" }))).toBe("VALIDATION_FAILED");
    expect(await code(createDiscountRule({ ...discount, scope: "PRODUCT" }))).toBe("VALIDATION_FAILED");
    expect(await code(createDiscountRule({ ...discount, endsAt: "2025-12-31" }))).toBe("VALIDATION_FAILED");
  });
});

describe("staff invitations", () => {
  it("only lets administrators invite", async () => {
    current = catalogStaff;
    expect(await code(inviteStaff({ name: "New", email: `new.${tag}@x.test`, permissions: [] }))).toBe("FORBIDDEN");
  });

  it("emails a single-use token and creates the staff account on acceptance", async () => {
    const email = `invitee.${tag}@x.test`;
    expect(await code(inviteStaff({ name: "Invitee", email, permissions: ["not.a.permission"] }))).toBe("VALIDATION_FAILED");
    const { id } = await inviteStaff({ name: "Invitee", email, permissions: ["catalog.write"] });
    const event = await db.outboxEvent.findUniqueOrThrow({ where: { dedupeKey: `staff-invite:${id}` } });
    const token = /token=([\w-]+)/.exec((event.payload as { text: string }).text)?.[1];
    expect(token).toBeTruthy();
    const invite = await db.staffInvitation.findUniqueOrThrow({ where: { id } });
    expect(invite.tokenHash).not.toContain(token!);
    expect(invite.permissions).toEqual(["catalog.write"]);

    await acceptInvitation({ token, name: "Invitee", password: "Weak" }, "1.1.1.1").catch(() => undefined);
    await acceptInvitation({ token, name: "Invitee", password: "Strong#Pass1" }, "1.1.1.1");
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user.role).toBe("STAFF");
    expect(user.permissions).toEqual(["catalog.write"]);
    expect(await code(acceptInvitation({ token, name: "Again", password: "Strong#Pass1" }, "1.1.1.1"))).toBe("VALIDATION_FAILED");
  });

  it("requires confirmation for permission changes and blocks self-edits", async () => {
    expect(await code(updateStaffPermissions(sales.id, ["reports.view"], false))).toBe("VALIDATION_FAILED");
    await updateStaffPermissions(sales.id, ["reports.view"], true);
    expect((await db.user.findUniqueOrThrow({ where: { id: sales.id } })).permissions).toEqual(["reports.view"]);
    expect(await code(updateStaffPermissions(admin.id, [], true))).toBe("VALIDATION_FAILED");
  });
});
