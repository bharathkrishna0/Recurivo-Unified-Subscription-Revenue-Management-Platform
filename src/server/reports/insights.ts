import "server-only";
import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { db } from "@/server/db";
import { requirePermissionFor } from "@/server/identity/access";
import { invalid } from "@/server/platform/errors";
import { addMonthsClamped, formatDateOnly, parseDateOnly, todayIn, type BillingIntervalName } from "@/lib/dates";
import { monthlyRecurring, monthsBetween } from "@/lib/metrics";
import type { CurrentUser } from "@/server/identity/session";

export const SUBSCRIPTION_STATUSES = ["ACTIVE", "PAUSED", "CLOSED", "CONFIRMED", "QUOTATION"] as const;
type SubStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface InsightFilters {
  from: Date;
  to: Date;
  planId: string | null;
  customerId: string | null;
  status: SubStatus | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Defaults to the last six calendar months through today, in the organization's time zone. */
export function parseInsightFilters(params: Record<string, unknown>, timezone: string): InsightFilters {
  const today = todayIn(timezone);
  const defaultFrom = addMonthsClamped(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), -5);
  const errors: Record<string, string> = {};
  const date = (key: string, fallback: Date) => {
    const v = str(params[key]);
    if (!v) return fallback;
    try {
      if (DATE.test(v)) return parseDateOnly(v);
    } catch {}
    errors[key] = "Use a date like 2026-01-31";
    return fallback;
  };
  const from = date("from", defaultFrom);
  const to = date("to", today);
  if (from > to) errors.to = "The end date must be on or after the start date";
  else if (monthsBetween(from, to).length > 36) errors.from = "Choose a range of 36 months or less";
  const status = str(params.status);
  if (status && !SUBSCRIPTION_STATUSES.includes(status as SubStatus)) errors.status = "Unknown status";
  if (Object.keys(errors).length) throw invalid("Check the highlighted filters.", errors);
  return { from, to, planId: str(params.planId), customerId: str(params.customerId), status: (status as SubStatus) ?? null };
}

export function filterQuery(f: InsightFilters): string {
  const q = new URLSearchParams({ from: formatDateOnly(f.from), to: formatDateOnly(f.to) });
  if (f.planId) q.set("planId", f.planId);
  if (f.customerId) q.set("customerId", f.customerId);
  if (f.status) q.set("status", f.status);
  return q.toString();
}

/** Plan/status filters restrict figures to invoices of matching subscriptions (by current status). */
function subscriptionFilter(f: InsightFilters): Prisma.Sql {
  return Prisma.sql`${f.planId ? Prisma.sql` AND s."planId" = ${f.planId}` : Prisma.empty}${
    f.status ? Prisma.sql` AND s."status" = ${f.status}::"SubscriptionStatus"` : Prisma.empty
  }`;
}

const hasSubscriptionFilter = (f: InsightFilters) => !!(f.planId || f.status);

export interface PlanRow {
  planId: string | null;
  plan: string;
  subscriptions: number;
  mrr: string;
  billed: string;
  collected: string;
  outstanding: string;
}

export interface Insights {
  filters: InsightFilters;
  asOf: Date;
  today: Date;
  subscriptions: number;
  subscriptionsLabel: string;
  mrr: string;
  arr: string;
  billed: string;
  collected: string;
  outstanding: string;
  overdue: string;
  overdueCount: number;
  trend: { month: string; billed: string; collected: string }[];
  byPlan: PlanRow[];
}

const d = (v: unknown) => new Decimal(v === null || v === undefined ? 0 : String(v));

