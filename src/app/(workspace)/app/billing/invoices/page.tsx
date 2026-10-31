import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, Notice } from "@/components/feedback/states";
import { buttonClass } from "@/components/primitives/button";
import { inputClass } from "@/components/primitives/field";
import { Pagination, RowLink, Table, Td, Th } from "@/components/data/table";
import { StatusLabel } from "@/components/data/status-label";
import { cn } from "@/lib/cn";
import { can } from "@/lib/permissions";
import { formatDay, formatMoney } from "@/lib/formatting";
import { BillingOpForm } from "@/features/billing/forms";
import { listInvoices } from "@/server/billing/invoices";
import { openExceptionCount } from "@/server/billing/exceptions";
import { requireStaffPage } from "@/server/identity/session";
import { BillingNav } from "../billing-nav";
import { stateKey } from "../load";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage({ searchParams }: PageProps<"/app/billing/invoices">) {
  const user = await requireStaffPage();
  const sp = await searchParams;
  const [data, exceptions] = await Promise.all([listInvoices(sp), openExceptionCount(user.organizationId)]);
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const run = typeof sp.run === "string" ? sp.run.split("-") : null;
  const org = user.organization;
  return (
    <>
      <PageHeader
        title="Billing"
        description="Invoices are created automatically on each subscription's bill date."
        actions={can(user, "billing.manage") ? <BillingOpForm op="billing.run" id="" label="Run billing now" consequence="Creates invoices for every subscription whose bill date has arrived. Periods that are already invoiced are skipped." /> : null}
      />
      <BillingNav current="/app/billing/invoices" openExceptions={exceptions} />
      {run ? (
        <div className="mb-6">
          <Notice role="status">
            Billing run finished: {run[0]} invoice(s) created{Number(run[1]) > 0 ? `, ${run[1]} failed and listed under Exceptions` : ""}.
          </Notice>
        </div>
      ) : null}
      <form method="get" role="search" className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1.5 text-small font-semibold">
          Search by number or customer
          <input name="q" type="search" defaultValue={q} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-small font-semibold">
          Status
          <select name="status" defaultValue={status} className={cn(inputClass, "w-44")}>
            <option value="">All</option>
            <option value="OPEN">Open (unpaid)</option>
            <option value="OVERDUE">Overdue</option>
            <option value="PAID">Paid</option>
            <option value="DRAFT">Draft</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </label>
        <button type="submit" className={buttonClass("secondary")}>
          Apply
        </button>
      </form>
      {data.rows.length === 0 ? (
        <EmptyState title={q || status ? "No invoices match these filters." : "No invoices yet."} body="The billing worker issues an invoice when an active subscription reaches its bill date." />
      ) : (
        <Table caption="Invoices">
          <thead>
            <tr>
              <Th>Invoice</Th>
              <Th>Customer</Th>
              <Th>Issued</Th>
              <Th>Due</Th>
              <Th numeric>Total</Th>
              <Th numeric>Balance</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((i) => (
              <tr key={i.id}>
                <Td>
                  <RowLink href={`/app/billing/invoices/${i.id}`}>{i.number}</RowLink>
                </Td>
                <Td>{i.customer}</Td>
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
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} hrefFor={(p) => `/app/billing/invoices?${new URLSearchParams({ q, status, page: String(p) })}`} />
    </>
  );
}
