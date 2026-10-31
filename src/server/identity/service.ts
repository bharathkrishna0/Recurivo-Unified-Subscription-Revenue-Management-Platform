import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { randomToken, sha256 } from "@/server/platform/crypto";
import { AppError, invalid } from "@/server/platform/errors";
import { consumeRateLimit } from "@/server/platform/rate-limit";
import { enqueueOutbox } from "@/server/platform/outbox";
import { recordAudit } from "@/server/platform/audit";
import { checkPassword, normalizeEmail } from "@/lib/validation/password";
import { burnPasswordCheck, hashPassword, verifyPassword } from "./password";
import { createSession, revokeAllSessions } from "./session";

const RESET_TOKEN_MINUTES = 30;

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  businessName: z.string().trim().max(160).optional(),
  email: z.email("Enter a valid email address").max(254),
  password: z.string().max(256),
});

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Enter your email").max(254),
  password: z.string().min(1, "Enter your password").max(256),
});

export const resetSchema = z.object({
  token: z.string().min(16).max(128),
  password: z.string().max(256),
});

/** The deployment serves one organization; registration joins it. */
export async function defaultOrganization() {
  const id = process.env.DEFAULT_ORGANIZATION_ID;
  const org = id ? await db.organization.findUnique({ where: { id } }) : await db.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) throw new AppError("INTERNAL", "No organization is configured. Run the database seed first.");
  return org;
}

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    out[key] ??= issue.message;
  }
  return out;
}

export function parseOrThrow<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw invalid("Check the highlighted fields.", fieldErrorsOf(parsed.error));
  return parsed.data;
}

export async function registerCustomer(input: unknown, ip: string): Promise<{ userId: string }> {
  const data = parseOrThrow(registerSchema, input);
  await consumeRateLimit(`register:${ip}`, 10, 15 * 60);
  const org = await defaultOrganization();
  const pw = checkPassword(data.password, org.passwordMinLength);
  if (!pw.ok) throw invalid("Password does not meet the requirements.", { password: `Needs: ${pw.failures.join(", ")}` });
  const email = normalizeEmail(data.email);
  const passwordHash = await hashPassword(data.password);
  try {
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { organizationId: org.id, email, name: data.name, passwordHash, role: "CUSTOMER" },
      });
      const customer = await tx.customer.create({
        data: {
          organizationId: org.id,
          portalUserId: created.id,
          businessName: data.businessName || data.name,
          contactName: data.name,
          email,
        },
      });
      await recordAudit(tx, { id: created.id, label: email, organizationId: org.id }, {
        action: "customer.registered",
        objectType: "Customer",
        objectId: customer.id,
        summary: `Customer account registered for ${email}`,
      });
      return created;
    });
    return { userId: user.id };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("CONFLICT", "An account with this email already exists. Sign in or reset your password.", {
        email: "This email is already registered",
      });
    }
    throw error;
  }
}

export async function login(input: unknown, ip: string): Promise<{ role: string }> {
  const data = parseOrThrow(loginSchema, input);
  const email = normalizeEmail(data.email);
  await consumeRateLimit(`login:ip:${ip}`, 30, 15 * 60);
  await consumeRateLimit(`login:email:${email}`, 8, 15 * 60);
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    await burnPasswordCheck(data.password);
    throw new AppError("UNAUTHENTICATED", "Email or password is incorrect.");
  }
  const ok = await verifyPassword(user.passwordHash, data.password);
  if (!ok || user.status !== "ACTIVE") throw new AppError("UNAUTHENTICATED", "Email or password is incorrect.");
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id);
  return { role: user.role };
}

/** Always resolves without revealing whether the email is registered. */
export async function requestPasswordReset(emailInput: unknown, ip: string): Promise<void> {
  const email = typeof emailInput === "string" ? normalizeEmail(emailInput) : "";
  await consumeRateLimit(`reset:ip:${ip}`, 10, 15 * 60);
  if (!email || email.length > 254) return;
  await consumeRateLimit(`reset:email:${email}`, 3, 15 * 60);
  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.status !== "ACTIVE") return;
  const token = randomToken();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  await db.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
    const row = await tx.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TOKEN_MINUTES * 60_000) },
    });
    await enqueueOutbox(tx, "email.send", `password-reset:${row.id}`, {
      to: user.email,
      subject: "Reset your Recurivo password",
      text: `Hello ${user.name},\n\nUse this link within ${RESET_TOKEN_MINUTES} minutes to choose a new password:\n${appUrl}/reset-password?token=${token}\n\nIf you did not ask for this, you can ignore this email.`,
    });
  });
}

export async function resetPassword(input: unknown, ip: string): Promise<void> {
  const data = parseOrThrow(resetSchema, input);
  await consumeRateLimit(`reset-confirm:${ip}`, 20, 15 * 60);
  const tokenHash = sha256(data.token);
  const row = await db.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: { include: { organization: true } } } });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    throw invalid("This reset link is invalid or has expired. Request a new one.", { token: "Invalid or expired link" });
  }
  const pw = checkPassword(data.password, row.user.organization.passwordMinLength);
  if (!pw.ok) throw invalid("Password does not meet the requirements.", { password: `Needs: ${pw.failures.join(", ")}` });
  const passwordHash = await hashPassword(data.password);
  // Conditional update makes the token single-use even under concurrent submissions.
  const consumed = await db.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (consumed.count !== 1) throw invalid("This reset link has already been used.", { token: "Already used" });
  await db.user.update({ where: { id: row.userId }, data: { passwordHash } });
  await revokeAllSessions(row.userId);
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002";
}
