import type { Metadata } from "next";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/states";
import { CurrencyValue } from "@/components/finance/currency-value";
import { RowLink, Table, Td, Th } from "@/components/data/table";
import { StatusLabel } from "@/components/data/status-label";
import { formatDay, formatMoney } from "@/lib/formatting";
import { requireCustomerPage } from "@/server/identity/session";
import { myInvoices, myPayments } from "@/server/portal";
import { stateKey } from "../load";

export const metadata: Metadata = { title: "Invoices & payments" };

const METHOD: Record<string, string> = { BANK_TRANSFER: "Bank transfer", UPI: "UPI", CARD_EXTERNAL: "Card", CHEQUE: "Cheque", CASH: "Cash", OTHER: "Other" };

export default async function MyBillingPage() {
  const user = await requireCustomerPage();
  const org = user.organization;
  const [billing, payments] = await Promise.all([myInvoices(), myPayments()]);
  return (
    <>
      <PageHeader title="Invoices & payments" description="Newest first. Download any invoice as a PDF." />
      <dl className="mb-10 grid grid-cols-1 divide-y divide-line border-y border-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <div className="py-5 sm:pr-6">
          <dt className="text-small text-ink-muted">Balance due</dt>
          <dd className="mt-1 text-kpi font-semibold">
            <CurrencyValue value={billing.balance} currency={org.currency} locale={org.locale} />
          </dd>
        </div>
        <div className="py-5 sm:pl-6">
          <dt className="text-small text-ink-muted">Overdue</dt>
          <dd className="mt-1 text-kpi font-semibold">
            <CurrencyValue value={billing.overdue} currency={org.currency} locale={org.locale} />
          </dd>
        </div>
      </dl>

      <section aria-labelledby="invoices" className="mb-10">
        <SectionHeader title="Invoices" id="invoices" />
        {billing.invoices.length === 0 ? (
          <EmptyState title="No invoices yet." body="Invoices appear here once a subscription reaches its bill date." className="border-t-0" />
        ) : (
          <Table caption="Invoices">
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Issued</Th>
                <Th>Due</Th>
                <Th numeric>Total</Th>
                <Th numeric>Balance</Th>
                <Th>Status</Th>
                <Th>
                  <span className="sr-only">Download</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {billing.invoices.map((i) => (
                <tr key={i.id}>
                  <Td>
                    <RowLink href={`/portal/billing/invoices/${i.id}`}>{i.number}</RowLink>
                  </Td>
                  <Td>{formatDay(i.issueDate, org.locale)}</Td>
                  <Td>{formatDay(i.dueDate, org.locale)}</Td>
                  <Td numeric>{formatMoney(i.total, org)}</Td>
                  <Td numeric>{formatMoney(i.outstanding, org)}</Td>
                  <Td>
                    <StatusLabel status={stateKey(i.state)} />
                  </Td>
                  <Td>
                    <a href={`/api/v1/invoices/${i.id}/pdf`} className="text-small font-semibold underline-offset-4 hover:underline">
                      PDF<span className="sr-only"> of {i.number}</span>
                    </a>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section aria-labelledby="payments">
        <SectionHeader title="Payments received" id="payments" />
        {payments.length === 0 ? (
          <p className="py-4 text-ink-muted">No payments recorded yet.</p>
        ) : (
          <Table caption="Payments received">
            <thead>
              <tr>
                <Th>Receipt</Th>
                <Th>Received on</Th>
                <Th>Method</Th>
                <Th>Reference</Th>
                <Th>Applied to</Th>
                <Th numeric>Amount</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <Td>{p.number}</Td>
                  <Td>{formatDay(p.receivedOn, org.locale)}</Td>
                  <Td>{METHOD[p.method] ?? p.method}</Td>
                  <Td>{p.reference ?? "—"}</Td>
                  <Td>{p.allocations.length ? p.allocations.map((a) => a.number).join(", ") : "—"}</Td>
                  <Td numeric>{formatMoney(p.amount, org)}</Td>
                  <Td>
                    <StatusLabel status={p.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </>
  );
}
