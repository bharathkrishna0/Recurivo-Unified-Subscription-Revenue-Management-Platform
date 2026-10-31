import { SubNav } from "@/components/data/table";
import type { CurrentUser } from "@/server/identity/session";

export function SettingsNav({ current, user }: { current: string; user: CurrentUser }) {
  const items = [
    { label: "Organization", href: "/app/settings" },
    { label: "Taxes", href: "/app/settings/taxes" },
    { label: "Discounts", href: "/app/settings/discounts" },
    ...(user.role === "ADMIN" ? [{ label: "Team", href: "/app/settings/team" }] : []),
  ];
  return <SubNav current={current} items={items} />;
}
