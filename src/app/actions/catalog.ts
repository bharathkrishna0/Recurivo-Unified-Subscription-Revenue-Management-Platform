"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addVariant, createProduct, setProductStatus, setVariantStatus, updateProduct } from "@/server/catalog/products";
import { createPlan, setPlanStatus, updatePlan } from "@/server/catalog/plans";
import { checked, errorState, formValues, type FormState } from "./form-state";

const productInput = (form: FormData) => ({
  name: form.get("name"),
  type: form.get("type"),
  salePrice: form.get("salePrice"),
  costPrice: form.get("costPrice"),
  notes: form.get("notes"),
});

export async function saveProductAction(_prev: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get("id") ?? "");
  let target: string;
  try {
    target = id ? (await updateProduct(id, productInput(form)), id) : (await createProduct(productInput(form))).id;
  } catch (error) {
    return errorState(error, formValues(form));
  }
  revalidatePath("/app/catalog/products");
  redirect(`/app/catalog/products/${target}?saved=1`);
}

export async function addVariantAction(_prev: FormState, form: FormData): Promise<FormState> {
  const productId = String(form.get("productId") ?? "");
  try {
    await addVariant(productId, {
      attribute: form.get("attribute"),
      value: form.get("value"),
      adjustmentType: form.get("adjustmentType"),
      adjustmentValue: form.get("adjustmentValue"),
    });
  } catch (error) {
    return errorState(error, formValues(form));
  }
  revalidatePath(`/app/catalog/products/${productId}`);
  return { ok: true, message: "Variant added." };
}

export async function productStatusAction(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  await setProductStatus(id, form.get("status") === "ARCHIVED" ? "ARCHIVED" : "ACTIVE");
  revalidatePath(`/app/catalog/products/${id}`);
}

export async function variantStatusAction(form: FormData): Promise<void> {
  const { productId } = await setVariantStatus(String(form.get("id") ?? ""), form.get("status") === "ARCHIVED" ? "ARCHIVED" : "ACTIVE");
  revalidatePath(`/app/catalog/products/${productId}`);
}

const planInput = (form: FormData) => ({
  productId: form.get("productId"),
  name: form.get("name"),
  interval: form.get("interval"),
  price: form.get("price"),
  minQuantity: form.get("minQuantity"),
  termLength: form.get("termLength"),
  availableFrom: form.get("availableFrom"),
  availableUntil: form.get("availableUntil"),
  allowPause: checked(form, "allowPause"),
  allowEarlyClose: checked(form, "allowEarlyClose"),
  allowRenewal: checked(form, "allowRenewal"),
  autoCloseAtExpiry: checked(form, "autoCloseAtExpiry"),
  customerSelfService: checked(form, "customerSelfService"),
});

export async function savePlanAction(_prev: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get("id") ?? "");
  let target: string;
  try {
    target = id ? (await updatePlan(id, planInput(form)), id) : (await createPlan(planInput(form))).id;
  } catch (error) {
    return errorState(error, formValues(form));
  }
  revalidatePath("/app/catalog/plans");
  redirect(`/app/catalog/plans/${target}?saved=1`);
}

export async function planStatusAction(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  await setPlanStatus(id, form.get("status") === "ARCHIVED" ? "ARCHIVED" : "ACTIVE");
  revalidatePath(`/app/catalog/plans/${id}`);
}
