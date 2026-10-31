import { connection } from "next/server";
import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "@/features/identity/auth-forms";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage() {
  await connection();
  const org = await db.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { passwordMinLength: true } });
  return (
    <>
      <h1 className="mb-2 text-title font-semibold">Create your account</h1>
      <p className="mb-8 text-body text-ink-muted">Manage your subscriptions, invoices and payments in one place.</p>
      <RegisterForm minLength={org?.passwordMinLength ?? 9} />
      <p className="mt-8 border-t border-line pt-6 text-body text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-ink underline underline-offset-4 hover:no-underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
