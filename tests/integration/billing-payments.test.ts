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

const { recordPayment, reversePayment } = await import("@/server/billing/payments");
const { cancelInvoice, getInvoice, invoicePdf, sendInvoice } = await import("@/server/billing/invoices");
const { invoiceDeliveryFailed } = await import("@/server/billing/delivery");

const db = new PrismaClient();
const tag = `m4p${Date.now()}`;
let orgId: string;
let admin: CurrentUser;
let finance: CurrentUser;
let sales: CurrentUser;
let customerId: string;
let otherCustomerId: string;
let seq = 0;

async function asUser(name: string, role: "ADMIN" | "STAFF" | "CUSTOMER", permissions: string[], customerOf?: string): Promise<CurrentUser> {
  const user = await db.user.create({
    data: { organizationId: orgId, email: `${name}.${tag}@x.test`, name, role, permissions, passwordHash: "x" },
    include: { organization: true },
  });
  if (customerOf) await db.customer.update({ where: { id: customerOf }, data: { portalUserId: user.id } });
  return { ...user, customerId: customerOf ?? null, organization: user.organization };
}

async function invoice(total = "1000.00", customer = customerId) {
  seq++;
  return (
    await db.invoice.create({
      data: {
        organizationId: orgId,
        number: `T-${tag}-${seq}`,
        customerId: customer,
        status: "CONFIRMED",
        currency: "INR",
        issueDate: new Date("2026-10-01"),
        dueDate: new Date("2099-01-01"),
        subtotal: total,
        discountTotal: "0",
        taxTotal: "0",
        total,
        lines: { create: [{ description: "Service", quantity: 1, unitPrice: total, lineSubtotal: total, discountAmount: "0", taxableAmount: total, taxRate: "0", taxAmount: "0", total }] },
      },
    })
  ).id;
}

const pay = (amount: string, allocations: { invoiceId: string; amount: string }[], key = crypto.randomUUID()) =>
  recordPayment({ customerId, method: "BANK_TRANSFER", amount, receivedOn: "2026-10-31", idempotencyKey: key, allocations });

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "OK";
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
}

beforeAll(async () => {
  orgId = (await db.organization.create({ data: { legalName: `Org ${tag}` } })).id;
  customerId = (await db.customer.create({ data: { organizationId: orgId, businessName: "Acme", contactName: "A", email: `acme.${tag}@x.test` } })).id;
  otherCustomerId = (await db.customer.create({ data: { organizationId: orgId, businessName: "Other", contactName: "O", email: `other.${tag}@x.test` } })).id;
  admin = await asUser("admin", "ADMIN", []);
  finance = await asUser("finance", "STAFF", ["payments.record"]);
  sales = await asUser("sales", "STAFF", []);
});

afterAll(async () => {
  const org = { organizationId: orgId };
  await db.paymentAllocation.deleteMany({ where: { payment: org } });
  await db.payment.deleteMany({ where: org });
  await db.invoice.deleteMany({ where: org });
  await db.billingException.deleteMany({ where: org });
  await db.auditEvent.deleteMany({ where: org });
  await db.customer.updateMany({ where: org, data: { portalUserId: null } });
  await db.customer.deleteMany({ where: org });
  await db.user.deleteMany({ where: org });
  await db.sequence.deleteMany({ where: org });
  await db.organization.delete({ where: { id: orgId } });
  await db.$disconnect();
});

