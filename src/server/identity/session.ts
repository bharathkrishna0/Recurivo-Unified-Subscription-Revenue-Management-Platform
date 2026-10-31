import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { randomToken, sha256 } from "@/server/platform/crypto";
import { AppError, forbidden } from "@/server/platform/errors";
import { can, type Permission, type RoleName } from "@/lib/permissions";

export const SESSION_COOKIE = "recurivo_session";
const SESSION_DAYS = 14;
const IDLE_REFRESH_MS = 60 * 60 * 1000;

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: RoleName;
  permissions: string[];
  organizationId: string;
  customerId: string | null;
  organization: { id: string; legalName: string; currency: string; timezone: string; locale: string };
}

export async function createSession(userId: string): Promise<void> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const ua = (await headers()).get("user-agent")?.slice(0, 255) ?? null;
  await db.session.create({ data: { userId, tokenHash: sha256(token), expiresAt, userAgent: ua } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }
  store.delete(SESSION_COOKIE);
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

/** Resolve the session cookie against the database. Memoized per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { organization: true, customer: { select: { id: true } } } } },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date() || session.user.status !== "ACTIVE") return null;
  if (Date.now() - session.lastSeenAt.getTime() > IDLE_REFRESH_MS) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }
  const { user } = session;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: user.permissions,
    organizationId: user.organizationId,
    customerId: user.customer?.id ?? null,
    organization: {
      id: user.organization.id,
      legalName: user.organization.legalName,
      currency: user.organization.currency,
      timezone: user.organization.timezone,
      locale: user.organization.locale,
    },
  };
});

/** For pages: redirect to sign-in when there is no session. */
export async function requirePageUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For internal workspace pages. Customers are sent to their portal. */
export async function requireStaffPage(permission?: Permission): Promise<CurrentUser> {
  const user = await requirePageUser();
  if (user.role === "CUSTOMER") redirect("/portal");
  if (permission && !can(user, permission)) redirect("/app?denied=1");
  return user;
}

export async function requireCustomerPage(): Promise<CurrentUser & { customerId: string }> {
  const user = await requirePageUser();
  if (user.role !== "CUSTOMER" || !user.customerId) redirect("/app");
  return user as CurrentUser & { customerId: string };
}

/** For API routes and server actions: throw typed errors instead of redirecting. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Sign in to continue.");
  return user;
}

export async function requireStaff(permission?: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role === "CUSTOMER") throw forbidden();
  if (permission && !can(user, permission)) throw forbidden();
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw forbidden("Only administrators can do that.");
  return user;
}

export function actorOf(user: CurrentUser) {
  return { id: user.id, label: `${user.name} <${user.email}>`, organizationId: user.organizationId };
}
