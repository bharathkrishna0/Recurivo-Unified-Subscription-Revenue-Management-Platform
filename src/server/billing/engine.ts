import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { addDays, addIntervals, billingPeriod, compareDates, formatDateOnly, periodIndexAt, todayIn } from "@/lib/dates";
import { discountState, taxRuleInEffect } from "@/lib/pricing";
import { priceQuote, type QuoteDiscount } from "@/lib/quote-pricing";
import { recordAudit, type AuditActor } from "@/server/platform/audit";
import { enqueueOutbox } from "@/server/platform/outbox";
import { nextNumber } from "@/server/platform/sequence";

// No "server-only" here: the standalone worker (tsx) imports this module.

type Tx = Prisma.TransactionClient;
type Org = { id: string; timezone: string; currency: string };
export type CycleOutcome = "invoiced" | "closed" | "skipped";

export interface BillingRunResult {
  invoiced: number;
  closed: number;
  skipped: number;
  failed: number;
}

export const billingWorker = (organizationId: string): AuditActor => ({ id: null, label: "Billing worker", organizationId });

/**
 * Bill every due cycle. Each cycle runs in its own transaction that claims the
 * subscription row with FOR UPDATE SKIP LOCKED, so concurrent workers never
 * bill the same subscription at once; the UNIQUE(subscriptionId, periodStart)
 * cycle key and the partial unique invoice index make a retry after a crash
 * observe the existing cycle instead of charging twice (BILL-04, AT-05/06).
 * Overdue cycles are picked up on the next run, so none are silently skipped.
 */
export async function runDueCycles(
  db: PrismaClient,
  opts: { now?: Date; organizationId?: string; limit?: number } = {},
): Promise<BillingRunResult> {
  const result: BillingRunResult = { invoiced: 0, closed: 0, skipped: 0, failed: 0 };
  const limit = opts.limit ?? 500;
  const orgs = await db.organization.findMany({
    where: opts.organizationId ? { id: opts.organizationId } : {},
    select: { id: true, timezone: true, currency: true },
  });
  for (const org of orgs) {
    const today = formatDateOnly(todayIn(org.timezone, opts.now));
    const failed: string[] = [];
    while (result.invoiced + result.closed + result.skipped + result.failed < limit) {
      let claimed: string | null = null;
      try {
        const outcome = await db.$transaction(
          async (tx) => {
            const rows = await tx.$queryRaw<{ id: string }[]>`
              SELECT "id" FROM "Subscription"
              WHERE "organizationId" = ${org.id} AND "status" = 'ACTIVE' AND "nextBillDate" <= ${today}::date
                AND NOT ("id" = ANY(${failed}::text[]))
              ORDER BY "nextBillDate", "id"
              LIMIT 1
              FOR UPDATE SKIP LOCKED`;
            if (rows.length === 0) return null;
            claimed = rows[0].id;
            return billNextCycle(tx, org, rows[0].id, todayIn(org.timezone, opts.now));
          },
          { timeout: 20_000 },
        );
        if (outcome === null) break;
        result[outcome]++;
      } catch (error) {
        if (!claimed) throw error;
        failed.push(claimed);
        result.failed++;
        await recordCycleFailure(db, org.id, claimed, error);
      }
    }
  }
  return result;
}

