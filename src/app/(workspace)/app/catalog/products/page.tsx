import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/states";
import { ButtonLink } from "@/components/primitives/button";
import { ListFilters } from "@/components/data/list-filters";
import { Pagination, RowLink, Table, Td, Th } from "@/components/data/table";
import { StatusLabel } from "@/components/data/status-label";
import { formatDay, formatMoney } from "@/lib/formatting";
import { can } from "@/lib/permissions";
import { listProducts } from "@/server/catalog/products";
import { requireStaffPage } from "@/server/identity/session";
import { CatalogNav } from "../catalog-nav";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: PageProps<"/app/catalog/products">) {
  const user = await requireStaffPage();
  const sp = await searchParams;
  const data = await listProducts(sp);
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "ACTIVE";
  const org = user.organization;
  return (
    <>
      <PageHeader
        title="Catalog"
        description="Products and variants sold through recurring plans."
        actions={can(user, "catalog.write") ? <ButtonLink href="/app/catalog/products/new">New product</ButtonLink> : null}
      />
      <CatalogNav current="/app/catalog/products" />
      <ListFilters q={q} status={status} searchLabel="Search products" />
      {data.rows.length === 0 ? (
        <EmptyState title={q || status !== "ACTIVE" ? "No products match these filters." : "No products yet."} body="Products hold the base price that plans and variants build on." />
      ) : (
        <Table caption="Products">
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th numeric>Sale price</Th>
              <Th numeric>Active plans</Th>
              <Th numeric>Variants</Th>
              <Th>Status</Th>
              <Th>Updated</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((p) => (
              <tr key={p.id}>
                <Td>
                  <RowLink href={`/app/catalog/products/${p.id}`}>{p.name}</RowLink>
                </Td>
                <Td>{p.type === "SERVICE" ? "Service" : "Goods"}</Td>
                <Td numeric>{formatMoney(p.salePrice, org)}</Td>
                <Td numeric>{p.activePlans}</Td>
                <Td numeric>{p.variants}</Td>
                <Td>
                  <StatusLabel status={p.status} />
                </Td>
                <Td className="text-ink-muted">{formatDay(p.updatedAt, org.locale)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination {...data} hrefFor={(page) => `?${new URLSearchParams({ q, status, page: String(page) })}`} />
    </>
  );
}
