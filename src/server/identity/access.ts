import "server-only";
import { db } from "@/server/db";
import { can, type Permission } from "@/lib/permissions";
import { recordAudit } from "@/server/platform/audit";
import { forbidden } from "@/server/platform/errors";
import { actorOf, requireUser, type CurrentUser } from "./session";

/** Denials of privileged actions are written to the audit log (AUTH-05, DIS-01). */
async function deny(user: CurrentUser, attempted: string, message: string): Promise<never> {
  await recordAudit(db, actorOf(user), {
    action: "access.denied",
    objectType: "Permission",
    objectId: attempted,
    summary: `Denied ${attempted} for ${user.role.toLowerCase()} ${user.email}`,
  });
  throw forbidden(message);
}

export async function requireAdminFor(attempted: string): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") await deny(user, attempted, "Only administrators can do that.");
  return user;
}

export async function requirePermissionFor(permission: Permission, attempted: string): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user, permission)) await deny(user, attempted, "You do not have permission to do that.");
  return user;
}
