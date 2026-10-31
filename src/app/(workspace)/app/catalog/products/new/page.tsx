import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ProductForm } from "@/features/catalog/forms";
import { requireStaffPage } from "@/server/identity/session";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  const user = await requireStaffPage("catalog.write");
  return (
    <>
      <PageHeader title="New product" breadcrumbs={[{ label: "Catalog", href: "/app/catalog/products" }, { label: "New product" }]} />
      <ProductForm currency={user.organization.currency} cancelHref="/app/catalog/products" />
    </>
  );
}