describe("payments", () => {
  it("records a 40% partial payment and shows the 60% balance (AT-08)", async () => {
    current = finance;
    const id = await invoice();
    const p = await pay("400", [{ invoiceId: id, amount: "400" }]);
    expect(p.number).toMatch(/^PAY-\d{5}$/);
    const inv = await getInvoice(id);
    expect([inv.status, inv.state, inv.outstanding]).toEqual(["CONFIRMED", "Partially paid", "600"]);
  });

  it("marks an invoice paid when settled and blocks over-allocation", async () => {
    current = finance;
    const id = await invoice();
    expect(await code(pay("1200", [{ invoiceId: id, amount: "1200" }]))).toBe("VALIDATION_FAILED");
    expect(await code(pay("100", [{ invoiceId: id, amount: "200" }]))).toBe("VALIDATION_FAILED");
    await pay("1000", [{ invoiceId: id, amount: "1000" }]);
    const inv = await getInvoice(id);
    expect([inv.status, inv.state, inv.outstanding]).toEqual(["PAID", "Paid", "0"]);
    expect(await code(pay("10", [{ invoiceId: id, amount: "10" }]))).toBe("VALIDATION_FAILED");
  });

  it("rejects allocations to another customer's invoice", async () => {
    current = finance;
    const foreign = await invoice("500.00", otherCustomerId);
    expect(await code(pay("500", [{ invoiceId: foreign, amount: "500" }]))).toBe("VALIDATION_FAILED");
  });

  it("returns the original payment when the idempotency key is replayed", async () => {
    current = finance;
    const id = await invoice();
    const key = crypto.randomUUID();
    const first = await pay("300", [{ invoiceId: id, amount: "300" }], key);
    const again = await pay("300", [{ invoiceId: id, amount: "300" }], key);
    expect(again).toEqual({ id: first.id, number: first.number, replayed: true });
    expect((await getInvoice(id)).amountPaid.toString()).toBe("300");
  });

  it("never allocates more than the balance under concurrent payments", async () => {
    current = finance;
    const id = await invoice();
    const results = await Promise.allSettled([1, 2, 3, 4].map(() => pay("400", [{ invoiceId: id, amount: "400" }])));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect((await getInvoice(id)).amountPaid.toString()).toBe("800");
  });

  it("requires payments.record to record and billing.manage to reverse", async () => {
    current = sales;
    const id = await invoice();
    expect(await code(pay("100", [{ invoiceId: id, amount: "100" }]))).toBe("FORBIDDEN");
    current = finance;
    const p = await pay("100", [{ invoiceId: id, amount: "100" }]);
    expect(await code(reversePayment(p.id, "Bounced"))).toBe("FORBIDDEN");
  });

  it("reverses a payment, restores the balance, and only then allows cancellation", async () => {
    current = finance;
    const id = await invoice();
    const p = await pay("1000", [{ invoiceId: id, amount: "1000" }]);
    current = admin;
    expect(await code(cancelInvoice(id, "Raised in error"))).toBe("INVALID_TRANSITION");
    await reversePayment(p.id, "Cheque bounced");
    const inv = await getInvoice(id);
    expect([inv.status, inv.outstanding]).toEqual(["CONFIRMED", "1000"]);
    expect(await code(reversePayment(p.id, "Again"))).toBe("INVALID_TRANSITION");
    await cancelInvoice(id, "Raised in error");
    expect((await getInvoice(id)).status).toBe("CANCELLED");
  });
});

describe("invoice access and delivery", () => {
  it("returns NOT_FOUND when a customer requests another account's invoice (AT-10)", async () => {
    const own = await invoice();
    const foreign = await invoice("100.00", otherCustomerId);
    current = await asUser("portal", "CUSTOMER", [], customerId);
    const pdf = await invoicePdf(own);
    expect(pdf.pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(await code(invoicePdf(foreign))).toBe("NOT_FOUND");
    expect(await code(getInvoice(own))).toBe("FORBIDDEN");
  });

  it("records a failed delivery as an exception and resolves it on resend (BILL-05)", async () => {
    current = admin;
    const id = await invoice();
    await invoiceDeliveryFailed(db, { invoiceId: id }, "Mailbox unavailable");
    await invoiceDeliveryFailed(db, { invoiceId: id }, "Mailbox unavailable");
    const ex = await db.billingException.findMany({ where: { organizationId: orgId, relatedId: id } });
    expect(ex).toHaveLength(1);
    expect([ex[0].type, ex[0].attempts, ex[0].status]).toEqual(["SEND_FAILED", 2, "OPEN"]);
    await sendInvoice(id);
    const after = await db.billingException.findUniqueOrThrow({ where: { id: ex[0].id } });
    expect(after.status).toBe("RESOLVED");
    expect((await getInvoice(id)).deliveryStatus).toBe("QUEUED");
    expect(await db.outboxEvent.count({ where: { type: "invoice.send", payload: { equals: { invoiceId: id } } } })).toBe(1);
    await db.outboxEvent.deleteMany({ where: { type: "invoice.send", payload: { equals: { invoiceId: id } } } });
  });
});
