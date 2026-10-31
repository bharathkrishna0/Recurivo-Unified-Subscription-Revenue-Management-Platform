import type { NextRequest } from "next/server";
import { apiRoute } from "@/server/api/handler";
import { getInvoice } from "@/server/billing/invoices";

type Ctx = RouteContext<"/api/v1/invoices/[id]">;

export const GET = apiRoute(async (_req: NextRequest, ctx: Ctx) => getInvoice((await ctx.params).id));
