import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/states";
import { ButtonLink } from "@/components/primitives/button";
import { inputClass } from "@/components/primitives/field";
import { ListFilters } from "@/components/data/list-filters";
import { Pagination, RowLink, Table, Td, Th } from "@/components/data/table";
import { StatusLabel } from "@/components/data/status-label";
import { formatDay, formatMoney, intervalLabel } from "@/lib/formatting";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/cn";
import { listPlans } from "@/server/catalog/plans";
import { requireStaffPage } from "@/server/identity/session";
import { CatalogNav } from "../catalog-nav";

export const metadata: Metadata = { title: "Plans" };

export default async function PlansPage({ searchParams }: PageProps<"/app/catalog/plans">) {
  const user = await requireStaffPage();
  const sp = await searchParams;
  const data = await listPlans(sp);
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "ACTIVE";
  const interval = typeof sp.interval === "string" ? sp.interval : "";
  const org = user.organization;
  return (
    <>
      <PageHeader
        title="Catalog"
        description="Recurring plans: billing period, price per unit and sale availability."
        actions={can(user, "catalog.write") ? <ButtonLink href="/app/catalog/plans/new">New plan</ButtonLink> : null}
      />
      <CatalogNav current="/app/catalog/plans" />
      <ListFilters
        q={q}
        status={status}
        searchLabel="Search plans or products"
        extra={
          <label className="flex flex-col gap-1.5 text-small font-semibold">
            Frequency
            <select name="interval" defaultValue={interval} className={cn(inputClass, "w-36")}>
              <option value="">Any</option>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="YEARLY">Yearly</option>
            </select>
          </label>
        }
      />
      {data.rows.length === 0 ? (
        <EmptyState title="No plans match these filters." body="Plans are created from a product." />
      ) : (
        <Table caption="Plans">
          <thead>
            <tr>
              <Th>Plan</Th>
              <Th>Product</Th>
              <Th>Frequency</Th>
              <Th numeric>Price per unit</Th>
              <Th numeric>Min. qty</Th>
              <Th>Available</Th>
              <Th>Version</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((p) => (
              <tr key={p.id}>
                <Td>
                  <RowLink href={`/app/catalog/plans/${p.id}`}>{p.name}</RowLink>
                </Td>
                <Td>{p.productName}</Td>
                <Td>{intervalLabel[p.interval]}</Td>
                <Td numeric>{formatMoney(p.price, org)}</Td>
                <Td numeric>{p.minQuantity}</Td>
                <Td className="text-ink-muted">
                  {p.availableFrom || p.availableUntil ? `${formatDay(p.availableFrom, org.locale) || "Any time"} – ${formatDay(p.availableUntil, org.locale) || "open"}` : "Always"}
                </Td>
                <Td>v{p.version}</Td>
                <Td>
                  <StatusLabel status={p.status} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination {...data} hrefFor={(page) => `?${new URLSearchParams({ q, status, interval, page: String(page) })}`} />
    </>
  );
}
