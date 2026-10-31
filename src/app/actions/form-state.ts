import { AppError } from "@/server/platform/errors";

export interface FormState {
  message?: string;
  fields?: Record<string, string>;
  values?: Record<string, string>;
  ok?: boolean;
}

export function errorState(error: unknown, values?: Record<string, string>): FormState {
  if (error instanceof AppError) return { message: error.message, fields: error.fieldErrors, values };
  console.error(error instanceof Error ? error.message : error);
  return { message: "Not saved. Something went wrong; try again.", values };
}

/** Collect plain string fields from a form submission for re-display after an error. */
export function formValues(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string" && !key.startsWith("$") && !/password|token/i.test(key)) out[key] = value;
  }
  return out;
}

export const checked = (form: FormData, name: string) => form.get(name) === "on";
