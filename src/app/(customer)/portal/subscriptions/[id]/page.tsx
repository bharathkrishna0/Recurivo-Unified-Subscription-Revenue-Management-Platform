import type { Metadata } from "next";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { EmptyState, Notice } from "@/components/feedback/states";
import { RowLink, Table, Td, Th } from "@/components/data/table";
import { StatusLabel } from "@/components/data/status-label";
import { formatDay, formatMoney, intervalLabel } from "@/lib/formatting";
import { TransitionForm } from "@/features/sales/forms";
import { requireCustomerPage } from "@/server/identity/session";
import { mySubscription } from "@/server/portal";
import { CUSTOMER_ACTION_COPY, orNotFound, stateKey } from "../../load";

export const metadata: Metadata = { title: "Subscription" };

const DONE: Record<string, string> = {
  confirm: "Quotation accepted. The business will activate it.",
  pause: "Subscription paused.",
  resume: "Subscription resumed.",
  close: "Subscription closed.",
  renew: "Renewal requested. The business will send you a renewal quotation.",
};

export default async function MySubscriptionPage({ params, searchParams }: PageProps<"/portal/subscriptions/[id]">) {
  const user = await requireCustomerPage();
  const { id } = await params;
  const { done } = await searchParams;
  const org = user.organization;
  const s = await orNotFound(mySubscription(id));
  const facts: [string, React.ReactNode][] = [
    ["Plan", `${s.plan.name} (${intervalLabel[s.plan.interval]?.toLowerCase()})`],
    ["Status", <StatusLabel key="s" status={s.expired ? "EXPIRED" : s.status === "QUOTATION" ? "AWAITING_REVIEW" : s.status} />],
    ["Start date", formatDay(s.startDate, org.locale)],
    ["End date", s.endDate ? formatDay(s.endDate, org.locale) : "Ongoing until closed"],
    ...(s.status === "ACTIVE" ? ([["Next charge", `${formatMoney(s.total, org)} on ${formatDay(s.nextBillDate, org.locale)}`]] as [string, string][]) : []),
    ...(s.status === "QUOTATION" && s.quoteValidUntil ? ([["Quotation valid until", formatDay(s.quoteValidUntil, org.locale)]] as [string, string][]) : []),
    ["Payment terms", `${s.paymentTermsDays} days after the invoice date`],
    ...(s.closeReason ? ([["Close reason", s.closeReason]] as [string, string][]) : []),
  ];
  return (
    <>
      <PageHeader title={s.number} description={s.plan.name} breadcrumbs={[{ label: "My subscriptions", href: "/portal/subscriptions" }, { label: s.number }]} />
      {typeof done === "string" && DONE[done] ? (
        <div className="mb-6">
          <Notice role="status">{DONE[done]}</Notice>
        </div>
      ) : null}
      <dl className="mb-8 divide-y divide-line border-y border-line">
        {facts.map(([k, v]) => (
          <div key={k} className="grid gap-1 py-3 sm:grid-cols-[220px_1fr]">
            <dt className="text-ink-muted">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="actions" className="mb-10">
        <SectionHeader title="What you can do" id="actions" />
        {s.actions.length ? (
          <div className="flex flex-wrap items-start gap-3 py-4">
            {s.actions.map((a) => {
              const copy = CUSTOMER_ACTION_COPY[a]!;
              return <TransitionForm key={a} id={s.id} version={s.version} action={a} label={copy.label} consequence={copy.consequence} needsReason={copy.reason} primary={copy.primary} portal />;
            })}
          </div>
        ) : (
          <p className="py-4 text-ink-muted">
            {s.renewalRequested ? "A renewal has been requested. " : ""}
            {s.plan.customerSelfService ? "No changes are available for this subscription right now." : "Changes to this plan are handled by the business. Contact them through Help."}
          </p>
        )}
      </section>

      <section aria-labelledby="lines" className="mb-10">
        <SectionHeader title="Items" id="lines" />
        <Table caption="Subscription items">
          <thead>
            <tr>
              <Th>Item</Th>
              <Th numeric>Qty</Th>
              <Th numeric>Unit price</Th>
              <Th numeric>Discount</Th>
              <Th numeric>Tax</Th>
              <Th numeric>Total</Th>
            </tr>
          </thead>
          <tbody>
            {s.lines.map((l) => (
              <tr key={l.id}>
                <Td>{l.description}</Td>
                <Td numeric>{l.quantity}</Td>
                <Td numeric>{formatMoney(l.unitPrice.toString(), org)}</Td>
                <Td numeric>{formatMoney(l.discountAmount.toString(), org)}</Td>
                <Td numeric>{formatMoney(l.taxAmount.toString(), org)}</Td>
                <Td numeric>{formatMoney(l.total.toString(), org)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="mt-3 text-right font-semibold">Total per period: {formatMoney(s.total, org)}</p>
      </section>

      {s.terms ? (
        <section aria-labelledby="terms" className="mb-10">
          <SectionHeader title="Terms" id="terms" />
          <p className="py-4 whitespace-pre-line">{s.terms}</p>
        </section>
      ) : null}

      <section aria-labelledby="invoices">
        <SectionHeader title="Invoices" id="invoices" />
        {s.invoices.length === 0 ? (
          <EmptyState title="No invoices yet." body="Invoices appear here from the first bill date." className="border-t-0" />
        ) : (
          <Table caption="Invoices for this subscription">
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Issued</Th>
                <Th>Due</Th>
                <Th numeric>Total</Th>
                <Th numeric>Balance</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {s.invoices.map((i) => (
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
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </>
  );
}
