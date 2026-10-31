/**
 * Permission vocabulary. The API enforces these; the UI only uses them to
 * decide which controls to show.
 */
export const STAFF_PERMISSIONS = {
  "catalog.write": "Create and edit products, plans, taxes and quotation templates",
  "subscriptions.all": "Manage every subscription, not only ones assigned to them",
  "billing.manage": "Confirm, send and cancel invoices; retry billing exceptions",
  "payments.record": "Record and reverse payments (finance access)",
  "reports.view": "View revenue, collections and overdue reporting",
} as const;

export type Permission = keyof typeof STAFF_PERMISSIONS;
export type RoleName = "ADMIN" | "STAFF" | "CUSTOMER";

export const STAFF_PROFILES: Record<string, { label: string; permissions: Permission[] }> = {
  sales: { label: "Sales", permissions: [] },
  operations: { label: "Operations", permissions: ["catalog.write", "subscriptions.all", "billing.manage"] },
  finance: { label: "Finance lead", permissions: ["billing.manage", "payments.record", "reports.view"] },
};

export interface PermissionSubject {
  role: RoleName;
  permissions: readonly string[];
}

export function can(subject: PermissionSubject, permission: Permission): boolean {
  if (subject.role === "ADMIN") return true;
  if (subject.role !== "STAFF") return false;
  return subject.permissions.includes(permission);
}

export function isInternal(subject: PermissionSubject): boolean {
  return subject.role === "ADMIN" || subject.role === "STAFF";
}

export function sanitizePermissions(input: readonly string[]): Permission[] {
  return input.filter((p): p is Permission => p in STAFF_PERMISSIONS);
}
