import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/feedback/states";
import { OrganizationForm } from "@/features/settings/forms";
import { getOrganizationSettings } from "@/server/settings/organization";
import { requireStaffPage } from "@/server/identity/session";
import { SettingsNav } from "./settings-nav";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireStaffPage();
  const { org, currencyLocked } = await getOrganizationSettings();
  const isAdmin = user.role === "ADMIN";
  return (
    <>
      <PageHeader title="Settings" description="Organization defaults, taxes, discounts and team access." />
      <SettingsNav current="/app/settings" user={user} />
      {isAdmin ? (
        <OrganizationForm
          currencyLocked={currencyLocked}
          org={{
            legalName: org.legalName,
            supportEmail: org.supportEmail ?? "",
            currency: org.currency,
            timezone: org.timezone,
            locale: org.locale,
            paymentTermsDays: String(org.paymentTermsDays),
            passwordMinLength: String(org.passwordMinLength),
          }}
        />
      ) : (
        <div className="flex max-w-[760px] flex-col gap-4">
          <Notice>Only administrators can change organization settings.</Notice>
          <dl className="grid grid-cols-[200px_1fr] gap-y-3 text-body">
            <dt className="text-ink-muted">Legal name</dt>
            <dd>{org.legalName}</dd>
            <dt className="text-ink-muted">Currency</dt>
            <dd>{org.currency}</dd>
            <dt className="text-ink-muted">Time zone</dt>
            <dd>{org.timezone}</dd>
            <dt className="text-ink-muted">Payment terms</dt>
            <dd>{org.paymentTermsDays} days</dd>
          </dl>
        </div>
      )}
    </>
  );
}
