"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp } from "@/server/api/handler";
import { destroySession } from "@/server/identity/session";
import { login, registerCustomer, requestPasswordReset, resetPassword } from "@/server/identity/service";
import { AppError } from "@/server/platform/errors";

export interface FormState {
  message?: string;
  fields?: Record<string, string>;
  values?: Record<string, string>;
  ok?: boolean;
}

function toState(error: unknown, values?: Record<string, string>): FormState {
  if (error instanceof AppError) return { message: error.message, fields: error.fieldErrors, values };
  console.error(error instanceof Error ? error.message : error);
  return { message: "Something went wrong. Try again.", values };
}

function safeNext(value: FormDataEntryValue | null): string | null {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : null;
}

export async function signInAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "");
  let role: string;
  try {
    ({ role } = await login({ email, password: String(form.get("password") ?? "") }, clientIp(await headers())));
  } catch (error) {
    return toState(error, { email });
  }
  const next = safeNext(form.get("next"));
  const home = role === "CUSTOMER" ? "/portal" : "/app";
  redirect(next && next.startsWith(home) ? next : home);
}

export async function registerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = {
    name: String(form.get("name") ?? ""),
    businessName: String(form.get("businessName") ?? ""),
    email: String(form.get("email") ?? ""),
  };
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirmPassword") ?? "")) {
    return { message: "Check the highlighted fields.", fields: { confirmPassword: "Passwords do not match" }, values };
  }
  const ip = clientIp(await headers());
  try {
    await registerCustomer({ ...values, password }, ip);
    await login({ email: values.email, password }, ip);
  } catch (error) {
    return toState(error, values);
  }
  redirect("/portal");
}

export async function forgotPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await requestPasswordReset(form.get("email"), clientIp(await headers()));
  } catch (error) {
    if (error instanceof AppError && error.code === "RATE_LIMITED") return toState(error);
    console.error(error instanceof Error ? error.message : error);
  }
  return { ok: true, message: "If the address is registered, we'll send reset instructions." };
}

export async function resetPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirmPassword") ?? "")) {
    return { message: "Check the highlighted fields.", fields: { confirmPassword: "Passwords do not match" } };
  }
  try {
    await resetPassword({ token: String(form.get("token") ?? ""), password }, clientIp(await headers()));
  } catch (error) {
    return toState(error);
  }
  redirect("/login?reset=1");
}

export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
