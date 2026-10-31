"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  forgotPasswordAction,
  registerAction,
  resetPasswordAction,
  signInAction,
  type FormState,
} from "@/app/actions/auth";
import { Button } from "@/components/primitives/button";
import { TextField } from "@/components/primitives/field";
import { PasswordField } from "@/components/primitives/password-field";
import { Notice } from "@/components/feedback/states";

const initial: FormState = {};

function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <Notice tone={state.ok ? "neutral" : "strong"} role={state.ok ? "status" : "alert"}>
      {state.message}
    </Notice>
  );
}

export function PasswordRules({ minLength }: { minLength: number }) {
  return (
    <span>
      At least {minLength} characters, with an uppercase letter, a lowercase letter and a special character.
    </span>
  );
}

export function SignInForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action, pending] = useActionState(signInAction, initial);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {notice && !state.message ? <Notice role="status">{notice}</Notice> : null}
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next ?? ""} />
      <TextField label="Email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.fields?.email} />
      <PasswordField label="Password" name="password" autoComplete="current-password" error={state.fields?.password} />
      <div className="-mt-2 text-small">
        <Link href="/forgot-password" className="underline underline-offset-4 hover:no-underline">
          Forgot your password?
        </Link>
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export function RegisterForm({ minLength }: { minLength: number }) {
  const [state, action, pending] = useActionState(registerAction, initial);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <TextField label="Your name" name="name" autoComplete="name" required defaultValue={state.values?.name} error={state.fields?.name} />
      <TextField
        label="Business name"
        name="businessName"
        autoComplete="organization"
        hint="Optional. Shown on your invoices."
        defaultValue={state.values?.businessName}
        error={state.fields?.businessName}
      />
      <TextField label="Email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.fields?.email} />
      <PasswordField label="Password" name="password" autoComplete="new-password" hint={<PasswordRules minLength={minLength} />} error={state.fields?.password} />
      <PasswordField label="Confirm password" name="confirmPassword" autoComplete="new-password" error={state.fields?.confirmPassword} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, initial);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <TextField label="Email" name="email" type="email" autoComplete="email" required />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token, minLength }: { token: string; minLength: number }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initial);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <PasswordField label="New password" name="password" autoComplete="new-password" hint={<PasswordRules minLength={minLength} />} error={state.fields?.password} />
      <PasswordField label="Confirm new password" name="confirmPassword" autoComplete="new-password" error={state.fields?.confirmPassword} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
