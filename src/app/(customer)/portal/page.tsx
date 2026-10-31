import type { Metadata } from "next";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/states";
import { CurrencyValue } from "@/components/finance/currency-value";
import { db } from "@/server/db";
import { requireCustomerPage } from "@/server/identity/session";

export const metadata: Metadata = { title: "Home" };

export default async function PortalHome() {
  const user = await requireCustomerPage();
  const { currency, locale } = user.organization;
  // Every query is scoped by the signed-in customer's own id.
  const where = { customerId: user.customerId, organizationId: user.organizationId };
  const [active, open] = await Promise.all([
    db.subscription.count({ where: { ...where, status: "ACTIVE" } }),
    db.invoice.findMany({ where: { ...where, status: "CONFIRMED" }, select: { total: true, amountPaid: true } }),
  ]);
  const balance = open.reduce((sum, i) => sum + Number(i.total) - Number(i.amountPaid), 0);
  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(" ")[0]}`} description="Your subscriptions, invoices and balance with this business." />
      <dl className="mb-10 grid grid-cols-1 divide-y divide-line border-y border-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <div className="py-5 sm:pr-6">
          <dt className="text-small text-ink-muted">Active subscriptions</dt>
          <dd className="tabular mt-1 text-kpi font-semibold">{active}</dd>
        </div>
        <div className="py-5 sm:pl-6">
          <dt className="text-small text-ink-muted">Balance due</dt>
          <dd className="mt-1 text-kpi font-semibold">
            <CurrencyValue value={balance.toFixed(2)} currency={currency} locale={locale} />
          </dd>
        </div>
      </dl>
      <section aria-labelledby="next-steps">
        <SectionHeader title="Next steps" id="next-steps" />
        {active === 0 ? (
          <EmptyState title="No subscriptions yet." body="When a quotation is confirmed for your account, it appears here with its billing schedule." className="border-t-0" />
        ) : (
          <p className="py-4 text-ink-muted">Open “My subscriptions” to see billing dates for each plan.</p>
        )}
      </section>
    </>
  );
}
