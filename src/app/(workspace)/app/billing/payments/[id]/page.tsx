import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/feedback/states";
import { RowLink, Table, Td, Th } from "@/components/data/table";
import { StatusLabel } from "@/components/data/status-label";
import { can } from "@/lib/permissions";
import { dec } from "@/lib/money";
import { formatDateTime, formatDay, formatMoney } from "@/lib/formatting";
import { BillingOpForm } from "@/features/billing/forms";
import { getPayment } from "@/server/billing/payments";
import { requireStaffPage } from "@/server/identity/session";
import { METHOD_LABEL, orNotFound } from "../../load";

export const metadata: Metadata = { title: "Payment" };

const DONE: Record<string, string> = { recorded: "Payment recorded.", replayed: "This payment was already recorded; nothing was added twice.", reversed: "Payment reversed. Invoice balances are restored." };

export default async function PaymentPage({ params, searchParams }: PageProps<"/app/billing/payments/[id]">) {
  const user = await requireStaffPage();
  const { id } = await params;
  const { done } = await searchParams;
  const p = await orNotFound(getPayment(id));
  const org = user.organization;
  const money = (x: { toString(): string }) => formatMoney(x.toString(), org);
  const applied = p.allocations.filter((a) => !a.reversedAt).reduce((s, a) => s.plus(dec(a.amount)), dec(0));
  return (
    <>
      <PageHeader title={`Payment ${p.number}`} breadcrumbs={[{ label: "Payments", href: "/app/billing/payments" }, { label: p.number }]} description={p.customer.businessName} meta={<StatusLabel status={p.status} />} />
      {typeof done === "string" && DONE[done] ? (
        <div className="mb-6">
          <Notice role="status">{DONE[done]}</Notice>
        </div>
      ) : null}
      <dl className="mb-8 grid gap-4 border-y border-line py-4 sm:grid-cols-4">
        <div>
          <dt className="text-small text-ink-muted">Amount</dt>
          <dd className="text-h3 font-semibold tabular-nums">{money(p.amount)}</dd>
        </div>
        <div>
          <dt className="text-small text-ink-muted">Unapplied</dt>
          <dd className="text-body tabular-nums">{p.status === "REVERSED" ? "—" : money(dec(p.amount).minus(applied).toString())}</dd>
        </div>
        <div>
          <dt className="text-small text-ink-muted">Received</dt>
          <dd className="text-body">
            {formatDay(p.receivedOn, org.locale)} · {METHOD_LABEL[p.method]}
          </dd>
        </div>
        <div>
          <dt className="text-small text-ink-muted">Reference</dt>
          <dd className="text-body">{p.reference ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-small text-ink-muted">Customer</dt>
          <dd className="text-body">
            <Link className="underline underline-offset-4" href={`/app/customers/${p.customer.id}`}>{p.customer.businessName}</Link>
          </dd>
        </div>
        {p.note ? (
          <div className="sm:col-span-3">
            <dt className="text-small text-ink-muted">Note</dt>
            <dd className="text-body">{p.note}</dd>
          </div>
        ) : null}
        {p.reversedAt ? (
          <div className="sm:col-span-4">
            <dt className="text-small text-ink-muted">Reversed</dt>
            <dd className="text-body">
              {formatDateTime(p.reversedAt, org)}: {p.reversalReason}
            </dd>
          </div>
        ) : null}
      </dl>
      {p.status === "RECORDED" && can(user, "billing.manage") ? (
        <div className="mb-8">
          <BillingOpForm op="payment.reverse" id={p.id} label="Reverse payment" consequence="Use this for a bounced cheque or a payment recorded by mistake. Invoice balances are restored; the payment stays on record as reversed." reasonLabel="Reason" />
        </div>
      ) : null}
      <section aria-labelledby="allocations" className="flex flex-col gap-4">
        <SectionHeader id="allocations" title="Applied to" />
        {p.allocations.length === 0 ? (
          <p className="text-body text-ink-muted">Not applied to any invoice.</p>
        ) : (
          <Table caption="Allocations">
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th numeric>Amount</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {p.allocations.map((a) => (
                <tr key={a.id}>
                  <Td>
                    <RowLink href={`/app/billing/invoices/${a.invoice.id}`}>{a.invoice.number}</RowLink>
                  </Td>
                  <Td numeric>{money(a.amount)}</Td>
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
