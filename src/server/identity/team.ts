import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { sanitizePermissions, STAFF_PERMISSIONS } from "@/lib/permissions";
import { checkPassword, normalizeEmail } from "@/lib/validation/password";
import { recordAudit } from "@/server/platform/audit";
import { randomToken, sha256 } from "@/server/platform/crypto";
import { AppError, invalid, notFound } from "@/server/platform/errors";
import { enqueueOutbox } from "@/server/platform/outbox";
import { consumeRateLimit } from "@/server/platform/rate-limit";
import { requireAdminFor } from "./access";
import { hashPassword } from "./password";
import { isUniqueViolation, parseOrThrow } from "./service";
import { actorOf, createSession, revokeAllSessions } from "./session";

const INVITE_DAYS = 7;
const permissionList = z.array(z.enum(Object.keys(STAFF_PERMISSIONS) as [string, ...string[]])).max(10);

export const inviteSchema = z.object({
  name: z.string().trim().min(1, "Enter the person's name").max(120),
  email: z.email("Enter a valid email address").max(254),
  permissions: permissionList,
});

export const acceptSchema = z.object({
  token: z.string().min(16).max(128),
  name: z.string().trim().min(1, "Enter your name").max(120),
  password: z.string().max(256),
});

export async function listTeam() {
  const admin = await requireAdminFor("team.view");
  const [members, invitations] = await Promise.all([
    db.user.findMany({
      where: { organizationId: admin.organizationId, role: { in: ["ADMIN", "STAFF"] } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, role: true, permissions: true, status: true, lastLoginAt: true },
    }),
    db.staffInvitation.findMany({
      where: { organizationId: admin.organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { members, invitations, currentUserId: admin.id };
}

/** Only administrators may invite staff (AUTH-05). The token is emailed once and stored hashed. */
export async function inviteStaff(input: unknown): Promise<{ id: string }> {
  const admin = await requireAdminFor("staff.invite");
  const data = parseOrThrow(inviteSchema, input);
  const email = normalizeEmail(data.email);
  await consumeRateLimit(`invite:${admin.id}`, 30, 60 * 60);
  if (await db.user.findUnique({ where: { email } })) {
    throw new AppError("CONFLICT", "This email already has an account.", { email: "Already registered" });
  }
  const token = randomToken();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  return db.$transaction(async (tx) => {
    await tx.staffInvitation.updateMany({
      where: { organizationId: admin.organizationId, email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const invite = await tx.staffInvitation.create({
      data: {
        organizationId: admin.organizationId,
        email,
        name: data.name,
        role: "STAFF",
        permissions: sanitizePermissions(data.permissions),
        tokenHash: sha256(token),
        invitedById: admin.id,
        expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
      },
    });
    await enqueueOutbox(tx, "email.send", `staff-invite:${invite.id}`, {
      to: email,
      subject: `You're invited to ${admin.organization.legalName} on Recurivo`,
      text: `Hello ${data.name},\n\n${admin.name} invited you to join ${admin.organization.legalName} on Recurivo.\nAccept within ${INVITE_DAYS} days:\n${appUrl}/invite/accept?token=${token}\n\nIf you were not expecting this, you can ignore this email.`,
    });
    await recordAudit(tx, actorOf(admin), {
      action: "staff.invited",
      objectType: "StaffInvitation",
      objectId: invite.id,
      summary: `Invited ${email} as staff`,
      changes: { permissions: invite.permissions },
    });
    return { id: invite.id };
  });
}

export async function revokeInvitation(id: string): Promise<void> {
  const admin = await requireAdminFor("staff.invite.revoke");
  await db.$transaction(async (tx) => {
    const res = await tx.staffInvitation.updateMany({
      where: { id, organizationId: admin.organizationId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (res.count !== 1) throw notFound("Invitation not found.");
    await recordAudit(tx, actorOf(admin), { action: "staff.invite_revoked", objectType: "StaffInvitation", objectId: id, summary: "Revoked a staff invitation" });
  });
}

export async function findPendingInvitation(token: string) {
  if (!token) return null;
  const invite = await db.staffInvitation.findUnique({ where: { tokenHash: sha256(token) }, include: { organization: true } });
  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt < new Date()) return null;
  return invite;
}

export async function acceptInvitation(input: unknown, ip: string): Promise<void> {
  const data = parseOrThrow(acceptSchema, input);
  await consumeRateLimit(`invite-accept:${ip}`, 20, 15 * 60);
  const invite = await findPendingInvitation(data.token);
  if (!invite) throw invalid("This invitation is invalid, already used or expired.", { token: "Invalid or expired invitation" });
  const pw = checkPassword(data.password, invite.organization.passwordMinLength);
  if (!pw.ok) throw invalid("Password does not meet the requirements.", { password: `Needs: ${pw.failures.join(", ")}` });
  const passwordHash = await hashPassword(data.password);
  let userId: string;
  try {
    userId = await db.$transaction(async (tx) => {
      const consumed = await tx.staffInvitation.updateMany({
        where: { id: invite.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (consumed.count !== 1) throw invalid("This invitation has already been used.", { token: "Already used" });
      const user = await tx.user.create({
        data: {
          organizationId: invite.organizationId,
          email: invite.email,
          name: data.name,
          passwordHash,
          role: invite.role === "ADMIN" ? "ADMIN" : "STAFF",
          permissions: sanitizePermissions(invite.permissions),
          lastLoginAt: new Date(),
        },
      });
      await recordAudit(tx, { id: user.id, label: `${user.name} <${user.email}>`, organizationId: invite.organizationId }, {
        action: "staff.joined",
        objectType: "User",
        objectId: user.id,
        summary: `${user.email} accepted a staff invitation`,
      });
      return user.id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError("CONFLICT", "An account with this email already exists. Sign in instead.");
    throw error;
  }
  await createSession(userId);
}

async function loadStaffTarget(organizationId: string, adminId: string, userId: string) {
  const target = await db.user.findFirst({ where: { id: userId, organizationId, role: { in: ["ADMIN", "STAFF"] } } });
  if (!target) throw notFound("Team member not found.");
  if (target.id === adminId) throw invalid("You cannot change your own access.");
  if (target.role === "ADMIN") throw invalid("Administrator access is managed outside the workspace.");
  return target;
}

/** Privilege changes require explicit confirmation and are audited with before/after values. */
export async function updateStaffPermissions(userId: string, permissions: unknown, confirmed: boolean): Promise<void> {
  const admin = await requireAdminFor("staff.permissions");
  const next = sanitizePermissions(parseOrThrow(permissionList, permissions));
  if (!confirmed) throw invalid("Confirm the access change before saving.", { confirm: "Required for permission changes" });
  const target = await loadStaffTarget(admin.organizationId, admin.id, userId);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: target.id }, data: { permissions: next } });
    await recordAudit(tx, actorOf(admin), {
      action: "staff.permissions_changed",
      objectType: "User",
      objectId: target.id,
      summary: `Changed permissions for ${target.email}`,
      changes: { from: target.permissions, to: next },
    });
  });
}

export async function setStaffStatus(userId: string, status: "ACTIVE" | "DISABLED"): Promise<void> {
  const admin = await requireAdminFor(status === "DISABLED" ? "staff.disable" : "staff.enable");
  const target = await loadStaffTarget(admin.organizationId, admin.id, userId);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: target.id }, data: { status } });
    await recordAudit(tx, actorOf(admin), {
      action: status === "DISABLED" ? "staff.disabled" : "staff.enabled",
      objectType: "User",
      objectId: target.id,
      summary: `${status === "DISABLED" ? "Disabled" : "Re-enabled"} ${target.email}`,
    });
  });
  if (status === "DISABLED") await revokeAllSessions(target.id);
}
