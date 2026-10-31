import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { EmptyState, Notice } from "@/components/feedback/states";
import { CurrencyValue } from "@/components/finance/currency-value";
import { ButtonLink } from "@/components/primitives/button";
import { addDays, addMonthsClamped, formatDateOnly, todayIn } from "@/lib/dates";
import { formatDateTime, formatDay, formatNumber } from "@/lib/formatting";
import { can } from "@/lib/permissions";
import { db } from "@/server/db";
import { requireStaffPage } from "@/server/identity/session";

export const metadata: Metadata = { title: "Overview" };

interface Totals {
  billed: string;
  collected: string;
  outstanding: string;
  overdue: string;
  overdueCount: number;
}

async function loadTotals(organizationId: string, from: Date, to: Date, today: Date): Promise<Totals> {
  const [row] = await db.$queryRaw<
    { billed: string | null; collected: string | null; outstanding: string | null; overdue: string | null; overdue_count: bigint }[]
  >`
    SELECT
      (SELECT COALESCE(SUM("total"), 0)::text FROM "Invoice"
        WHERE "organizationId" = ${organizationId} AND "status" IN ('CONFIRMED', 'PAID')
          AND "issueDate" >= ${from}::date AND "issueDate" < ${to}::date) AS billed,
      (SELECT COALESCE(SUM("amount"), 0)::text FROM "Payment"
        WHERE "organizationId" = ${organizationId} AND "status" = 'RECORDED'
          AND "receivedOn" >= ${from}::date AND "receivedOn" < ${to}::date) AS collected,
      (SELECT COALESCE(SUM("total" - "amountPaid"), 0)::text FROM "Invoice"
        WHERE "organizationId" = ${organizationId} AND "status" = 'CONFIRMED') AS outstanding,
      (SELECT COALESCE(SUM("total" - "amountPaid"), 0)::text FROM "Invoice"
        WHERE "organizationId" = ${organizationId} AND "status" = 'CONFIRMED' AND "dueDate" < ${today}::date) AS overdue,
      (SELECT COUNT(*) FROM "Invoice"
        WHERE "organizationId" = ${organizationId} AND "status" = 'CONFIRMED' AND "dueDate" < ${today}::date) AS overdue_count`;
  return {
    billed: row?.billed ?? "0",
    collected: row?.collected ?? "0",
    outstanding: row?.outstanding ?? "0",
    overdue: row?.overdue ?? "0",
    overdueCount: Number(row?.overdue_count ?? 0),
  };
}

