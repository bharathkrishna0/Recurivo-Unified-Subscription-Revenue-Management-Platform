import { AppShell } from "@/components/layout/app-shell";
import { PORTAL_NAV } from "@/components/layout/nav";
import { requireCustomerPage } from "@/server/identity/session";

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const user = await requireCustomerPage();
  return (
    <AppShell nav={PORTAL_NAV} root="/portal" orgName={user.organization.legalName} user={{ name: user.name, email: user.email, roleLabel: "Customer" }}>
      {children}
    </AppShell>
  );
}
