import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/states";
import { ButtonLink } from "@/components/primitives/button";
import { PlanForm } from "@/features/catalog/forms";
import { planProductOptions } from "@/server/catalog/plans";
import { requireStaffPage } from "@/server/identity/session";

export const metadata: Metadata = { title: "New plan" };

export default async function NewPlanPage({ searchParams }: PageProps<"/app/catalog/plans/new">) {
  const user = await requireStaffPage("catalog.write");
  const { productId } = await searchParams;
  const products = await planProductOptions();
  return (
    <>
      <PageHeader title="New plan" breadcrumbs={[{ label: "Plans", href: "/app/catalog/plans" }, { label: "New plan" }]} />
      {products.length === 0 ? (
        <EmptyState title="Create a product first." body="Every plan prices an active product." action={<ButtonLink href="/app/catalog/products/new">New product</ButtonLink>} />
      ) : (
        <PlanForm
          products={products}
          currency={user.organization.currency}
          cancelHref="/app/catalog/plans"
          plan={{ productId: typeof productId === "string" ? productId : undefined }}
        />
      )}
    </>
  );
}
