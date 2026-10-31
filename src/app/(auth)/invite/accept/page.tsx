import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/feedback/states";
import { AcceptInvitationForm } from "@/features/settings/forms";
import { findPendingInvitation } from "@/server/identity/team";

export const metadata: Metadata = { title: "Join your team", referrer: "no-referrer" };

export default async function AcceptInvitationPage({ searchParams }: PageProps<"/invite/accept">) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";
  const invite = await findPendingInvitation(value);
  return (
    <>
      <h1 className="mb-2 text-title font-semibold">Join your team</h1>
      {invite ? (
        <>
          <p className="mb-8 text-body text-ink-muted">
            {invite.organization.legalName} invited {invite.email} to Recurivo.
          </p>
          <AcceptInvitationForm token={value} name={invite.name ?? ""} minLength={invite.organization.passwordMinLength} />
        </>
      ) : (
        <div className="flex flex-col gap-6">
          <Notice tone="strong" role="alert">
            This invitation is invalid, already used or expired. Ask an administrator to send a new one.
          </Notice>
          <Link href="/login" className="text-body font-semibold underline underline-offset-4 hover:underline">
            Go to sign in
          </Link>
        </div>
      )}
    </>
  );
}
