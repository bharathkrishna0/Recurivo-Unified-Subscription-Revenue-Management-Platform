import { AppShell } from "@/components/layout/app-shell";
import { WORKSPACE_FOOTER_NAV, WORKSPACE_NAV } from "@/components/layout/nav";
import { can } from "@/lib/permissions";
import { requireStaffPage } from "@/server/identity/session";

export default async function WorkspaceLayout({ children }: LayoutProps<"/app">) {
  const user = await requireStaffPage();
  const nav = WORKSPACE_NAV.filter((item) => (!item.permission || can(user, item.permission)) && (!item.adminOnly || user.role === "ADMIN"));
  return (
    <AppShell
      nav={nav}
      footerNav={WORKSPACE_FOOTER_NAV}
      root="/app"
      orgName={user.organization.legalName}
      user={{ name: user.name, email: user.email, roleLabel: user.role === "ADMIN" ? "Administrator" : "Staff" }}
    >
      {children}
    </AppShell>
  );
}
