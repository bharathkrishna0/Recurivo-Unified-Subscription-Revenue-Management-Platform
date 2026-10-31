import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/states";
import { ButtonLink, buttonClass } from "@/components/primitives/button";
import { inputClass } from "@/components/primitives/field";
import { Pagination, RowLink, Table, Td, Th } from "@/components/data/table";
import { StatusLabel } from "@/components/data/status-label";
import { cn } from "@/lib/cn";
import { formatDay, formatMoney } from "@/lib/formatting";
import { listSubscriptions } from "@/server/sales/subscriptions";
import { requireStaffPage } from "@/server/identity/session";
import { SalesNav } from "../sales-nav";

export const metadata: Metadata = { title: "Quotations" };

export default async function QuotationsPage({ searchParams }: PageProps<"/app/sales/quotations">) {
  const user = await requireStaffPage();
  const sp = await searchParams;
  const data = await listSubscriptions("quotations", sp);
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const org = user.organization;
  return (
    <>
      <PageHeader title="Sales" description="Quotations move from draft to sent to confirmed, then become subscriptions." actions={<ButtonLink href="/app/sales/quotations/new">New quotation</ButtonLink>} />
      <SalesNav current="/app/sales/quotations" />
      <form method="get" role="search" className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1.5 text-small font-semibold">
          Search by number or customer
          <input name="q" type="search" defaultValue={q} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-small font-semibold">
          Status
          <select name="status" defaultValue={status} className={cn(inputClass, "w-44")}>
            <option value="">All open</option>
            <option value="DRAFT">Draft</option>
            <option value="QUOTATION">Sent</option>
            <option value="EXPIRED">Expired</option>
            <option value="CONFIRMED">Confirmed</option>
          </select>
        </label>
        <button type="submit" className={buttonClass("secondary")}>
          Apply
        </button>
      </form>
      {data.rows.length === 0 ? (
        <EmptyState title={q || status ? "No quotations match these filters." : "No open quotations."} body="Start from a template or a plan; prices and taxes are filled in for you." />
      ) : (
        <Table caption="Quotations">
          <thead>
            <tr>
              <Th>Number</Th>
              <Th>Customer</Th>
              <Th>Plan</Th>
              <Th numeric>Amount per period</Th>
              <Th>Valid until</Th>
              <Th>Status</Th>
              <Th>Owner</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((s) => (
              <tr key={s.id}>
                <Td>
                  <RowLink href={`/app/subscriptions/${s.id}`}>{s.number}</RowLink>
                </Td>
                <Td>{s.customer}</Td>
                <Td>{s.plan}</Td>
                <Td numeric>{formatMoney(s.total, org)}</Td>
                <Td>{formatDay(s.quoteValidUntil, org.locale)}</Td>
                <Td>{s.expired ? <StatusLabel status="EXPIRED" /> : <StatusLabel status={s.status} />}</Td>
                <Td>{s.owner ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} hrefFor={(p) => `/app/sales/quotations?${new URLSearchParams({ q, status, page: String(p) })}`} />
    </>
  );
}
