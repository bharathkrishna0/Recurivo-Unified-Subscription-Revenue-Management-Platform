import type { NextRequest } from "next/server";
import { apiRoute, readJson } from "@/server/api/handler";
import { getCustomer, updateCustomer } from "@/server/sales/customers";

type Ctx = RouteContext<"/api/v1/customers/[id]">;

export const GET = apiRoute(async (_req: NextRequest, ctx: Ctx) => getCustomer((await ctx.params).id));
export const PATCH = apiRoute(async (req: NextRequest, ctx: Ctx) => updateCustomer((await ctx.params).id, await readJson(req)));