async function billNextCycle(tx: Tx, org: Org, subscriptionId: string, today: Date): Promise<CycleOutcome> {
  const sub = await tx.subscription.findUniqueOrThrow({
    where: { id: subscriptionId },
    include: { plan: true, customer: true, lines: { orderBy: { position: "asc" } } },
  });
  const actor = billingWorker(org.id);
  const start = sub.nextBillDate!;

  if (sub.endDate && compareDates(start, sub.endDate) > 0) {
    const close = sub.plan.autoCloseAtExpiry;
    await tx.subscription.update({
      where: { id: sub.id },
      data: close
        ? { status: "CLOSED", closedAt: new Date(), closeReason: "Contract term ended", nextBillDate: null, version: { increment: 1 } }
        : { nextBillDate: null, version: { increment: 1 } },
    });
    await recordAudit(tx, actor, {
      action: close ? "subscription.close" : "subscription.term_ended",
      objectType: "Subscription",
      objectId: sub.id,
      summary: close ? `Closed ${sub.number}: contract term ended` : `${sub.number} reached the end of its term; billing stopped`,
      changes: close ? { status: { from: "ACTIVE", to: "CLOSED" } } : undefined,
    });
    return close ? "closed" : "skipped";
  }

  const k = periodIndexAt(sub.startDate, sub.plan.interval, start);
  const period = billingPeriod(sub.startDate, sub.plan.interval, k);
  const periodEnd = sub.endDate && compareDates(period.end, sub.endDate) > 0 ? sub.endDate : period.end;
  const next = addIntervals(sub.startDate, sub.plan.interval, k + 1);
  const advance = () =>
    tx.subscription.update({ where: { id: sub.id }, data: { nextBillDate: next, cyclesBilled: { increment: 1 }, version: { increment: 1 } } });

  const cycle = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "BillingCycle" ("id", "subscriptionId", "periodStart", "periodEnd", "revision", "status", "attempts", "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${sub.id}, ${formatDateOnly(period.start)}::date, ${formatDateOnly(periodEnd)}::date, ${sub.revision}, 'INVOICED', 1, now(), now())
    ON CONFLICT ("subscriptionId", "periodStart") DO UPDATE
      SET "status" = 'INVOICED', "attempts" = "BillingCycle"."attempts" + 1, "lastError" = NULL, "revision" = EXCLUDED."revision", "updatedAt" = now()
      WHERE "BillingCycle"."status" = 'FAILED'
    RETURNING "id"`;
  if (cycle.length === 0) {
    // Already invoiced (e.g. a run committed but the schedule was not advanced): never bill twice.
    await advance();
    return "skipped";
  }
  const cycleId = cycle[0].id;

  // Contract snapshot: quantities and unit prices agreed on the subscription;
  // taxes and discount eligibility are evaluated now (BILL-02, TAX-01, DIS-02).
  const taxes = (
    await tx.taxRule.findMany({ where: { organizationId: org.id, status: "ACTIVE" }, include: { products: { select: { id: true } } } })
  ).filter((t) => taxRuleInEffect(t, period.start));
  const quoteLines = sub.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice }));
  const taxInput = taxes.map((t) => ({ ...t, productIds: t.products.map((p) => p.id) }));
  const rule = sub.discountRuleId ? await tx.discountRule.findUnique({ where: { id: sub.discountRuleId } }) : null;
  const usable = rule && ["ACTIVE", "EXHAUSTED"].includes(discountState(rule, today)) ? rule : null;
  let priced = priceQuote(quoteLines, { taxes: taxInput, discount: usable as QuoteDiscount | null, currency: org.currency });
  let discountNote: string | null = rule && !usable ? `Discount ${rule.name} is no longer valid` : null;
  if (usable && priced.discountTotal.gt(0)) {
    // Atomic usage claim: concurrent invoices can never exceed the limit (AT-07).
    const claimedUse = await tx.$executeRaw`
      UPDATE "DiscountRule" SET "usageCount" = "usageCount" + 1, "updatedAt" = now()
      WHERE "id" = ${usable.id} AND "status" = 'ACTIVE' AND ("usageLimit" IS NULL OR "usageCount" < "usageLimit")`;
    if (claimedUse !== 1) {
      priced = priceQuote(quoteLines, { taxes: taxInput, discount: null, currency: org.currency });
      discountNote = `Discount ${usable.name} reached its usage limit`;
    }
  }
  const discounted = !!usable && priced.discountTotal.gt(0) && !discountNote;

  const number = await nextNumber(tx, org.id, "INV");
  const invoice = await tx.invoice.create({
    data: {
      organizationId: org.id,
      number,
      customerId: sub.customerId,
      subscriptionId: sub.id,
      cycleId,
      status: "CONFIRMED",
      confirmedAt: new Date(),
      currency: org.currency,
      issueDate: today,
      dueDate: addDays(today, sub.paymentTermsDays),
      periodStart: period.start,
      periodEnd,
      subtotal: priced.subtotal.toFixed(4),
      discountTotal: priced.discountTotal.toFixed(4),
      taxTotal: priced.taxTotal.toFixed(4),
      total: priced.total.toFixed(4),
      deliveryStatus: "QUEUED",
      lines: {
        create: sub.lines.map((l, i) => {
          const p = priced.lines[i];
          return {
            productId: l.productId,
            variantId: l.variantId,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            lineSubtotal: p.lineSubtotal.toFixed(4),
            discountAmount: p.discountAmount.toFixed(4),
            discountRuleId: discounted && p.discountAmount.gt(0) ? usable!.id : null,
            taxableAmount: p.taxableAmount.toFixed(4),
            taxRate: p.taxRate.toFixed(4),
            taxAmount: p.taxAmount.toFixed(4),
            total: p.total.toFixed(4),
            taxBreakdown: p.taxBreakdown as unknown as Prisma.InputJsonValue,
            position: i,
          };
        }),
      },
    },
  });
  if (discounted) {
    await tx.discountRedemption.create({ data: { discountRuleId: usable!.id, invoiceId: invoice.id, amount: priced.discountTotal.toFixed(4) } });
  }
  await enqueueOutbox(tx, "invoice.send", `invoice-send:${invoice.id}:1`, { invoiceId: invoice.id });
  await advance();
  await recordAudit(tx, actor, {
    action: "invoice.issued",
    objectType: "Invoice",
    objectId: invoice.id,
    summary: `Issued ${number} for ${sub.number}, ${formatDateOnly(period.start)} to ${formatDateOnly(periodEnd)}${discountNote ? ` (${discountNote})` : ""}`,
    changes: { total: priced.total.toFixed(4), subscriptionId: sub.id, revision: sub.revision },
  });
  return "invoiced";
}

async function recordCycleFailure(db: PrismaClient, organizationId: string, subscriptionId: string, error: unknown): Promise<void> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
  const sub = await db.subscription.findUnique({ where: { id: subscriptionId }, select: { number: true, nextBillDate: true, revision: true, startDate: true, plan: { select: { interval: true } } } });
  if (!sub?.nextBillDate) return;
  const day = formatDateOnly(sub.nextBillDate);
  const period = billingPeriod(sub.startDate, sub.plan.interval, periodIndexAt(sub.startDate, sub.plan.interval, sub.nextBillDate));
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "BillingCycle" ("id", "subscriptionId", "periodStart", "periodEnd", "revision", "status", "attempts", "lastError", "createdAt", "updatedAt")
      VALUES (${randomUUID()}, ${subscriptionId}, ${day}::date, ${formatDateOnly(period.end)}::date, ${sub.revision}, 'FAILED', 1, ${message}, now(), now())
      ON CONFLICT ("subscriptionId", "periodStart") DO UPDATE
        SET "attempts" = "BillingCycle"."attempts" + 1, "lastError" = ${message}, "updatedAt" = now()
        WHERE "BillingCycle"."status" = 'FAILED'`;
    await tx.billingException.upsert({
      where: { organizationId_dedupeKey: { organizationId, dedupeKey: `cycle:${subscriptionId}:${day}` } },
      create: {
        organizationId,
        type: "CYCLE_FAILED",
        relatedType: "Subscription",
        relatedId: subscriptionId,
        summary: `Could not bill ${sub.number} for the period starting ${day}`,
        detail: message,
        dedupeKey: `cycle:${subscriptionId}:${day}`,
      },
      update: { attempts: { increment: 1 }, lastAttemptAt: new Date(), detail: message, status: "OPEN", resolvedAt: null, resolution: null },
    });
  });
}
