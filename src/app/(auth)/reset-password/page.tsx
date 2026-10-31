import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/features/identity/auth-forms";
import { Notice } from "@/components/feedback/states";
import { db } from "@/server/db";
import { sha256 } from "@/server/platform/crypto";

export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";
  const row = value
    ? await db.passwordResetToken.findUnique({
        where: { tokenHash: sha256(value) },
        select: { usedAt: true, expiresAt: true, user: { select: { organization: { select: { passwordMinLength: true } } } } },
      })
    : null;
  const valid = row && !row.usedAt && row.expiresAt > new Date();
  return (
    <>
      <h1 className="mb-8 text-title font-semibold">Choose a new password</h1>
      {valid ? (
        <ResetPasswordForm token={value} minLength={row.user.organization.passwordMinLength} />
      ) : (
        <div className="flex flex-col gap-6">
          <Notice tone="strong" role="alert">
            This reset link is invalid, already used or expired.
          </Notice>
          <Link href="/forgot-password" className="text-body font-semibold underline underline-offset-4 hover:no-underline">
            Request a new link
          </Link>
        </div>
      )}
    </>
  );
}
