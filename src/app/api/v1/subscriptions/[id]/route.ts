import type { NextRequest } from "next/server";
import { apiRoute, readJson } from "@/server/api/handler";
import { getSubscription, updateQuotation } from "@/server/sales/subscriptions";

type Ctx = RouteContext<"/api/v1/subscriptions/[id]">;

export const GET = apiRoute(async (_req: NextRequest, ctx: Ctx) => getSubscription((await ctx.params).id));
export const PATCH = apiRoute(async (req: NextRequest, ctx: Ctx) => updateQuotation((await ctx.params).id, await readJson(req)));
