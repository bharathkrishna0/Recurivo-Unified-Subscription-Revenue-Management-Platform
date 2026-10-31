import { apiRoute } from "@/server/api/handler";
import { runBillingNow } from "@/server/billing/invoices";

export const POST = apiRoute(async () => runBillingNow());
