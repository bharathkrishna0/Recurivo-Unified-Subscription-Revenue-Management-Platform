import type { Metadata } from "next";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { EmptyState, Notice } from "@/components/feedback/states";
import { CurrencyValue } from "@/components/finance/currency-value";
import { buttonClass } from "@/components/primitives/button";
import { inputClass } from "@/components/primitives/field";
import { Table, Td, Th } from "@/components/data/table";
import { cn } from "@/lib/cn";
import { formatDateOnly } from "@/lib/dates";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/formatting";
import { requireStaffPage } from "@/server/identity/session";
import { AppError } from "@/server/platform/errors";
import { filterQuery, getInsights, insightFilterOptions, SUBSCRIPTION_STATUSES, type Insights } from "@/server/reports/insights";

export const metadata: Metadata = { title: "Insights" };

const MONTH = (m: string, locale: string) => new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));

export default async function InsightsPage({ searchParams }: PageProps<"/app/insights">) {
  const user = await requireStaffPage("reports.view");
  const sp = await searchParams;
  const options = await insightFilterOptions(user);
  const org = user.organization;
  let data: Insights | null = null;
  let error: AppError | null = null;
  try {
    data = await getInsights(sp);
  } catch (e) {
    if (!(e instanceof AppError) || e.code !== "VALIDATION_FAILED") throw e;
    error = e;
    data = await getInsights({});
  }
  const f = data.filters;
  const qs = filterQuery(f);
  const ctx = { locale: org.locale, currency: org.currency };
  const max = Math.max(1, ...data.trend.flatMap((t) => [Number(t.billed), Number(t.collected)]));
  const hasData = data.trend.some((t) => Number(t.billed) > 0 || Number(t.collected) > 0);
  return (
    <>
      <PageHeader title="Insights" description={`Revenue summary in ${org.currency}, ${formatDateOnly(f.from)} to ${formatDateOnly(f.to)} (${org.timezone}).`} meta={`Calculated live from the ledger at ${formatDateTime(data.asOf, { locale: org.locale, timezone: org.timezone })}`} />
      {error ? (
        <div className="mb-6">
          <Notice tone="strong" role="alert">
            {error.message} {Object.values(error.fieldErrors ?? {}).join(". ")}. Showing the default range instead.
          </Notice>
        </div>
      ) : null}
      <form method="get" className="mb-8 flex flex-wrap items-end gap-3" aria-label="Filters">
        <label className="flex flex-col gap-1.5 text-small font-semibold">
          From
          <input name="from" type="date" defaultValue={formatDateOnly(f.from)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-small font-semibold">
          To
          <input name="to" type="date" defaultValue={formatDateOnly(f.to)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-small font-semibold">
          Plan
          <select name="planId" defaultValue={f.planId ?? ""} className={cn(inputClass, "w-48")}>
            <option value="">All plans</option>
            {options.plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-small font-semibold">
          Customer
          <select name="customerId" defaultValue={f.customerId ?? ""} className={cn(inputClass, "w-48")}>
            <option value="">All customers</option>
            {options.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.businessName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-small font-semibold">
          Subscription status
          <select name="status" defaultValue={f.status ?? ""} className={cn(inputClass, "w-40")}>
            <option value="">Any</option>
            {SUBSCRIPTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonClass("secondary")}>
          Apply
        </button>
      </form>

      <section aria-label="Summary" className="mb-10">
        <dl className="grid grid-cols-1 border-y border-line sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={data.subscriptionsLabel} value={<span className="tabular">{formatNumber(data.subscriptions, org.locale)}</span>} hint="Current count" />
          <Metric label="Billed revenue" value={<CurrencyValue value={data.billed} {...ctx} />} hint="Confirmed and paid invoices issued in the range" />
          <Metric label="Collected payments" value={<CurrencyValue value={data.collected} {...ctx} />} hint="Payments received in the range" />
          <Metric label="Outstanding" value={<CurrencyValue value={data.outstanding} {...ctx} />} hint={`Unpaid balance of invoices issued in the range; ${data.overdueCount} overdue (${formatMoney(data.overdue, ctx)})`} />
          <Metric label="MRR (calculated)" value={<CurrencyValue value={data.mrr} {...ctx} />} hint="Active subscriptions, monthly-normalised" />
          <Metric label="ARR (calculated)" value={<CurrencyValue value={data.arr} {...ctx} />} hint="MRR × 12" />
        </dl>
      </section>

      <section aria-labelledby="trend" className="mb-10">
        <SectionHeader title="Billed and collected by month" id="trend" />
        {!hasData ? (
          <EmptyState title="No invoices or payments in this range." body="Widen the date range or clear filters." className="border-t-0" />
        ) : (
          <>
            <figure className="py-4" aria-describedby="trend-table-caption">
              <svg role="img" aria-label={`Bar chart of billed and collected amounts per month in ${org.currency}; values in the table below`} viewBox={`0 0 ${data.trend.length * 48} 160`} className="h-44 w-full max-w-[900px]" preserveAspectRatio="none">
                {data.trend.map((t, i) => {
                  const hb = (Number(t.billed) / max) * 150;
                  const hc = (Number(t.collected) / max) * 150;
                  return (
                    <g key={t.month}>
                      <rect x={i * 48 + 8} y={160 - hb} width={14} height={hb} className="fill-ink" />
                      <rect x={i * 48 + 24} y={160 - hc} width={14} height={hc} className="fill-canvas stroke-ink" strokeWidth={1.5} strokeDasharray="3 2" />
                    </g>
                  );
                })}
              </svg>
              <figcaption className="mt-2 flex gap-6 text-small text-ink-muted">
                <span>
                  <span aria-hidden className="mr-1 inline-block h-3 w-3 bg-ink align-middle" /> Billed
                </span>
                <span>
                  <span aria-hidden className="mr-1 inline-block h-3 w-3 border border-dashed border-ink align-middle" /> Collected
                </span>
              </figcaption>
            </figure>
            <Table caption="Billed and collected by month">
              <thead>
                <tr>
                  <Th>Month</Th>
                  <Th numeric>Billed</Th>
                  <Th numeric>Collected</Th>
                </tr>
              </thead>
              <tbody>
                {data.trend.map((t) => (
                  <tr key={t.month}>
                    <Td>{MONTH(t.month, org.locale)}</Td>
                    <Td numeric>{formatMoney(t.billed, ctx)}</Td>
                    <Td numeric>{formatMoney(t.collected, ctx)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        )}
      </section>

      <section aria-labelledby="by-plan" className="mb-10">
        <SectionHeader
          title="By plan"
          id="by-plan"
          action={
            <span className="flex flex-wrap gap-2">
              <a href={`/api/v1/exports/revenue-by-plan?${qs}`} className={buttonClass("secondary", "sm")}>Export by plan</a>
              <a href={`/api/v1/exports/invoices?${qs}`} className={buttonClass("secondary", "sm")}>Export invoices</a>
              <a href={`/api/v1/exports/payments?${qs}`} className={buttonClass("secondary", "sm")}>Export payments</a>
            </span>
          }
        />
        {data.byPlan.length === 0 ? (
          <p className="py-4 text-ink-muted">No subscriptions or invoices match these filters.</p>
        ) : (
          <Table caption="Revenue by plan; columns add up to the summary totals">
            <thead>
              <tr>
                <Th>Plan</Th>
                <Th numeric>Subscriptions</Th>
                <Th numeric>MRR</Th>
                <Th numeric>Billed</Th>
                <Th numeric>Collected</Th>
                <Th numeric>Outstanding</Th>
              </tr>
            </thead>
            <tbody>
              {data.byPlan.map((r) => (
                <tr key={`${r.planId}-${r.plan}`}>
                  <Td>{r.plan}</Td>
                  <Td numeric>{formatNumber(r.subscriptions, org.locale)}</Td>
                  <Td numeric>{formatMoney(r.mrr, ctx)}</Td>
                  <Td numeric>{formatMoney(r.billed, ctx)}</Td>
                  <Td numeric>{formatMoney(r.collected, ctx)}</Td>
                  <Td numeric>{formatMoney(r.outstanding, ctx)}</Td>
                </tr>
              ))}
              <tr className="font-semibold">
                <Td>Total</Td>
                <Td numeric>{formatNumber(data.subscriptions, org.locale)}</Td>
                <Td numeric>{formatMoney(data.mrr, ctx)}</Td>
                <Td numeric>{formatMoney(data.billed, ctx)}</Td>
                <Td numeric>{formatMoney(data.collected, ctx)}</Td>
                <Td numeric>{formatMoney(data.outstanding, ctx)}</Td>
              </tr>
            </tbody>
          </Table>
        )}
      </section>

      <section aria-labelledby="definitions">
        <SectionHeader title="Definitions" id="definitions" />
        <dl className="divide-y divide-line text-body">
          {[
            ["Billed revenue", "Sum of totals (including tax) of confirmed and paid invoices whose issue date falls in the range. Cancelled and draft invoices are excluded. This is invoiced revenue, not recognised revenue."],
            ["Collected payments", "Recorded (not reversed) payments received in the range. With a plan or status filter, only the parts applied to invoices of matching subscriptions are counted."],
            ["Outstanding", "Unpaid balance today of confirmed invoices issued in the range. Overdue means the due date has passed."],
            ["MRR", "For active subscriptions: recurring amount after discount and before tax, normalised to a month (daily × 365/12, weekly × 52/12, yearly ÷ 12). A calculated measure, not cash."],
            ["ARR", "MRR × 12."],
          ].map(([k, v]) => (
            <div key={k} className="grid gap-1 py-3 sm:grid-cols-[220px_1fr]">
              <dt className="font-semibold">{k}</dt>
              <dd className="text-ink-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}

function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="border-line py-5 max-xl:border-b sm:px-0 xl:border-r xl:px-6 xl:nth-[4n+1]:pl-0 xl:nth-[4n]:border-r-0">
      <dt className="text-small text-ink-muted">{label}</dt>
      <dd className="mt-1 text-kpi font-semibold">{value}</dd>
      {hint ? <dd className="text-micro text-ink-subtle">{hint}</dd> : null}
    </div>
  );
}