export async function computeInsights(user: CurrentUser, f: InsightFilters): Promise<Insights> {
  const org = user.organizationId;
  const today = todayIn(user.organization.timezone);
  const subFilter = subscriptionFilter(f);
  const invCustomer = f.customerId ? Prisma.sql` AND i."customerId" = ${f.customerId}` : Prisma.empty;
  const payCustomer = f.customerId ? Prisma.sql` AND p."customerId" = ${f.customerId}` : Prisma.empty;
  const subCustomer = f.customerId ? Prisma.sql` AND s."customerId" = ${f.customerId}` : Prisma.empty;
  const invoiceWhere = Prisma.sql`i."organizationId" = ${org} AND i."status" IN ('CONFIRMED', 'PAID')
    AND i."issueDate" >= ${f.from}::date AND i."issueDate" <= ${f.to}::date${invCustomer}${subFilter}`;
  const allocationWhere = Prisma.sql`p."organizationId" = ${org} AND p."status" = 'RECORDED' AND pa."reversedAt" IS NULL
    AND p."receivedOn" >= ${f.from}::date AND p."receivedOn" <= ${f.to}::date${payCustomer}${subFilter}`;

  const [plans, invoiceRows, allocationRows, paymentRows, subRows, billedTrend, collectedTrend] = await Promise.all([
    db.plan.findMany({ where: { organizationId: org }, select: { id: true, name: true } }),
    db.$queryRaw<{ planId: string | null; billed: unknown; outstanding: unknown; overdue: unknown; overdue_count: bigint }[]>`
      SELECT s."planId", SUM(i."total") AS billed,
        SUM(CASE WHEN i."status" = 'CONFIRMED' THEN i."total" - i."amountPaid" ELSE 0 END) AS outstanding,
        SUM(CASE WHEN i."status" = 'CONFIRMED' AND i."dueDate" < ${today}::date THEN i."total" - i."amountPaid" ELSE 0 END) AS overdue,
        COUNT(*) FILTER (WHERE i."status" = 'CONFIRMED' AND i."dueDate" < ${today}::date) AS overdue_count
      FROM "Invoice" i LEFT JOIN "Subscription" s ON s."id" = i."subscriptionId"
      WHERE ${invoiceWhere}
      GROUP BY s."planId"`,
    db.$queryRaw<{ planId: string | null; collected: unknown }[]>`
      SELECT s."planId", SUM(pa."amount") AS collected
      FROM "PaymentAllocation" pa
        JOIN "Payment" p ON p."id" = pa."paymentId"
        JOIN "Invoice" i ON i."id" = pa."invoiceId"
        LEFT JOIN "Subscription" s ON s."id" = i."subscriptionId"
      WHERE ${allocationWhere}
      GROUP BY s."planId"`,
    hasSubscriptionFilter(f)
      ? Promise.resolve([])
      : db.$queryRaw<{ total: unknown }[]>`
          SELECT SUM(p."amount") AS total FROM "Payment" p
          WHERE p."organizationId" = ${org} AND p."status" = 'RECORDED'
            AND p."receivedOn" >= ${f.from}::date AND p."receivedOn" <= ${f.to}::date${payCustomer}`,
    db.$queryRaw<{ planId: string; interval: BillingIntervalName; counted: bigint; active_amount: unknown }[]>`
      SELECT s."planId", pl."interval",
        COUNT(*) FILTER (WHERE s."status" = ${f.status ?? "ACTIVE"}::"SubscriptionStatus") AS counted,
        SUM(CASE WHEN s."status" = 'ACTIVE' THEN s."subtotal" - s."discountTotal" ELSE 0 END) AS active_amount
      FROM "Subscription" s JOIN "Plan" pl ON pl."id" = s."planId"
      WHERE s."organizationId" = ${org}${subCustomer}${subFilter}
      GROUP BY s."planId", pl."interval"`,
    db.$queryRaw<{ month: string; amount: unknown }[]>`
      SELECT to_char(i."issueDate", 'YYYY-MM') AS month, SUM(i."total") AS amount
      FROM "Invoice" i LEFT JOIN "Subscription" s ON s."id" = i."subscriptionId"
      WHERE ${invoiceWhere} GROUP BY 1`,
    hasSubscriptionFilter(f)
      ? db.$queryRaw<{ month: string; amount: unknown }[]>`
          SELECT to_char(p."receivedOn", 'YYYY-MM') AS month, SUM(pa."amount") AS amount
          FROM "PaymentAllocation" pa
            JOIN "Payment" p ON p."id" = pa."paymentId"
            JOIN "Invoice" i ON i."id" = pa."invoiceId"
            LEFT JOIN "Subscription" s ON s."id" = i."subscriptionId"
          WHERE ${allocationWhere} GROUP BY 1`
      : db.$queryRaw<{ month: string; amount: unknown }[]>`
          SELECT to_char(p."receivedOn", 'YYYY-MM') AS month, SUM(p."amount") AS amount FROM "Payment" p
          WHERE p."organizationId" = ${org} AND p."status" = 'RECORDED'
            AND p."receivedOn" >= ${f.from}::date AND p."receivedOn" <= ${f.to}::date${payCustomer}
          GROUP BY 1`,
  ]);

  const names = new Map(plans.map((p) => [p.id, p.name]));
  const rows = new Map<string, { planId: string | null; subscriptions: number; mrr: Decimal; billed: Decimal; collected: Decimal; outstanding: Decimal }>();
  const row = (planId: string | null) => {
    const key = planId ?? "";
    if (!rows.has(key)) rows.set(key, { planId, subscriptions: 0, mrr: d(0), billed: d(0), collected: d(0), outstanding: d(0) });
    return rows.get(key)!;
  };
  let overdue = d(0);
  let overdueCount = 0;
  for (const r of subRows) {
    const x = row(r.planId);
    x.subscriptions += Number(r.counted);
    x.mrr = x.mrr.plus(monthlyRecurring(d(r.active_amount), r.interval));
  }
  for (const r of invoiceRows) {
    const x = row(r.planId);
    x.billed = x.billed.plus(d(r.billed));
    x.outstanding = x.outstanding.plus(d(r.outstanding));
    overdue = overdue.plus(d(r.overdue));
    overdueCount += Number(r.overdue_count);
  }
  for (const r of allocationRows) row(r.planId).collected = row(r.planId).collected.plus(d(r.collected));

  const sum = (k: "mrr" | "billed" | "collected" | "outstanding" | "subscriptions") => [...rows.values()].reduce((s, r) => s.plus(r[k]), d(0));
  const applied = sum("collected");
  const paymentsTotal = hasSubscriptionFilter(f) ? applied : d((paymentRows as { total: unknown }[])[0]?.total);
  const unapplied = paymentsTotal.minus(applied);

  const byPlan: PlanRow[] = [...rows.values()]
    .filter((r) => r.subscriptions > 0 || !r.billed.isZero() || !r.collected.isZero() || !r.outstanding.isZero())
    .map((r) => ({
      planId: r.planId,
      plan: r.planId ? (names.get(r.planId) ?? "Unknown plan") : "No subscription",
      subscriptions: r.subscriptions,
      mrr: r.mrr.toFixed(2),
      billed: r.billed.toFixed(2),
      collected: r.collected.toFixed(2),
      outstanding: r.outstanding.toFixed(2),
    }))
    .sort((a, b) => a.plan.localeCompare(b.plan));
  if (unapplied.gt(0)) byPlan.push({ planId: null, plan: "Not yet applied to an invoice", subscriptions: 0, mrr: "0.00", billed: "0.00", collected: unapplied.toFixed(2), outstanding: "0.00" });

  const billedBy = new Map(billedTrend.map((r) => [r.month, d(r.amount)]));
  const collectedBy = new Map(collectedTrend.map((r) => [r.month, d(r.amount)]));
  const mrr = sum("mrr");
  return {
    filters: f,
    asOf: new Date(),
    today,
    subscriptions: sum("subscriptions").toNumber(),
    subscriptionsLabel: `${f.status ? f.status.charAt(0) + f.status.slice(1).toLowerCase() : "Active"} subscriptions`,
    mrr: mrr.toFixed(2),
    arr: mrr.times(12).toFixed(2),
    billed: sum("billed").toFixed(2),
    collected: paymentsTotal.toFixed(2),
    outstanding: sum("outstanding").toFixed(2),
    overdue: overdue.toFixed(2),
    overdueCount,
    trend: monthsBetween(f.from, f.to).map((m) => ({ month: m, billed: (billedBy.get(m) ?? d(0)).toFixed(2), collected: (collectedBy.get(m) ?? d(0)).toFixed(2) })),
    byPlan,
  };
}

export async function getInsights(params: Record<string, unknown>): Promise<Insights> {
  const user = await requirePermissionFor("reports.view", "reports.view");
  return computeInsights(user, parseInsightFilters(params, user.organization.timezone));
}

export async function insightFilterOptions(user: CurrentUser) {
  const [plans, customers] = await Promise.all([
    db.plan.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.customer.findMany({ where: { organizationId: user.organizationId }, orderBy: { businessName: "asc" }, select: { id: true, businessName: true } }),
  ]);
  return { plans, customers };
}
