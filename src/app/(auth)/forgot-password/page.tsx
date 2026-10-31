import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/features/identity/auth-forms";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="mb-2 text-title font-semibold">Forgot your password?</h1>
      <p className="mb-8 text-body text-ink-muted">Enter the email you use for Recurivo. The link expires after 30 minutes.</p>
      <ForgotPasswordForm />
      <p className="mt-8 border-t border-line pt-6 text-body">
        <Link href="/login" className="underline underline-offset-4 hover:no-underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
