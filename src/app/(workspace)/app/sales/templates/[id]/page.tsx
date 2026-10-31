import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/feedback/states";
import { Button } from "@/components/primitives/button";
import { Table, Td, Th } from "@/components/data/table";
import { StatusLabel } from "@/components/data/status-label";
import { can } from "@/lib/permissions";
import { templateStatusAction } from "@/app/actions/sales";
import { TemplateForm } from "@/features/sales/forms";
import { getTemplate } from "@/server/sales/templates";
import { quoteFormOptions } from "@/server/sales/subscriptions";
import { requireStaffPage } from "@/server/identity/session";
import { AppError } from "@/server/platform/errors";

export const metadata: Metadata = { title: "Template" };

async function load(id: string) {
  try {
    return await getTemplate(id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}

export default async function TemplatePage({ params, searchParams }: PageProps<"/app/sales/templates/[id]">) {
  const user = await requireStaffPage();
  const { id } = await params;
  const { saved } = await searchParams;
  const t = await load(id);
  const editable = can(user, "catalog.write");
  const options = editable ? await quoteFormOptions() : null;
  return (
    <>
      <PageHeader
        title={t.name}
        breadcrumbs={[{ label: "Templates", href: "/app/sales/templates" }, { label: t.name }]}
        description={`${t.plan.name} · valid ${t.validityDays} days after sending`}
        meta={<StatusLabel status={t.status} />}
        actions={
          editable ? (
            <form action={templateStatusAction}>
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="status" value={t.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE"} />
              <Button type="submit" variant="secondary">
                {t.status === "ACTIVE" ? "Archive template" : "Restore template"}
              </Button>
            </form>
          ) : null
        }
      />
      {saved ? (
        <div className="mb-6">
          <Notice role="status">Template saved. Existing quotations are not changed.</Notice>
        </div>
      ) : null}
      {options ? (
        <TemplateForm
          plans={options.plans}
          products={options.products}
          cancelHref="/app/sales/templates"
          template={{
            id: t.id,
            name: t.name,
            planId: t.planId,
            validityDays: String(t.validityDays),
            paymentTermsDays: t.paymentTermsDays === null ? undefined : String(t.paymentTermsDays),
            terms: t.terms ?? undefined,
            lines: t.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })),
          }}
        />
      ) : (
        <section aria-labelledby="lines" className="flex flex-col gap-4">
          <SectionHeader id="lines" title="Lines" />
          <Table caption="Template lines">
            <thead>
              <tr>
                <Th>Product</Th>
                <Th numeric>Quantity</Th>
              </tr>
            </thead>
            <tbody>
              {t.lines.map((l) => (
                <tr key={l.id}>
                  <Td>{l.variant ? `${l.product.name} — ${l.variant.attribute}: ${l.variant.value}` : l.product.name}</Td>
                  <Td numeric>{l.quantity}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      )}
    </>
  );
}
