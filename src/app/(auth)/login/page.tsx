import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/features/identity/auth-forms";
import { getCurrentUser } from "@/server/identity/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "CUSTOMER" ? "/portal" : "/app");
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const notice = params.reset ? "Your password was changed. Sign in with the new password." : undefined;
  return (
    <>
      <h1 className="mb-8 text-title font-semibold">Sign in to Recurivo</h1>
      <SignInForm next={next} notice={notice} />
      <p className="mt-8 border-t border-line pt-6 text-body text-ink-muted">
        New customer?{" "}
        <Link href="/register" className="font-semibold text-ink underline underline-offset-4 hover:no-underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
