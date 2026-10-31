import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/states";
import { buttonClass } from "@/components/primitives/button";
import { inputClass } from "@/components/primitives/field";
import { Pagination, Table, Td, Th } from "@/components/data/table";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/formatting";
import { requireStaffPage } from "@/server/identity/session";
import { listAuditEvents } from "@/server/reports/audit";
import { SettingsNav } from "../settings-nav";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: PageProps<"/app/settings/audit">) {
  const user = await requireStaffPage();
  const sp = await searchParams;
  const data = await listAuditEvents(sp);
  const v = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const query = { q: v("q"), objectType: v("objectType"), from: v("from"), to: v("to") };
  const ctx = user.organization;
  return (
    <>
      <PageHeader title="Settings" description="Every change to financial records, permissions and settings, newest first. Entries cannot be edited or deleted." />
      <SettingsNav current="/app/settings/audit" user={user} />
      <form method="get" role="search" className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1.5 text-small font-semibold">
          Search summary, actor or action
          <input name="q" type="search" defaultValue={query.q} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-small font-semibold">
          Record type
          <select name="objectType" defaultValue={query.objectType} className={cn(inputClass, "w-44")}>
            <option value="">All</option>
            {data.objectTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-small font-semibold">
          From
          <input name="from" type="date" defaultValue={query.from} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-small font-semibold">
          To
          <input name="to" type="date" defaultValue={query.to} className={inputClass} />
        </label>
        <button type="submit" className={buttonClass("secondary")}>
          Apply
        </button>
        <a href={`/api/v1/exports/audit?${new URLSearchParams(query)}`} className={buttonClass("secondary")}>
          Export CSV
        </a>
      </form>
      {data.rows.length === 0 ? (
        <EmptyState title="No audit entries match these filters." />
      ) : (
        <Table caption="Audit log">
          <thead>
            <tr>
              <Th>When ({ctx.timezone})</Th>
              <Th>Actor</Th>
              <Th>Action</Th>
              <Th>Summary</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((e) => (
              <tr key={e.id}>
                <Td className="whitespace-nowrap">{formatDateTime(e.createdAt, ctx)}</Td>
                <Td>{e.actorLabel}</Td>
                <Td className="font-mono text-small">{e.action}</Td>
                <Td>{e.summary}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} hrefFor={(p) => `/app/settings/audit?${new URLSearchParams({ ...query, page: String(p) })}`} />
    </>
  );
}
