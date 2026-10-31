import type { Metadata } from "next";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { Button } from "@/components/primitives/button";
import { Table, Td, Th } from "@/components/data/table";
import { StatusLabel } from "@/components/data/status-label";
import { formatDateTime } from "@/lib/formatting";
import { STAFF_PERMISSIONS } from "@/lib/permissions";
import { revokeInvitationAction, staffStatusAction } from "@/app/actions/settings";
import { InviteForm, PermissionsForm } from "@/features/settings/forms";
import { listTeam } from "@/server/identity/team";
import { requireStaffPage } from "@/server/identity/session";
import { redirect } from "next/navigation";
import { SettingsNav } from "../settings-nav";

export const metadata: Metadata = { title: "Team" };

const PERMS = Object.entries(STAFF_PERMISSIONS) as [string, string][];

export default async function TeamPage() {
  const user = await requireStaffPage();
  if (user.role !== "ADMIN") redirect("/app/settings");
  const { members, invitations, currentUserId } = await listTeam();
  const org = user.organization;
  return (
    <>
      <PageHeader title="Settings" description="Staff accounts and what each person can do." />
      <SettingsNav current="/app/settings/team" user={user} />
      <section aria-labelledby="members" className="mb-10 flex flex-col gap-4">
        <SectionHeader id="members" title="Members" />
        <Table caption="Team members">
          <thead>
            <tr>
              <Th>Person</Th>
              <Th>Role</Th>
              <Th>Access</Th>
              <Th>Last sign-in</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const editable = m.role === "STAFF" && m.id !== currentUserId;
              return (
                <tr key={m.id}>
                  <Td className="py-3 align-top">
                    <strong>{m.name}</strong>
                    <div className="text-small text-ink-muted">{m.email}</div>
                  </Td>
                  <Td className="py-3 align-top">{m.role === "ADMIN" ? "Administrator" : "Staff"}</Td>
                  <Td className="py-3 align-top">
                    {editable ? (
                      <details>
                        <summary className="cursor-pointer text-body">{m.permissions.length ? m.permissions.join(", ") : "Read only"}</summary>
                        <div className="mt-3">
                          <PermissionsForm userId={m.id} current={m.permissions} permissions={PERMS} />
                        </div>
                      </details>
                    ) : m.role === "ADMIN" ? (
                      "Everything"
                    ) : (
                      m.permissions.join(", ") || "Read only"
                    )}
                  </Td>
                  <Td className="py-3 align-top text-ink-muted">{m.lastLoginAt ? formatDateTime(m.lastLoginAt, org) : "Never"}</Td>
                  <Td className="py-3 align-top">
                    <div className="flex flex-col items-start gap-2">
                      <StatusLabel status={m.status} />
                      {editable ? (
                        <form action={staffStatusAction}>
                          <input type="hidden" name="userId" value={m.id} />
                          <input type="hidden" name="status" value={m.status === "ACTIVE" ? "DISABLED" : "ACTIVE"} />
                          <Button type="submit" variant="tertiary" size="sm">
                            {m.status === "ACTIVE" ? "Disable" : "Re-enable"}
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </section>
      {invitations.length ? (
        <section aria-labelledby="pending" className="mb-10 flex flex-col gap-4">
          <SectionHeader id="pending" title="Pending invitations" />
          <Table caption="Pending invitations">
            <thead>
              <tr>
                <Th>Email</Th>
                <Th>Access</Th>
                <Th>Expires</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((i) => (
                <tr key={i.id}>
                  <Td>{i.email}</Td>
                  <Td>{i.permissions.join(", ") || "Read only"}</Td>
                  <Td className="text-ink-muted">{formatDateTime(i.expiresAt, org)}</Td>
                  <Td>
                    <form action={revokeInvitationAction}>
                      <input type="hidden" name="id" value={i.id} />
                      <Button type="submit" variant="tertiary" size="sm">
                        Revoke
                      </Button>
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      ) : null}
      <section aria-labelledby="invite" className="flex flex-col gap-4">
        <SectionHeader id="invite" title="Invite staff" />
        <InviteForm permissions={PERMS} />
      </section>
    </>
  );
}
