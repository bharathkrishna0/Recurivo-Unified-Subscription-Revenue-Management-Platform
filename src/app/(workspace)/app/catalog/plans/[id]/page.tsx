import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/feedback/states";
import { Button } from "@/components/primitives/button";
import { RowLink, Table, Td, Th } from "@/components/data/table";
import { StatusLabel } from "@/components/data/status-label";
import { formatDateTime, formatMoney, intervalLabel } from "@/lib/formatting";
import { formatDateOnly, todayIn } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { isPlanSellable } from "@/lib/pricing";
import { planStatusAction } from "@/app/actions/catalog";
import { PlanForm } from "@/features/catalog/forms";
import { getPlan } from "@/server/catalog/plans";
import { requireStaffPage } from "@/server/identity/session";
import { AppError } from "@/server/platform/errors";

export const metadata: Metadata = { title: "Plan" };

async function load(id: string) {
  try {
    return await getPlan(id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}

export default async function PlanPage({ params, searchParams }: PageProps<"/app/catalog/plans/[id]">) {
  const user = await requireStaffPage();
  const { id } = await params;
  const { saved } = await searchParams;
  const plan = await load(id);
  const org = user.organization;
  const canEdit = can(user, "catalog.write");
  const sellable = isPlanSellable(plan, todayIn(org.timezone));
  return (
    <>
      <PageHeader
        title={plan.name}
        breadcrumbs={[{ label: "Plans", href: "/app/catalog/plans" }, { label: plan.name }]}
        description={
          <>
            <RowLink href={`/app/catalog/products/${plan.product.id}`}>{plan.product.name}</RowLink> · {formatMoney(plan.price.toString(), org)} per unit,
            billed {intervalLabel[plan.interval].toLowerCase()} · version {plan.version}
          </>
        }
        meta={
          <span className="flex gap-3">
            <StatusLabel status={plan.status} />
            <span>{sellable ? "Available for new sales" : "Not available for new sales"}</span>
          </span>
        }
        actions={
          canEdit ? (
            <form action={planStatusAction}>
              <input type="hidden" name="id" value={plan.id} />
              <input type="hidden" name="status" value={plan.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE"} />
              <Button type="submit" variant="secondary">
                {plan.status === "ACTIVE" ? "Archive plan" : "Restore plan"}
              </Button>
            </form>
          ) : null
        }
      />
      {saved ? (
        <div className="mb-6">
          <Notice role="status">Plan saved.</Notice>
        </div>
      ) : null}
      <section aria-labelledby="history" className="mb-10 flex flex-col gap-4">
        <SectionHeader id="history" title="Price history" />
        <Table caption="Plan versions">
          <thead>
            <tr>
              <Th>Version</Th>
              <Th numeric>Price per unit</Th>
              <Th numeric>Min. qty</Th>
              <Th>Published</Th>
            </tr>
          </thead>
          <tbody>
            {plan.versions.map((v) => (
              <tr key={v.id}>
                <Td>
                  v{v.version}
                  {v.version === plan.version ? " (current)" : ""}
                </Td>
                <Td numeric>{formatMoney(v.price.toString(), org)}</Td>
                <Td numeric>{v.minQuantity}</Td>
                <Td className="text-ink-muted">{formatDateTime(v.createdAt, org)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
      {canEdit ? (
        <section aria-labelledby="edit" className="flex flex-col gap-4">
          <SectionHeader id="edit" title="Edit plan" />
          <PlanForm
            products={[{ id: plan.product.id, name: plan.product.name }]}
            currency={org.currency}
            cancelHref={`/app/catalog/plans/${plan.id}`}
            activeSubscriptions={plan.activeSubscriptions}
            plan={{
              id: plan.id,
              productId: plan.productId,
              name: plan.name,
              interval: plan.interval,
              price: plan.price.toString(),
              minQuantity: String(plan.minQuantity),
              termLength: plan.termLength ? String(plan.termLength) : undefined,
              availableFrom: plan.availableFrom ? formatDateOnly(plan.availableFrom) : undefined,
              availableUntil: plan.availableUntil ? formatDateOnly(plan.availableUntil) : undefined,
              allowPause: plan.allowPause,
              allowEarlyClose: plan.allowEarlyClose,
              allowRenewal: plan.allowRenewal,
              autoCloseAtExpiry: plan.autoCloseAtExpiry,
              customerSelfService: plan.customerSelfService,
            }}
          />
        </section>
      ) : null}
    </>
  );
}
