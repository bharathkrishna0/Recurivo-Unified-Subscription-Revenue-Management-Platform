import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, Notice } from "@/components/feedback/states";
import { Button, ButtonLink } from "@/components/primitives/button";
import { RowLink, Table, Td, Th } from "@/components/data/table";
import { StatusLabel } from "@/components/data/status-label";
import { formatDay } from "@/lib/formatting";
import { todayIn } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { taxRuleInEffect } from "@/lib/pricing";
import { taxStatusAction } from "@/app/actions/settings";
import { listTaxRules } from "@/server/settings/taxes";
import { requireStaffPage } from "@/server/identity/session";
import { SettingsNav } from "../settings-nav";

export const metadata: Metadata = { title: "Taxes" };

export default async function TaxesPage({ searchParams }: PageProps<"/app/settings/taxes">) {
  const user = await requireStaffPage();
  const { saved } = await searchParams;
  const rules = await listTaxRules();
  const canEdit = can(user, "catalog.write");
  const today = todayIn(user.organization.timezone);
  return (
    <>
      <PageHeader title="Settings" description="Tax rules are applied automatically to quotation and invoice lines." actions={canEdit ? <ButtonLink href="/app/settings/taxes/new">New tax rule</ButtonLink> : null} />
      <SettingsNav current="/app/settings/taxes" user={user} />
      {saved ? (
        <div className="mb-6">
          <Notice role="status">Tax rule saved.</Notice>
        </div>
      ) : null}
      {rules.length === 0 ? (
        <EmptyState title="No tax rules yet." body="Without a tax rule, lines are taxed at zero." />
      ) : (
        <Table caption="Tax rules">
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Jurisdiction</Th>
              <Th numeric>Rate</Th>
              <Th>Applies to</Th>
              <Th>Effective</Th>
              <Th>Status</Th>
              {canEdit ? <Th>Action</Th> : null}
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
                <Td>{canEdit ? <RowLink href={`/app/settings/taxes/${r.id}`}>{r.name}</RowLink> : <strong>{r.name}</strong>}</Td>
                <Td>{r.jurisdiction ?? "—"}</Td>
                <Td numeric>{r.rate.toString()}%</Td>
                <Td>{r.scope === "ALL_PRODUCTS" ? "All products" : r.products.map((p) => p.name).join(", ")}</Td>
                <Td className="text-ink-muted">
                  {formatDay(r.effectiveFrom, user.organization.locale)} – {r.effectiveUntil ? formatDay(r.effectiveUntil, user.organization.locale) : "open"}
                  {taxRuleInEffect(r, today) ? " · in effect" : ""}
                </Td>
                <Td>
                  <StatusLabel status={r.status} />
                </Td>
                {canEdit ? (
                  <Td>
                    <form action={taxStatusAction}>
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
    </>
  );
}
