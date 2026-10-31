import { redirect } from "next/navigation";

export default function BillingPage() {
  redirect("/app/billing/invoices");
}
