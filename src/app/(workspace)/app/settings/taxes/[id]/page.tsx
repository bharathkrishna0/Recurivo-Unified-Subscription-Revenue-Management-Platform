import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { formatDateOnly } from "@/lib/dates";
import { TaxForm } from "@/features/settings/forms";
import { planProductOptions } from "@/server/catalog/plans";
import { getTaxRule } from "@/server/settings/taxes";
import { requireStaffPage } from "@/server/identity/session";
import { AppError } from "@/server/platform/errors";

export const metadata: Metadata = { title: "Tax rule" };

export default async function TaxPage({ params }: PageProps<"/app/settings/taxes/[id]">) {
  await requireStaffPage("catalog.write");
  const { id } = await params;
  const rule = await getTaxRule(id).catch((error) => {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  });
  const products = await planProductOptions();
  return (
    <>
      <PageHeader title={rule.name} breadcrumbs={[{ label: "Taxes", href: "/app/settings/taxes" }, { label: rule.name }]} />
      <TaxForm
        products={products}
        tax={{
          id: rule.id,
          name: rule.name,
          jurisdiction: rule.jurisdiction ?? "",
          rate: rule.rate.toString(),
          scope: rule.scope,
          productIds: rule.products.map((p) => p.id),
          effectiveFrom: formatDateOnly(rule.effectiveFrom),
          effectiveUntil: rule.effectiveUntil ? formatDateOnly(rule.effectiveUntil) : "",
        }}
      />
    </>
  );
}
