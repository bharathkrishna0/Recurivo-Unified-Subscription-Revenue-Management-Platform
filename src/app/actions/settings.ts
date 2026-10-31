"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clientIp } from "@/server/api/handler";
import { saveTaxRule, setTaxRuleStatus } from "@/server/settings/taxes";
import { createDiscountRule, setDiscountRuleStatus } from "@/server/settings/discounts";
import { updateOrganization } from "@/server/settings/organization";
import { acceptInvitation, inviteStaff, revokeInvitation, setStaffStatus, updateStaffPermissions } from "@/server/identity/team";
import { checked, errorState, formValues, type FormState } from "./form-state";

export async function saveOrganizationAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await updateOrganization({
      legalName: form.get("legalName"),
      supportEmail: form.get("supportEmail"),
      currency: form.get("currency"),
      timezone: form.get("timezone"),
      locale: form.get("locale"),
      paymentTermsDays: form.get("paymentTermsDays"),
      passwordMinLength: form.get("passwordMinLength"),
    });
  } catch (error) {
    return errorState(error, formValues(form));
  }
  revalidatePath("/app", "layout");
  return { ok: true, message: "Organization settings saved." };
}

export async function saveTaxAction(_prev: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get("id") ?? "") || null;
  try {
    await saveTaxRule(id, {
      name: form.get("name"),
      jurisdiction: form.get("jurisdiction"),
      rate: form.get("rate"),
      scope: form.get("scope"),
      productIds: form.getAll("productIds").map(String),
      effectiveFrom: form.get("effectiveFrom"),
      effectiveUntil: form.get("effectiveUntil"),
    });
  } catch (error) {
    return errorState(error, formValues(form));
  }
  revalidatePath("/app/settings/taxes");
  redirect("/app/settings/taxes?saved=1");
}

export async function taxStatusAction(form: FormData): Promise<void> {
  await setTaxRuleStatus(String(form.get("id") ?? ""), form.get("status") === "ARCHIVED" ? "ARCHIVED" : "ACTIVE");
  revalidatePath("/app/settings/taxes");
}

export async function createDiscountAction(_prev: FormState, form: FormData): Promise<FormState> {
  if (!checked(form, "confirm")) return { message: "Confirm the discount before activating it.", fields: { confirm: "Required" }, values: formValues(form) };
  try {
    await createDiscountRule({
      name: form.get("name"),
      type: form.get("type"),
      value: form.get("value"),
      scope: form.get("scope"),
      productId: form.get("productId"),
      minQuantity: form.get("minQuantity"),
      minAmount: form.get("minAmount"),
      startsAt: form.get("startsAt"),
      endsAt: form.get("endsAt"),
      usageLimit: form.get("usageLimit"),
      priority: form.get("priority") || "0",
    });
  } catch (error) {
    return errorState(error, formValues(form));
  }
  revalidatePath("/app/settings/discounts");
  redirect("/app/settings/discounts?saved=1");
}

export async function discountStatusAction(form: FormData): Promise<void> {
  await setDiscountRuleStatus(String(form.get("id") ?? ""), form.get("status") === "ARCHIVED" ? "ARCHIVED" : "ACTIVE");
  revalidatePath("/app/settings/discounts");
}

export async function inviteStaffAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await inviteStaff({ name: form.get("name"), email: form.get("email"), permissions: form.getAll("permissions").map(String) });
  } catch (error) {
    return errorState(error, formValues(form));
  }
  revalidatePath("/app/settings/team");
  return { ok: true, message: "Invitation sent. It expires in 7 days." };
}

export async function revokeInvitationAction(form: FormData): Promise<void> {
  await revokeInvitation(String(form.get("id") ?? ""));
  revalidatePath("/app/settings/team");
}

export async function updatePermissionsAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await updateStaffPermissions(String(form.get("userId") ?? ""), form.getAll("permissions").map(String), checked(form, "confirm"));
  } catch (error) {
    return errorState(error);
  }
  revalidatePath("/app/settings/team");
  return { ok: true, message: "Access updated." };
}

export async function staffStatusAction(form: FormData): Promise<void> {
  await setStaffStatus(String(form.get("userId") ?? ""), form.get("status") === "DISABLED" ? "DISABLED" : "ACTIVE");
  revalidatePath("/app/settings/team");
}

export async function acceptInvitationAction(_prev: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirmPassword") ?? "")) {
    return { message: "Check the highlighted fields.", fields: { confirmPassword: "Passwords do not match" } };
  }
  try {
    await acceptInvitation({ token: form.get("token"), name: form.get("name"), password }, clientIp(await headers()));
  } catch (error) {
    return errorState(error, formValues(form));
  }
  redirect("/app");
}
