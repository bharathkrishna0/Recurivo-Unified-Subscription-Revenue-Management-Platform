import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { EmptyState, Notice } from "@/components/feedback/states";
import { CurrencyValue } from "@/components/finance/currency-value";
import { formatDay, intervalLabel } from "@/lib/formatting";
import { requireCustomerPage } from "@/server/identity/session";
import { portalHome } from "@/server/portal";

export const metadata: Metadata = { title: "Home" };

export default async function PortalHome() {
  const user = await requireCustomerPage();
  const { currency, locale } = user.organization;
  const home = await portalHome();
  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(" ")[0]}`} description="Your subscriptions, invoices and balance with this business." />
      {home.pendingQuotes > 0 ? (
        <div className="mb-6">
          <Notice role="status">
            {home.pendingQuotes} quotation{home.pendingQuotes === 1 ? " is" : "s are"} waiting for your review.{" "}
            <Link href="/portal/subscriptions" className="font-semibold underline underline-offset-4">
              Review in My subscriptions
            </Link>
          </Notice>
        </div>
      ) : null}
      <dl className="mb-10 grid grid-cols-1 divide-y divide-line border-y border-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="py-5 sm:pr-6">
          <dt className="text-small text-ink-muted">Active subscriptions</dt>
          <dd className="tabular mt-1 text-kpi font-semibold">{home.activeCount}</dd>
        </div>
        <div className="py-5 sm:px-6">
          <dt className="text-small text-ink-muted">Balance due</dt>
          <dd className="mt-1 text-kpi font-semibold">
            <CurrencyValue value={home.balance} currency={currency} locale={locale} />
          </dd>
        </div>
        <div className="py-5 sm:pl-6">
          <dt className="text-small text-ink-muted">Overdue</dt>
          <dd className="mt-1 text-kpi font-semibold">
            <CurrencyValue value={home.overdue} currency={currency} locale={locale} />
          </dd>
          {home.overdueCount > 0 ? <dd className="text-micro text-ink-subtle">{home.overdueCount} invoice(s) past their due date</dd> : null}
        </div>
      </dl>
      <div className="grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="next-charge">
          <SectionHeader title="Next charge" id="next-charge" action={<Link href="/portal/subscriptions" className="text-small font-semibold underline-offset-4 hover:underline">My subscriptions</Link>} />
          {home.next ? (
            <p className="py-4">
              <Link href={`/portal/subscriptions/${home.next.id}`} className="font-semibold underline-offset-4 hover:underline">
                {home.next.plan}
              </Link>{" "}
              ({intervalLabel[home.next.interval]?.toLowerCase()}):{" "}
              <CurrencyValue value={home.next.total} currency={currency} locale={locale} /> on {formatDay(home.next.nextBillDate, locale)}
            </p>
          ) : (
            <EmptyState title="No active subscriptions." body="When a quotation for your account is accepted and activated, its billing schedule appears here." className="border-t-0" />
          )}
        </section>
        <section aria-labelledby="next-payment">
          <SectionHeader title="Next payment due" id="next-payment" action={<Link href="/portal/billing" className="text-small font-semibold underline-offset-4 hover:underline">Invoices & payments</Link>} />
          {home.nextDue ? (
            <p className="py-4">
              <Link href={`/portal/billing/invoices/${home.nextDue.id}`} className="font-semibold underline-offset-4 hover:underline">
                {home.nextDue.number}
              </Link>
              : <CurrencyValue value={home.nextDue.outstanding} currency={currency} locale={locale} /> due {formatDay(home.nextDue.dueDate, locale)}
              {home.nextDue.state === "Overdue" ? <span className="font-semibold"> (overdue)</span> : null}
            </p>
          ) : (
            <p className="py-4 text-ink-muted">You have no unpaid invoices.</p>
          )}
        </section>
      </div>
    </>
  );
}
