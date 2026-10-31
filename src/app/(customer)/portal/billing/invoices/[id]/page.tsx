import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { buttonClass } from "@/components/primitives/button";
import { Table, Td, Th } from "@/components/data/table";
import { StatusLabel } from "@/components/data/status-label";
import { formatDay, formatMoney } from "@/lib/formatting";
import { requireCustomerPage } from "@/server/identity/session";
import { myInvoice } from "@/server/portal";
import { orNotFound, stateKey } from "../../../load";

export const metadata: Metadata = { title: "Invoice" };

export default async function MyInvoicePage({ params }: PageProps<"/portal/billing/invoices/[id]">) {
  const user = await requireCustomerPage();
  const { id } = await params;
  const org = user.organization;
  const i = await orNotFound(myInvoice(id));
  const facts: [string, React.ReactNode][] = [
    ["Status", <StatusLabel key="s" status={stateKey(i.state)} />],
    ["Issued", formatDay(i.issueDate, org.locale)],
    ["Due", formatDay(i.dueDate, org.locale)],
    ...(i.periodStart ? ([["Service period", `${formatDay(i.periodStart, org.locale)} – ${formatDay(i.periodEnd, org.locale)}`]] as [string, string][]) : []),
    ...(i.subscription
      ? ([["Subscription", <Link key="sub" href={`/portal/subscriptions/${i.subscription.id}`} className="underline-offset-4 hover:underline">{`${i.subscription.number} · ${i.subscription.plan.name}`}</Link>]] as [string, React.ReactNode][])
      : []),
    ...(i.cancelReason ? ([["Cancelled because", i.cancelReason]] as [string, string][]) : []),
  ];
  return (
    <>
      <PageHeader
        title={i.number}
        breadcrumbs={[{ label: "Invoices & payments", href: "/portal/billing" }, { label: i.number }]}
        actions={
          <a href={`/api/v1/invoices/${i.id}/pdf`} className={buttonClass("secondary")}>
            Download PDF
          </a>
        }
      />
      <dl className="mb-8 divide-y divide-line border-y border-line">
        {facts.map(([k, v]) => (
          <div key={k} className="grid gap-1 py-3 sm:grid-cols-[220px_1fr]">
            <dt className="text-ink-muted">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="lines" className="mb-10">
        <SectionHeader title="Items" id="lines" />
        <Table caption="Invoice items">
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
            {i.lines.map((l) => (
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
        <dl className="ml-auto mt-4 w-full max-w-[360px] divide-y divide-line">
          {(
            [
              ["Subtotal", i.subtotal],
              ["Discount", i.discountTotal],
              ["Tax", i.taxTotal],
              ["Total", i.total],
              ["Paid", i.amountPaid],
              ["Balance due", i.outstanding],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className={`flex justify-between py-2 ${k === "Total" || k === "Balance due" ? "font-semibold" : ""}`}>
              <dt>{k}</dt>
              <dd className="tabular">{formatMoney(v, org)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="payments">
        <SectionHeader title="Payments applied" id="payments" />
        {i.allocations.length === 0 ? (
          <p className="py-4 text-ink-muted">No payments applied yet.</p>
        ) : (
          <Table caption="Payments applied">
            <thead>
              <tr>
                <Th>Receipt</Th>
                <Th>Received on</Th>
                <Th>Reference</Th>
                <Th numeric>Amount</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {i.allocations.map((a, n) => (
                <tr key={n}>
                  <Td>{a.payment.number}</Td>
                  <Td>{formatDay(a.payment.receivedOn, org.locale)}</Td>
                  <Td>{a.payment.reference ?? "—"}</Td>
                  <Td numeric>{formatMoney(a.amount.toString(), org)}</Td>
                  <Td>
                    <StatusLabel status={a.reversedAt ? "REVERSED" : "RECORDED"} />
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