export default async function OverviewPage({ searchParams }: PageProps<"/app">) {
  const user = await requireStaffPage();
  const { denied } = await searchParams;
  const { organizationId, organization: org } = user;
  const ctx = { locale: org.locale, currency: org.currency, timezone: org.timezone };
  const today = todayIn(org.timezone);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const nextMonth = addMonthsClamped(monthStart, 1);
  const showFinance = can(user, "reports.view");

  const [activeCount, subscriptionCount, totals, openExceptions, failedSends, activity] = await Promise.all([
    db.subscription.count({ where: { organizationId, status: "ACTIVE" } }),
    db.subscription.count({ where: { organizationId } }),
    showFinance ? loadTotals(organizationId, monthStart, nextMonth, today) : Promise.resolve(null),
    db.billingException.count({ where: { organizationId, status: "OPEN" } }),
    db.invoice.count({ where: { organizationId, deliveryStatus: "FAILED" } }),
    showFinance || user.role === "ADMIN"
      ? db.auditEvent.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 8 })
      : Promise.resolve([]),
  ]);

  const attention = [
    totals && totals.overdueCount > 0
      ? { label: `${formatNumber(totals.overdueCount, ctx.locale)} overdue invoice${totals.overdueCount === 1 ? "" : "s"}`, href: "/app/billing/invoices?status=overdue" }
      : null,
    failedSends > 0 ? { label: `${failedSends} invoice email${failedSends === 1 ? "" : "s"} failed to send`, href: "/app/billing/invoices?delivery=failed" } : null,
    openExceptions > 0 ? { label: `${openExceptions} open billing exception${openExceptions === 1 ? "" : "s"}`, href: "/app/billing/exceptions" } : null,
  ].filter((x): x is { label: string; href: string } => x !== null);

  const period = `${formatDay(monthStart, ctx.locale)} – ${formatDay(addDays(nextMonth, -1), ctx.locale)}`;

  return (
    <>
      <PageHeader title="Overview" description={`Reporting period: ${period} (${org.timezone})`} meta={`As of ${formatDateOnly(today)}`} />
      {denied ? (
        <div className="mb-6">
          <Notice tone="strong" role="alert">
            You do not have permission to open that page. Ask an administrator if you need access.
          </Notice>
        </div>
      ) : null}

      <section aria-label="Key metrics" className="mb-10">
        <dl className="grid grid-cols-1 border-y border-line sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Active subscriptions" value={<span className="tabular">{formatNumber(activeCount, ctx.locale)}</span>} />
          {totals ? (
            <>
              <Metric label="Billed revenue" hint="Confirmed invoices issued this period" value={<CurrencyValue value={totals.billed} {...ctx} />} />
              <Metric label="Collected payments" hint="Payments received this period" value={<CurrencyValue value={totals.collected} {...ctx} />} />
              <Metric label="Outstanding balance" hint="All unpaid confirmed invoices" value={<CurrencyValue value={totals.outstanding} {...ctx} />} />
            </>
          ) : null}
        </dl>
        {totals && totals.overdueCount > 0 ? (
          <p className="mt-3 text-body font-semibold">
            Overdue: <CurrencyValue value={totals.overdue} {...ctx} /> across {totals.overdueCount} invoice{totals.overdueCount === 1 ? "" : "s"}
          </p>
        ) : null}
      </section>

      {subscriptionCount === 0 ? (
        <EmptyState
          title="No subscriptions yet."
          body="Start by creating a product and a recurring plan. Quotations and subscriptions are built from plans."
          action={
            can(user, "catalog.write") ? (
              <ButtonLink href="/app/catalog">Create a plan</ButtonLink>
            ) : (
              <ButtonLink href="/app/catalog" variant="secondary">
                View plans
              </ButtonLink>
            )
          }
        />
      ) : null}

      <div className="mt-10 grid gap-10 xl:grid-cols-2">
        <section aria-labelledby="attention">
          <SectionHeader title="Needs attention" id="attention" />
          {attention.length === 0 ? (
            <p className="py-4 text-ink-muted">Nothing needs attention right now.</p>
          ) : (
            <ul className="divide-y divide-line">
              {attention.map((a) => (
                <li key={a.href}>
                  <Link href={a.href} className="flex h-12 items-center justify-between font-medium hover:bg-surface-hover">
                    {a.label}
                    <span aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        {activity.length > 0 || showFinance ? (
          <section aria-labelledby="activity">
            <SectionHeader title="Recent activity" id="activity" />
            {activity.length === 0 ? (
              <p className="py-4 text-ink-muted">No activity recorded yet.</p>
            ) : (
              <ol className="divide-y divide-line">
                {activity.map((e) => (
                  <li key={e.id} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                    <span>{e.summary}</span>
                    <span className="shrink-0 text-small text-ink-muted">{formatDateTime(e.createdAt, ctx)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ) : null}
      </div>
    </>
  );
}

function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="border-line py-5 max-xl:border-b sm:px-0 xl:border-r xl:px-6 xl:first:pl-0 xl:last:border-r-0">
      <dt className="text-small text-ink-muted">{label}</dt>
      <dd className="mt-1 text-kpi font-semibold">{value}</dd>
      {hint ? <dd className="text-micro text-ink-subtle">{hint}</dd> : null}
    </div>
  );
}
