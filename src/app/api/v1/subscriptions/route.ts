import type { NextRequest } from "next/server";
import { apiRoute, readJson } from "@/server/api/handler";
import { createQuotation, listSubscriptions } from "@/server/sales/subscriptions";

/** `?view=quotations` lists drafts, sent and confirmed quotations; the default lists subscriptions. */
export const GET = apiRoute(async (req: NextRequest) => {
  const params = Object.fromEntries(req.nextUrl.searchParams);
  return listSubscriptions(params.view === "quotations" ? "quotations" : "subscriptions", params);
});
export const POST = apiRoute(async (req: NextRequest) => createQuotation(await readJson(req)));
