import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/states";
import { buttonClass } from "@/components/primitives/button";
import { inputClass } from "@/components/primitives/field";
import { Pagination, RowLink, Table, Td, Th } from "@/components/data/table";
import { StatusLabel } from "@/components/data/status-label";
import { cn } from "@/lib/cn";
import { formatDay, formatMoney, intervalLabel } from "@/lib/formatting";
import { listSubscriptions } from "@/server/sales/subscriptions";
import { requireStaffPage } from "@/server/identity/session";

export const metadata: Metadata = { title: "Subscriptions" };

export default async function SubscriptionsPage({ searchParams }: PageProps<"/app/subscriptions">) {
  const user = await requireStaffPage();
  const sp = await searchParams;
  const data = await listSubscriptions("subscriptions", sp);
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const org = user.organization;
  return (
    <>
      <PageHeader title="Subscriptions" description="Activated contracts, soonest bill date first." />
      <form method="get" role="search" className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1.5 text-small font-semibold">
          Search by number or customer
          <input name="q" type="search" defaultValue={q} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-small font-semibold">
          Status
          <select name="status" defaultValue={status} className={cn(inputClass, "w-44")}>
            <option value="">Active and paused</option>
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Paused</option>
            <option value="ENDING">Ending in 30 days</option>
            <option value="CLOSED">Closed</option>
            <option value="all">All</option>
          </select>
        </label>
        <button type="submit" className={buttonClass("secondary")}>
          Apply
        </button>
      </form>
      {data.rows.length === 0 ? (
        <EmptyState title={q || status ? "No subscriptions match these filters." : "No subscriptions yet."} body="A subscription starts when a confirmed quotation is activated." />
      ) : (
        <Table caption="Subscriptions">
          <thead>
            <tr>
              <Th>Number</Th>
              <Th>Customer</Th>
              <Th>Plan</Th>
              <Th numeric>Recurring amount</Th>
              <Th>Next bill</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((s) => (
              <tr key={s.id}>
                <Td>
                  <RowLink href={`/app/subscriptions/${s.id}`}>{s.number}</RowLink>
                </Td>
                <Td>{s.customer}</Td>
                <Td>
                  {s.plan} · {intervalLabel[s.interval]}
                </Td>
                <Td numeric>{formatMoney(s.total, org)}</Td>
                <Td>{formatDay(s.nextBillDate, org.locale)}</Td>
                <Td>
                  <StatusLabel status={s.status} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} hrefFor={(p) => `/app/subscriptions?${new URLSearchParams({ q, status, page: String(p) })}`} />
    </>
  );
}
