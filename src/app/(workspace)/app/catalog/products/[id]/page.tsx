import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { EmptyState, Notice } from "@/components/feedback/states";
import { Button, ButtonLink } from "@/components/primitives/button";
import { RowLink, Table, Td, Th } from "@/components/data/table";
import { StatusLabel } from "@/components/data/status-label";
import { formatMoney, intervalLabel } from "@/lib/formatting";
import { variantUnitPrice } from "@/lib/pricing";
import { productStatusAction, variantStatusAction } from "@/app/actions/catalog";
import { ProductForm, VariantForm } from "@/features/catalog/forms";
import { getProduct } from "@/server/catalog/products";
import { requireStaffPage } from "@/server/identity/session";
import { AppError } from "@/server/platform/errors";

export const metadata: Metadata = { title: "Product" };

async function load(id: string) {
  try {
    return await getProduct(id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}

export default async function ProductPage({ params, searchParams }: PageProps<"/app/catalog/products/[id]">) {
  const user = await requireStaffPage();
  const { id } = await params;
  const { saved } = await searchParams;
  const product = await load(id);
  const org = user.organization;
  const base = product.salePrice.toString();
  return (
    <>
      <PageHeader
        title={product.name}
        breadcrumbs={[{ label: "Catalog", href: "/app/catalog/products" }, { label: product.name }]}
        meta={<StatusLabel status={product.status} />}
        actions={
          product.canEdit ? (
            <form action={productStatusAction}>
              <input type="hidden" name="id" value={product.id} />
              <input type="hidden" name="status" value={product.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE"} />
              <Button type="submit" variant="secondary">
                {product.status === "ACTIVE" ? "Archive product" : "Restore product"}
              </Button>
            </form>
          ) : null
        }
      />
      {saved ? (
        <div className="mb-6">
          <Notice role="status">Product saved.</Notice>
        </div>
      ) : null}
      {product.status === "ARCHIVED" ? (
        <div className="mb-6">
          <Notice>Archived products and their plans cannot be newly sold. Existing subscriptions and invoices keep their references.</Notice>
        </div>
      ) : null}
      <section aria-labelledby="variants" className="mb-10 flex flex-col gap-4">
        <SectionHeader id="variants" title="Variants" />
        {product.variants.length === 0 ? (
          <p className="text-body text-ink-muted">No variants. Quotations use the base price of {formatMoney(base, org)}.</p>
        ) : (
          <Table caption="Variants">
            <thead>
              <tr>
                <Th>Variant</Th>
                <Th numeric>Adjustment</Th>
                <Th numeric>Unit price</Th>
                <Th>Status</Th>
                {product.canEdit ? <Th>Action</Th> : null}
              </tr>
            </thead>
            <tbody>
              {product.variants.map((v) => (
                <tr key={v.id}>
                  <Td>
                    {v.attribute}: <strong>{v.value}</strong>
                  </Td>
                  <Td numeric>{v.adjustmentType === "PERCENT" ? `${v.adjustmentValue.toString()}%` : formatMoney(v.adjustmentValue.toString(), org)}</Td>
                  <Td numeric>{formatMoney(variantUnitPrice(base, { adjustmentType: v.adjustmentType, adjustmentValue: v.adjustmentValue.toString() }, org.currency), org)}</Td>
                  <Td>
                    <StatusLabel status={v.status} />
                  </Td>
                  {product.canEdit ? (
                    <Td>
                      <form action={variantStatusAction}>
                        <input type="hidden" name="id" value={v.id} />
                        <input type="hidden" name="status" value={v.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE"} />
                        <Button type="submit" variant="tertiary" size="sm">
                          {v.status === "ACTIVE" ? "Archive" : "Restore"}
                        </Button>
                      </form>
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {product.canEdit && product.status === "ACTIVE" ? <VariantForm productId={product.id} basePrice={formatMoney(base, org, false)} currency={org.currency} /> : null}
      </section>
      <section aria-labelledby="plans" className="mb-10 flex flex-col gap-4">
        <SectionHeader
          id="plans"
          title="Plans"
          action={product.canEdit && product.status === "ACTIVE" ? <ButtonLink href={`/app/catalog/plans/new?productId=${product.id}`} variant="secondary" size="sm">New plan</ButtonLink> : null}
        />
        {product.plans.length === 0 ? (
          <EmptyState title="No plans for this product." body="A plan sets the billing period, price per unit and minimum quantity." />
        ) : (
          <Table caption="Plans for this product">
            <thead>
              <tr>
                <Th>Plan</Th>
                <Th>Frequency</Th>
                <Th numeric>Price</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {product.plans.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <RowLink href={`/app/catalog/plans/${p.id}`}>{p.name}</RowLink>
                  </Td>
                  <Td>{intervalLabel[p.interval]}</Td>
                  <Td numeric>{formatMoney(p.price.toString(), org)}</Td>
                  <Td>
                    <StatusLabel status={p.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
      {product.canEdit ? (
        <section aria-labelledby="edit" className="flex flex-col gap-4">
          <SectionHeader id="edit" title="Edit product" />
          <ProductForm
            currency={org.currency}
            cancelHref={`/app/catalog/products/${product.id}`}
            product={{
              id: product.id,
              name: product.name,
              type: product.type,
              salePrice: base,
              costPrice: product.costPrice?.toString(),
              notes: product.notes ?? undefined,
            }}
          />
        </section>
      ) : null}
    </>
  );
}
