import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, Notice } from "@/components/feedback/states";
import { SubNav } from "@/components/data/table";
import { StatusLabel } from "@/components/data/status-label";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/formatting";
import { BillingOpForm } from "@/features/billing/forms";
import { listExceptions, openExceptionCount } from "@/server/billing/exceptions";
import { requireStaffPage } from "@/server/identity/session";
import { BillingNav } from "../billing-nav";

export const metadata: Metadata = { title: "Billing exceptions" };

const TYPE: Record<string, string> = { CYCLE_FAILED: "Billing cycle failed", SEND_FAILED: "Email not delivered", UNMATCHED_PAYMENT: "Unmatched payment", DUPLICATE_EVENT: "Duplicate event" };

const hrefFor = (relatedType: string, id: string) => (relatedType === "Invoice" ? `/app/billing/invoices/${id}` : relatedType === "Subscription" ? `/app/subscriptions/${id}` : null);

export default async function ExceptionsPage({ searchParams }: PageProps<"/app/billing/exceptions">) {
  const user = await requireStaffPage();
  if (!can(user, "billing.manage")) redirect("/app/billing/invoices");
  const sp = await searchParams;
  const [rows, open] = await Promise.all([listExceptions(sp), openExceptionCount(user.organizationId)]);
  const resolved = sp.status === "RESOLVED";
  const org = user.organization;
  return (
    <>
      <PageHeader title="Billing" description="Work that needs a person: failed cycles and undelivered invoices. Failed cycles are retried on every billing run." />
      <BillingNav current="/app/billing/exceptions" openExceptions={open} />
      <SubNav current={resolved ? "/app/billing/exceptions?status=RESOLVED" : "/app/billing/exceptions"} items={[{ label: "Open", href: "/app/billing/exceptions" }, { label: "Resolved", href: "/app/billing/exceptions?status=RESOLVED" }]} />
      {sp.done === "resolved" ? (
        <div className="mb-6">
          <Notice role="status">Marked as resolved.</Notice>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title={resolved ? "Nothing resolved yet." : "No open exceptions."} body={resolved ? undefined : "Billing and delivery are running without problems."} />
      ) : (
        <ul className="flex flex-col border-t border-line">
          {rows.map((e) => {
            const href = hrefFor(e.relatedType, e.relatedId);
            return (
              <li key={e.id} className="flex flex-col gap-3 border-b border-line py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-small text-ink-muted">{TYPE[e.type]}</span>
                    <span className="text-body font-semibold">{href ? <Link className="underline underline-offset-4" href={href}>{e.summary}</Link> : e.summary}</span>
                  </div>
                  <StatusLabel status={e.status} />
                </div>
                {e.detail ? <p className="text-small text-ink-muted">{e.detail}</p> : null}
                <p className="text-small text-ink-muted">
                  {e.attempts} attempt(s) · last {formatDateTime(e.lastAttemptAt, org)}
                  {e.resolution ? ` · resolved: ${e.resolution}` : ""}
                </p>
                {e.status === "OPEN" ? <BillingOpForm op="exception.resolve" id={e.id} label="Mark resolved" consequence="Records what was done. A failed cycle that still cannot be billed will open a new exception on the next run." reasonLabel="What was done" /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
