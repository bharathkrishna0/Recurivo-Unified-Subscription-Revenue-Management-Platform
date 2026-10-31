import type { Permission } from "@/lib/permissions";

export interface NavItem {
  label: string;
  href: string;
  icon: "overview" | "customers" | "catalog" | "sales" | "subscriptions" | "billing" | "insights" | "settings" | "help" | "account";
  permission?: Permission;
  adminOnly?: boolean;
}

export const WORKSPACE_NAV: NavItem[] = [
  { label: "Overview", href: "/app", icon: "overview" },
  { label: "Customers", href: "/app/customers", icon: "customers" },
  { label: "Catalog", href: "/app/catalog", icon: "catalog" },
  { label: "Sales", href: "/app/sales", icon: "sales" },
  { label: "Subscriptions", href: "/app/subscriptions", icon: "subscriptions" },
  { label: "Billing", href: "/app/billing", icon: "billing" },
  { label: "Insights", href: "/app/insights", icon: "insights", permission: "reports.view" },
];

export const WORKSPACE_FOOTER_NAV: NavItem[] = [
  { label: "Settings", href: "/app/settings", icon: "settings" },
  { label: "Help", href: "/app/help", icon: "help" },
];

export const PORTAL_NAV: NavItem[] = [
  { label: "Home", href: "/portal", icon: "overview" },
  { label: "My subscriptions", href: "/portal/subscriptions", icon: "subscriptions" },
  { label: "Invoices & payments", href: "/portal/billing", icon: "billing" },
  { label: "Account", href: "/portal/account", icon: "account" },
  { label: "Help", href: "/portal/help", icon: "help" },
];
