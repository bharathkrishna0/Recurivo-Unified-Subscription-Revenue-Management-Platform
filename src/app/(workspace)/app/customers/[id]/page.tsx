import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { EmptyState, Notice } from "@/components/feedback/states";
import { ButtonLink } from "@/components/primitives/button";
import { RowLink, Table, Td, Th } from "@/components/data/table";
import { StatusLabel } from "@/components/data/status-label";
import { formatDay, formatMoney, intervalLabel } from "@/lib/formatting";
import { CustomerForm } from "@/features/sales/forms";
import { getCustomer } from "@/server/sales/customers";
import { requireStaffPage } from "@/server/identity/session";
import { AppError } from "@/server/platform/errors";

export const metadata: Metadata = { title: "Customer" };

async function load(id: string) {
  try {
    return await getCustomer(id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}

export default async function CustomerPage({ params, searchParams }: PageProps<"/app/customers/[id]">) {
  const user = await requireStaffPage();
  const { id } = await params;
  const { saved } = await searchParams;
  const c = await load(id);
  const org = user.organization;
  return (
    <>
      <PageHeader
        title={c.businessName}
        breadcrumbs={[{ label: "Customers", href: "/app/customers" }, { label: c.businessName }]}
        description={`${c.contactName} · ${c.email}`}
        meta={c.portalUser ? "Has portal access" : "No portal access"}
        actions={<ButtonLink href={`/app/sales/quotations/new?customerId=${c.id}`}>New quotation</ButtonLink>}
      />
      {saved ? (
        <div className="mb-6">
          <Notice role="status">Customer saved.</Notice>
        </div>
      ) : null}
      <dl className="mb-10 grid gap-4 border-y border-line py-4 sm:grid-cols-3">
        <div>
          <dt className="text-small text-ink-muted">Outstanding</dt>
          <dd className="tabular text-section font-semibold">{formatMoney(c.outstanding, org)}</dd>
        </div>
        <div>
          <dt className="text-small text-ink-muted">Billing address</dt>
          <dd className="whitespace-pre-line">{c.billingAddress ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-small text-ink-muted">Tax ID</dt>
          <dd>{c.taxId ?? "—"}</dd>
        </div>
      </dl>
      <section aria-labelledby="subs" className="mb-10 flex flex-col gap-4">
        <SectionHeader id="subs" title="Quotations and subscriptions" />
        {c.subscriptions.length === 0 ? (
          <EmptyState title="Nothing quoted yet." />
        ) : (
          <Table caption="Quotations and subscriptions">
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Plan</Th>
                <Th numeric>Amount per period</Th>
                <Th>Next bill</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {c.subscriptions.map((s) => (
                <tr key={s.id}>
                  <Td>
                    <RowLink href={`/app/subscriptions/${s.id}`}>{s.number}</RowLink>
                  </Td>
                  <Td>
                    {s.plan.name} · {intervalLabel[s.plan.interval]}
                  </Td>
                  <Td numeric>{formatMoney(s.total.toString(), org)}</Td>
                  <Td>{formatDay(s.nextBillDate, org.locale)}</Td>
                  <Td>
                    <StatusLabel status={s.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
      <section aria-labelledby="edit" className="flex flex-col gap-4">
        <SectionHeader id="edit" title="Edit customer" />
        <CustomerForm
          cancelHref={`/app/customers/${c.id}`}
          customer={{
            id: c.id,
            businessName: c.businessName,
            contactName: c.contactName,
            email: c.email,
            phone: c.phone ?? undefined,
            billingAddress: c.billingAddress ?? undefined,
            taxId: c.taxId ?? undefined,
          }}
        />
      </section>
    </>
  );
}
