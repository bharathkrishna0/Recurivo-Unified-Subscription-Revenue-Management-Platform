import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const db = new PrismaClient();
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

/** Demo-only password. Change or remove these accounts before any real deployment. */
export const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "Recurivo#2026";

async function upsertUser(organizationId: string, email: string, name: string, role: "ADMIN" | "STAFF" | "CUSTOMER", permissions: string[], passwordHash: string) {
  return db.user.upsert({
    where: { email },
    update: { name, role, permissions },
    create: { organizationId, email, name, role, permissions, passwordHash },
  });
}

async function main() {
  const passwordHash = await hash(DEMO_PASSWORD, OPTIONS);
  const org =
    (await db.organization.findFirst({ orderBy: { createdAt: "asc" } })) ??
    (await db.organization.create({
      data: {
        legalName: "Northwind Software Pvt. Ltd.",
        currency: "INR",
        timezone: "Asia/Kolkata",
        locale: "en-IN",
        supportEmail: "billing@northwind.example",
        paymentTermsDays: 15,
      },
    }));

  await upsertUser(org.id, "admin@recurivo.test", "Asha Raman", "ADMIN", [], passwordHash);
  await upsertUser(org.id, "finance@recurivo.test", "Farhan Iqbal", "STAFF", ["billing.manage", "payments.record", "reports.view"], passwordHash);
  await upsertUser(org.id, "sales@recurivo.test", "Sara Thomas", "STAFF", [], passwordHash);

  const customers = [
    { email: "billing@acme.test", name: "Arjun Mehta", business: "Acme Retail LLP", portal: true },
    { email: "accounts@northco.test", name: "Neha Kapoor", business: "North Co. Logistics", portal: true },
    { email: "ops@blueleaf.test", name: "Vikram Rao", business: "Blueleaf Studios", portal: false },
  ];
  for (const c of customers) {
    const user = c.portal ? await upsertUser(org.id, c.email, c.name, "CUSTOMER", [], passwordHash) : null;
    const existing = await db.customer.findFirst({ where: { organizationId: org.id, email: c.email } });
    if (!existing) {
      await db.customer.create({
        data: {
          organizationId: org.id,
          businessName: c.business,
          contactName: c.name,
          email: c.email,
          portalUserId: user?.id,
          billingAddress: "Bengaluru, Karnataka, India",
        },
      });
    }
  }

  if ((await db.product.count({ where: { organizationId: org.id } })) === 0) {
    const crm = await db.product.create({
      data: { organizationId: org.id, name: "CRM Suite", type: "SERVICE", salePrice: "2000", costPrice: "800", notes: "Per seat licence" },
    });
    await db.productVariant.createMany({
      data: [
        { productId: crm.id, attribute: "Brand", value: "Odoo", adjustmentType: "FIXED", adjustmentValue: "560" },
        { productId: crm.id, attribute: "Brand", value: "Standard", adjustmentType: "FIXED", adjustmentValue: "0" },
      ],
    });
    const support = await db.product.create({ data: { organizationId: org.id, name: "Priority Support", type: "SERVICE", salePrice: "1500" } });
    const plans = [
      { productId: crm.id, name: "CRM Monthly", interval: "MONTHLY" as const, price: "2000", minQuantity: 1, allowPause: true, allowEarlyClose: true },
      { productId: crm.id, name: "CRM Yearly", interval: "YEARLY" as const, price: "21600", minQuantity: 5, allowPause: false, allowEarlyClose: false },
      { productId: support.id, name: "Support Monthly", interval: "MONTHLY" as const, price: "1500", minQuantity: 1, allowPause: true, allowEarlyClose: true },
    ];
    for (const p of plans) {
      const plan = await db.plan.create({ data: { organizationId: org.id, ...p } });
      await db.planVersion.create({ data: { planId: plan.id, version: 1, price: p.price, minQuantity: p.minQuantity } });
    }
    await db.taxRule.create({
      data: { organizationId: org.id, name: "GST 18%", jurisdiction: "India", rate: "18", scope: "ALL_PRODUCTS", effectiveFrom: new Date("2026-01-01T00:00:00Z") },
    });
    const admin = await db.user.findUniqueOrThrow({ where: { email: "admin@recurivo.test" } });
    await db.discountRule.create({
      data: {
        organizationId: org.id,
        name: "Annual commitment 10%",
        type: "PERCENT",
        value: "10",
        scope: "SUBSCRIPTION",
        minQuantity: 5,
        startsAt: new Date("2026-01-01T00:00:00Z"),
        usageLimit: 100,
        createdById: admin.id,
      },
    });
  }

  console.log(`Seeded organization "${org.legalName}".`);
  console.log("Demo accounts (password from SEED_PASSWORD or the default in prisma/seed.ts):");
  console.log("  admin@recurivo.test   Administrator");
  console.log("  finance@recurivo.test Staff, finance lead profile");
  console.log("  sales@recurivo.test   Staff, sales profile");
  console.log("  billing@acme.test     Customer portal");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
