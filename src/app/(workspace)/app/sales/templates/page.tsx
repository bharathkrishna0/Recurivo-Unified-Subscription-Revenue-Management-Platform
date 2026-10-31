import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/states";
import { ButtonLink } from "@/components/primitives/button";
import { RowLink, Table, Td, Th } from "@/components/data/table";
import { StatusLabel } from "@/components/data/status-label";
import { intervalLabel } from "@/lib/formatting";
import { can } from "@/lib/permissions";
import { listTemplates } from "@/server/sales/templates";
import { requireStaffPage } from "@/server/identity/session";
import { SalesNav } from "../sales-nav";

export const metadata: Metadata = { title: "Quotation templates" };

export default async function TemplatesPage({ searchParams }: PageProps<"/app/sales/templates">) {
  const user = await requireStaffPage();
  const sp = await searchParams;
  const templates = await listTemplates({ status: sp.status });
  return (
    <>
      <PageHeader
        title="Sales"
        description="Templates prefill a quotation with a plan, lines, validity and terms."
        actions={can(user, "catalog.write") ? <ButtonLink href="/app/sales/templates/new">New template</ButtonLink> : null}
      />
      <SalesNav current="/app/sales/templates" />
      {templates.length === 0 ? (
        <EmptyState title="No templates yet." />
      ) : (
        <Table caption="Quotation templates">
          <thead>
            <tr>
              <Th>Template</Th>
              <Th>Plan</Th>
              <Th numeric>Lines</Th>
              <Th numeric>Valid for</Th>
              <Th numeric>Used by</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id}>
                <Td>
                  <RowLink href={`/app/sales/templates/${t.id}`}>{t.name}</RowLink>
                </Td>
                <Td>
                  {t.plan.name} · {intervalLabel[t.plan.interval]}
                </Td>
                <Td numeric>{t._count.lines}</Td>
                <Td numeric>{t.validityDays} days</Td>
                <Td numeric>{t._count.subscriptions}</Td>
                <Td>
                  <StatusLabel status={t.status} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
