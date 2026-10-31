/**
 * README demo helper: replays the billing worker once per day from the earliest
 * scheduled bill date up to today, so demo invoices carry their real historical
 * issue and due dates instead of all being caught up today. Demo databases only.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { runDueCycles } from "@/server/billing/engine";

const db = new PrismaClient();

async function main() {
  const first = await db.subscription.findFirst({ where: { status: "ACTIVE", nextBillDate: { not: null } }, orderBy: { nextBillDate: "asc" } });
  if (!first?.nextBillDate) return console.log("demo billing: nothing scheduled");
  let invoiced = 0;
  for (let day = new Date(first.nextBillDate); day <= new Date(); day = new Date(day.getTime() + 86_400_000)) {
    const result = await runDueCycles(db, { now: new Date(day.getTime() + 6 * 3_600_000) });
    invoiced += result.invoiced;
  }
  console.log(`demo billing: ${invoiced} invoices issued on their bill dates`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
