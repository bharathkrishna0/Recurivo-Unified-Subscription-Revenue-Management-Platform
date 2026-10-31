import type { Metadata } from "next";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { EmptyState, Notice } from "@/components/feedback/states";
import { Button } from "@/components/primitives/button";
import { Table, Td, Th } from "@/components/data/table";
import { StatusLabel } from "@/components/data/status-label";
import { formatDay, formatMoney } from "@/lib/formatting";
import { formatDateOnly, todayIn } from "@/lib/dates";
import { discountState } from "@/lib/pricing";
import { discountStatusAction } from "@/app/actions/settings";
import { DiscountForm } from "@/features/settings/forms";
import { planProductOptions } from "@/server/catalog/plans";
import { listDiscountRules } from "@/server/settings/discounts";
import { requireStaffPage } from "@/server/identity/session";
import { SettingsNav } from "../settings-nav";

export const metadata: Metadata = { title: "Discounts" };

export default async function DiscountsPage({ searchParams }: PageProps<"/app/settings/discounts">) {
  const user = await requireStaffPage();
  const { saved } = await searchParams;
  const isAdmin = user.role === "ADMIN";
  const [rules, products] = await Promise.all([listDiscountRules(), isAdmin ? planProductOptions() : Promise.resolve([])]);
  const org = user.organization;
  const today = todayIn(org.timezone);
  return (
    <>
      <PageHeader title="Settings" description="Discount rules. Only administrators can create or change them." />
      <SettingsNav current="/app/settings/discounts" user={user} />
      {saved ? (
        <div className="mb-6">
          <Notice role="status">Discount activated.</Notice>
        </div>
      ) : null}
      {rules.length === 0 ? (
        <EmptyState title="No discount rules yet." />
      ) : (
        <Table caption="Discount rules">
          <thead>
            <tr>
              <Th>Name</Th>
              <Th numeric>Value</Th>
              <Th>Applies to</Th>
              <Th>Eligibility</Th>
              <Th>Validity</Th>
              <Th numeric>Used</Th>
              <Th>State</Th>
              {isAdmin ? <Th>Action</Th> : null}
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
                <Td>
                  <strong>{r.name}</strong>
                </Td>
                <Td numeric>{r.type === "PERCENT" ? `${r.value.toString()}%` : formatMoney(r.value.toString(), org)}</Td>
                <Td>{r.scope === "SUBSCRIPTION" ? "Whole subscription" : (r.product?.name ?? "Product")}</Td>
                <Td className="text-ink-muted">
                  {[r.minQuantity ? `qty ≥ ${r.minQuantity}` : null, r.minAmount ? `amount ≥ ${formatMoney(r.minAmount.toString(), org)}` : null].filter(Boolean).join(", ") || "Any"}
                </Td>
                <Td className="text-ink-muted">
                  {formatDay(r.startsAt, org.locale)} – {r.endsAt ? formatDay(r.endsAt, org.locale) : "open"}
                </Td>
                <Td numeric>
                  {r.usageCount}
                  {r.usageLimit ? ` / ${r.usageLimit}` : ""}
                </Td>
                <Td>
                  <StatusLabel status={discountState(r, today)} />
                </Td>
                {isAdmin ? (
                  <Td>
                    <form action={discountStatusAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="status" value={r.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE"} />
                      <Button type="submit" variant="tertiary" size="sm">
                        {r.status === "ACTIVE" ? "Archive" : "Restore"}
                      </Button>
                    </form>
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {isAdmin ? (
        <section aria-labelledby="new-discount" className="mt-10 flex flex-col gap-4">
          <SectionHeader id="new-discount" title="New discount" />
          <DiscountForm products={products} currency={org.currency} today={formatDateOnly(today)} />
        </section>
      ) : null}
    </>
  );
}
