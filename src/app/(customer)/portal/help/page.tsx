import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/server/db";
import { requireCustomerPage } from "@/server/identity/session";

export const metadata: Metadata = { title: "Help" };

export default async function PortalHelp() {
  const user = await requireCustomerPage();
  const org = await db.organization.findUnique({ where: { id: user.organizationId }, select: { supportEmail: true, legalName: true } });
  return (
    <div className="max-w-[760px]">
      <PageHeader title="Help" description={`Questions about a charge or plan? Contact ${org?.legalName ?? "the business"}.`} />
      <p className="border-y border-line py-4">
        Support email: <span className="font-semibold">{org?.supportEmail ?? "Not configured"}</span>
      </p>
    </div>
  );
}
