import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { EmptyState, Notice } from "@/components/feedback/states";
import { ButtonLink } from "@/components/primitives/button";
import { RowLink, Table, Td, Th } from "@/components/data/table";
import { StatusLabel } from "@/components/data/status-label";
import { can } from "@/lib/permissions";
import { dec } from "@/lib/money";
import { formatDateTime, formatDay, formatMoney } from "@/lib/formatting";
import { BillingOpForm } from "@/features/billing/forms";
import { getInvoice } from "@/server/billing/invoices";
import { requireStaffPage } from "@/server/identity/session";
import { METHOD_LABEL, orNotFound, stateKey } from "../../load";

export const metadata: Metadata = { title: "Invoice" };

const DONE: Record<string, string> = { sent: "Queued for email. Delivery status updates once the worker sends it.", cancelled: "Invoice cancelled.", confirmed: "Invoice confirmed." };

export default async function InvoicePage({ params, searchParams }: PageProps<"/app/billing/invoices/[id]">) {
  const user = await requireStaffPage();
  const { id } = await params;
  const { done } = await searchParams;
  const inv = await orNotFound(getInvoice(id));
  const org = user.organization;
  const money = (x: { toString(): string }) => formatMoney(x.toString(), org);
  const manage = can(user, "billing.manage");
  const open = inv.status === "CONFIRMED";
  return (
    <>
      <PageHeader
        title={`Invoice ${inv.number}`}
        breadcrumbs={[{ label: "Invoices", href: "/app/billing/invoices" }, { label: inv.number }]}
        description={inv.customer.businessName}
        meta={<StatusLabel status={stateKey(inv.state)} />}
        actions={
          <div className="flex flex-wrap items-start gap-3">
            <ButtonLink href={`/api/v1/invoices/${inv.id}/pdf`} variant="secondary">
              Download PDF
            </ButtonLink>
            {open && can(user, "payments.record") ? <ButtonLink href={`/app/billing/payments/new?customerId=${inv.customerId}`}>Record payment</ButtonLink> : null}
          </div>
        }
      />
      {typeof done === "string" && DONE[done] ? (
        <div className="mb-6">
          <Notice role="status">{DONE[done]}</Notice>
        </div>
      ) : null}
      {inv.deliveryStatus === "FAILED" ? (
        <div className="mb-6">
          <Notice tone="strong" role="alert">
            Email delivery failed: {inv.deliveryError ?? "unknown error"}. Check the customer&apos;s email address, then resend.
          </Notice>
        </div>
      ) : null}
      <dl className="mb-8 grid gap-4 border-y border-line py-4 sm:grid-cols-4">
        <div>
          <dt className="text-small text-ink-muted">Issued</dt>
          <dd className="text-body">{formatDay(inv.issueDate, org.locale)}</dd>
        </div>
        <div>
          <dt className="text-small text-ink-muted">Due</dt>
          <dd className="text-body">{formatDay(inv.dueDate, org.locale)}</dd>
        </div>
        <div>
          <dt className="text-small text-ink-muted">Service period</dt>
          <dd className="text-body">{inv.periodStart ? `${formatDay(inv.periodStart, org.locale)} – ${formatDay(inv.periodEnd, org.locale)}` : "—"}</dd>
        </div>
        <div>
          <dt className="text-small text-ink-muted">Balance due</dt>
          <dd className="text-h3 font-semibold tabular-nums">{inv.status === "CANCELLED" ? "—" : money(inv.outstanding)}</dd>
        </div>
        <div>
          <dt className="text-small text-ink-muted">Subscription</dt>
          <dd className="text-body">{inv.subscription ? <Link className="underline underline-offset-4" href={`/app/subscriptions/${inv.subscription.id}`}>{inv.subscription.number}</Link> : "—"}</dd>
        </div>
        <div>
          <dt className="text-small text-ink-muted">Customer</dt>
          <dd className="text-body">
            <Link className="underline underline-offset-4" href={`/app/customers/${inv.customerId}`}>{inv.customer.businessName}</Link>
          </dd>
        </div>
        <div>
          <dt className="text-small text-ink-muted">Email</dt>
          <dd className="flex items-center gap-2 text-body">
            <StatusLabel status={inv.deliveryStatus} />
            {inv.sentAt ? <span className="text-small text-ink-muted">{formatDateTime(inv.sentAt, org)}</span> : null}
          </dd>
        </div>
        {inv.cancelReason ? (
          <div>
            <dt className="text-small text-ink-muted">Cancellation reason</dt>
            <dd className="text-body">{inv.cancelReason}</dd>
          </div>
        ) : null}
      </dl>
      {manage && inv.status !== "CANCELLED" ? (
        <div className="mb-8 flex flex-wrap items-start gap-3">
          {inv.status === "DRAFT" ? <BillingOpForm op="invoice.confirm" id={inv.id} label="Confirm invoice" consequence="Locks the invoice amounts. Corrections afterwards need a cancellation before payment." primary /> : null}
          {inv.status !== "DRAFT" ? <BillingOpForm op="invoice.send" id={inv.id} label={inv.deliveryStatus === "NOT_SENT" ? "Send by email" : "Resend email"} consequence={`Emails the PDF to ${inv.customer.email}. Amounts are not recalculated.`} /> : null}
          {inv.status !== "PAID" ? (
            <BillingOpForm
              op="invoice.cancel"
              id={inv.id}
              label="Cancel invoice"
              consequence={dec(inv.amountPaid).gt(0) ? "Payments are applied to this invoice. Reverse them first, then cancel." : "The invoice stays on record as cancelled and no longer counts toward the customer's balance."}
              reasonLabel="Reason"
            />
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-col gap-10">
        <section aria-labelledby="lines" className="flex flex-col gap-4">
          <SectionHeader id="lines" title="Lines" />
          <Table caption="Invoice lines">
            <thead>
              <tr>
                <Th>Description</Th>
                <Th numeric>Qty</Th>
                <Th numeric>Unit price</Th>
                <Th numeric>Discount</Th>
                <Th numeric>Tax</Th>
                <Th numeric>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.id}>
                  <Td>{l.description}</Td>
                  <Td numeric>{l.quantity}</Td>
                  <Td numeric>{money(l.unitPrice)}</Td>
                  <Td numeric>{dec(l.discountAmount).gt(0) ? `−${money(l.discountAmount)}` : "—"}</Td>
                  <Td numeric>
                    {money(l.taxAmount)} <span className="text-small text-ink-muted">({Number(l.taxRate)}%)</span>
                  </Td>
                  <Td numeric>{money(l.total)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <dl className="ml-auto grid w-full max-w-[320px] grid-cols-2 gap-y-1 text-body">
            <dt className="text-ink-muted">Subtotal</dt>
            <dd className="text-right tabular-nums">{money(inv.subtotal)}</dd>
            {dec(inv.discountTotal).gt(0) ? (
              <>
                <dt className="text-ink-muted">Discount{inv.redemptions[0] ? ` (${inv.redemptions[0].discountRule.name})` : ""}</dt>
                <dd className="text-right tabular-nums">−{money(inv.discountTotal)}</dd>
              </>
            ) : null}
            <dt className="text-ink-muted">Tax</dt>
            <dd className="text-right tabular-nums">{money(inv.taxTotal)}</dd>
            <dt className="border-t border-line pt-1 font-semibold">Total</dt>
            <dd className="border-t border-line pt-1 text-right font-semibold tabular-nums">{money(inv.total)}</dd>
            <dt className="text-ink-muted">Paid</dt>
            <dd className="text-right tabular-nums">{money(inv.amountPaid)}</dd>
          </dl>
        </section>
        <section aria-labelledby="payments" className="flex flex-col gap-4">
          <SectionHeader id="payments" title="Payments applied" />
          {inv.allocations.length === 0 ? (
            <EmptyState title="No payments applied yet." />
          ) : (
            <Table caption="Payments applied">
              <thead>
                <tr>
                  <Th>Payment</Th>
                  <Th>Received</Th>
                  <Th>Method</Th>
                  <Th numeric>Applied</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {inv.allocations.map((a) => (
                  <tr key={a.id}>
                    <Td>
                      <RowLink href={`/app/billing/payments/${a.payment.id}`}>{a.payment.number}</RowLink>
                    </Td>
                    <Td>{formatDay(a.payment.receivedOn, org.locale)}</Td>
                    <Td>{METHOD_LABEL[a.payment.method]}</Td>
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
        <section aria-labelledby="activity" className="flex flex-col gap-4">
          <SectionHeader id="activity" title="Activity" />
          <ol className="flex flex-col border-t border-line">
            {inv.activity.map((e) => (
              <li key={e.id} className="flex flex-col gap-0.5 border-b border-line py-3 sm:flex-row sm:justify-between">
                <span className="text-body">{e.summary}</span>
                <span className="text-small text-ink-muted">
                  {e.actorLabel} · {formatDateTime(e.createdAt, org)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
