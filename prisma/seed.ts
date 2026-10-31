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
