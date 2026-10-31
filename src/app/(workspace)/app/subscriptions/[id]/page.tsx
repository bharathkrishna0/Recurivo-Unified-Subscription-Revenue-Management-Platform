import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { EmptyState, Notice } from "@/components/feedback/states";
import { ButtonLink } from "@/components/primitives/button";
import { RowLink, Table, Td, Th } from "@/components/data/table";
import { StatusLabel } from "@/components/data/status-label";
import { formatDateTime, formatDay, formatMoney, intervalLabel } from "@/lib/formatting";
import type { LifecycleAction } from "@/lib/lifecycle";
import { TransitionForm } from "@/features/sales/forms";
import { getSubscription } from "@/server/sales/subscriptions";
import { requireStaffPage } from "@/server/identity/session";
import { AppError } from "@/server/platform/errors";

export const metadata: Metadata = { title: "Subscription" };

async function load(id: string) {
  try {
    return await getSubscription(id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}

const ACTION_COPY: Record<LifecycleAction, { label: string; consequence: string; reason?: boolean; primary?: boolean }> = {
  send: { label: "Send quotation", consequence: "Emails the quotation to the customer and starts its validity period.", primary: true },
  confirm: { label: "Confirm quotation", consequence: "Records that the customer accepted. Nothing is billed until you activate it.", primary: true },
  activate: { label: "Activate subscription", consequence: "Starts the contract. The first invoice is scheduled for the start date.", primary: true },
  pause: { label: "Pause", consequence: "No new invoices are created while paused. Issued invoices stay due." },
  resume: { label: "Resume", consequence: "Billing restarts on the next scheduled date. Periods inside the pause are not billed." },
  close: { label: "Close", consequence: "Ends the contract today. No further invoices are created; issued invoices stay due.", reason: true },
  cancel: { label: "Withdraw quotation", consequence: "The quotation can no longer be confirmed or activated.", reason: true },
  renew: { label: "Renew", consequence: "Drafts a new quotation for the next term at current plan prices. This contract is not changed." },
};

export default async function SubscriptionPage({ params, searchParams }: PageProps<"/app/subscriptions/[id]">) {
  const user = await requireStaffPage();
  const { id } = await params;
  const { saved, done } = await searchParams;
  const s = await load(id);
  const org = user.organization;
  const isQuote = ["DRAFT", "QUOTATION", "CONFIRMED"].includes(s.status);
  const money = (x: { toString(): string }) => formatMoney(x.toString(), org);
  return (
    <>
      <PageHeader
        title={s.customer.businessName}
        breadcrumbs={[isQuote ? { label: "Quotations", href: "/app/sales/quotations" } : { label: "Subscriptions", href: "/app/subscriptions" }, { label: s.number }]}
        description={`${s.plan.name} · ${intervalLabel[s.plan.interval]} · ${s.number}${s.revision > 1 ? ` · revision ${s.revision}` : ""}`}
        meta={s.expired ? <StatusLabel status="EXPIRED" /> : <StatusLabel status={s.status} />}
        actions={s.status === "DRAFT" || s.status === "QUOTATION" ? <ButtonLink href={`/app/subscriptions/${s.id}/edit`} variant="secondary">Edit</ButtonLink> : null}
      />
      {saved || done ? (
        <div className="mb-6">
          <Notice role="status">{saved ? "Saved as a draft. Send it when it is ready." : `Done: ${ACTION_COPY[done as LifecycleAction]?.label.toLowerCase() ?? "updated"}.`}</Notice>
        </div>
      ) : null}
      <dl className="mb-8 grid gap-4 border-y border-line py-4 sm:grid-cols-4">
        <div>
          <dt className="text-small text-ink-muted">{isQuote ? "Valid through" : "Next invoice"}</dt>
          <dd className="text-section font-semibold">{isQuote ? formatDay(s.quoteValidUntil, org.locale) : s.status === "PAUSED" ? "Paused" : formatDay(s.nextBillDate, org.locale)}</dd>
        </div>
        <div>
          <dt className="text-small text-ink-muted">Recurring amount</dt>
          <dd className="tabular text-section font-semibold">{money(s.total)}</dd>
        </div>
        <div>
          <dt className="text-small text-ink-muted">Contract</dt>
          <dd>
            {formatDay(s.startDate, org.locale)} – {s.endDate ? formatDay(s.endDate, org.locale) : "open-ended"}
          </dd>
        </div>
        <div>
          <dt className="text-small text-ink-muted">Payment terms</dt>
          <dd>{s.paymentTermsDays} days</dd>
        </div>
      </dl>
      {s.actions.length ? (
        <section aria-label="Actions" className="mb-10 flex flex-wrap items-start gap-3">
          {s.actions.map((a) => (
            <TransitionForm key={a} id={s.id} version={s.version} action={a} label={ACTION_COPY[a].label} consequence={ACTION_COPY[a].consequence} needsReason={ACTION_COPY[a].reason} primary={ACTION_COPY[a].primary} />
          ))}
        </section>
      ) : null}
      {s.closeReason ? (
        <div className="mb-8">
          <Notice>Closed {formatDateTime(s.closedAt, org)}: {s.closeReason}</Notice>
        </div>
      ) : null}
      <div className="grid gap-10 xl:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-10">
          <section aria-labelledby="lines" className="flex flex-col gap-4">
            <SectionHeader id="lines" title="Lines" />
            <Table caption="Subscription lines">
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th numeric>Qty</Th>
                  <Th numeric>Unit</Th>
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
                    <Td numeric>{money(l.unitPrice)}</Td>
                    <Td numeric>{Number(l.discountAmount) > 0 ? `−${money(l.discountAmount)}` : "—"}</Td>
                    <Td numeric>
                      {money(l.taxAmount)}
                      <span className="block text-small text-ink-muted">{l.taxRate.toString()}%</span>
                    </Td>
                    <Td numeric>{money(l.total)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <dl className="ml-auto grid w-full max-w-xs grid-cols-2 gap-y-1 text-body">
              <dt className="text-ink-muted">Subtotal</dt>
              <dd className="tabular text-right">{money(s.subtotal)}</dd>
              <dt className="text-ink-muted">Discount{s.discountRule ? ` (${s.discountRule.name})` : ""}</dt>
              <dd className="tabular text-right">−{money(s.discountTotal)}</dd>
              <dt className="text-ink-muted">Tax</dt>
              <dd className="tabular text-right">{money(s.taxTotal)}</dd>
              <dt className="font-semibold">Total per period</dt>
              <dd className="tabular text-right font-semibold">{money(s.total)}</dd>
            </dl>
          </section>
          <section aria-labelledby="invoices" className="flex flex-col gap-4">
            <SectionHeader id="invoices" title="Invoices" />
            {s.invoices.length === 0 ? (
              <EmptyState title="No invoices yet." body={isQuote ? "Invoices start after activation." : "The first invoice is created on the next bill date."} />
            ) : (
              <Table caption="Invoices">
                <thead>
                  <tr>
                    <Th>Invoice</Th>
                    <Th>Issued</Th>
                    <Th numeric>Total</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {s.invoices.map((i) => (
                    <tr key={i.id}>
                      <Td>{i.number}</Td>
                      <Td>{formatDay(i.issueDate, org.locale)}</Td>
                      <Td numeric>{money(i.total)}</Td>
                      <Td>
                        <StatusLabel status={i.status} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </section>
          {s.terms ? (
            <section aria-labelledby="terms" className="flex flex-col gap-2">
              <SectionHeader id="terms" title="Terms" />
              <p className="whitespace-pre-line text-body">{s.terms}</p>
            </section>
          ) : null}
        </div>
        <aside aria-labelledby="activity" className="flex flex-col gap-4">
          <SectionHeader id="activity" title="Activity" />
          <dl className="text-small text-ink-muted">
            <dt className="sr-only">Customer</dt>
            <dd>
              Customer: <RowLink href={`/app/customers/${s.customerId}`}>{s.customer.businessName}</RowLink>
            </dd>
            {s.template ? <dd>Template: {s.template.name}</dd> : null}
            <dd>Owner: {s.owner?.name ?? "—"}</dd>
            {s.renewedFrom ? (
              <dd>
                Renews <Link className="underline" href={`/app/subscriptions/${s.renewedFrom.id}`}>{s.renewedFrom.number}</Link>
              </dd>
            ) : null}
            {s.renewal ? (
              <dd>
                Renewed as <Link className="underline" href={`/app/subscriptions/${s.renewal.id}`}>{s.renewal.number}</Link>
              </dd>
            ) : null}
          </dl>
          <ol className="flex flex-col">
            {s.activity.map((e) => (
              <li key={e.id} className="border-b border-line py-2">
                <p className="text-body">{e.summary}</p>
                <p className="text-small text-ink-muted">{formatDateTime(e.createdAt, org)}</p>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </>
  );
}
