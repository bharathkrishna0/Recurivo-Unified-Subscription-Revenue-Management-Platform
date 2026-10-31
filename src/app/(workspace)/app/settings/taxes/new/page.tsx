import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { TaxForm } from "@/features/settings/forms";
import { planProductOptions } from "@/server/catalog/plans";
import { requireStaffPage } from "@/server/identity/session";

export const metadata: Metadata = { title: "New tax rule" };

export default async function NewTaxPage() {
  await requireStaffPage("catalog.write");
  const products = await planProductOptions();
  return (
    <>
      <PageHeader title="New tax rule" breadcrumbs={[{ label: "Taxes", href: "/app/settings/taxes" }, { label: "New tax rule" }]} />
      <TaxForm products={products} />
    </>
  );
}
