import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/states";
import { ButtonLink } from "@/components/primitives/button";
import { inputClass } from "@/components/primitives/field";
import { buttonClass } from "@/components/primitives/button";
import { Pagination, RowLink, Table, Td, Th } from "@/components/data/table";
import { formatDay, formatMoney } from "@/lib/formatting";
import { listCustomers } from "@/server/sales/customers";
import { requireStaffPage } from "@/server/identity/session";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: PageProps<"/app/customers">) {
  const user = await requireStaffPage();
  const sp = await searchParams;
  const data = await listCustomers(sp);
  const q = typeof sp.q === "string" ? sp.q : "";
  const org = user.organization;
  return (
    <>
      <PageHeader title="Customers" description="Businesses you quote, bill and collect from." actions={<ButtonLink href="/app/customers/new">New customer</ButtonLink>} />
      <form method="get" role="search" className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1.5 text-small font-semibold">
          Search by business, contact or email
          <input name="q" type="search" defaultValue={q} className={inputClass} />
        </label>
        <button type="submit" className={buttonClass("secondary")}>
          Apply
        </button>
      </form>
      {data.rows.length === 0 ? (
        <EmptyState title={q ? "No customers match this search." : "No customers yet."} body="Add a customer before preparing their first quotation." />
      ) : (
        <Table caption="Customers">
          <thead>
            <tr>
              <Th>Customer</Th>
              <Th>Contact</Th>
              <Th numeric>Active subscriptions</Th>
              <Th numeric>Outstanding</Th>
              <Th>Updated</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((c) => (
              <tr key={c.id}>
                <Td>
                  <RowLink href={`/app/customers/${c.id}`}>{c.businessName}</RowLink>
                </Td>
                <Td>
                  {c.contactName}
                  <span className="block text-small text-ink-muted">{c.email}</span>
                </Td>
                <Td numeric>{c.activeSubscriptions}</Td>
                <Td numeric>{formatMoney(c.outstanding, org)}</Td>
                <Td>{formatDay(c.updatedAt, org.locale)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} hrefFor={(p) => `/app/customers?${new URLSearchParams({ q, page: String(p) })}`} />
    </>
  );
}
