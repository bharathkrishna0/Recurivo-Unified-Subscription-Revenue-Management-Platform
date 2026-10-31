import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiRoute, readJson } from "@/server/api/handler";
import { LIFECYCLE_ACTIONS } from "@/lib/lifecycle";
import { parseOrThrow } from "@/server/identity/service";
import { transitionSubscription } from "@/server/sales/subscriptions";

const body = z.object({
  action: z.enum(LIFECYCLE_ACTIONS as [string, ...string[]], "Unknown action"),
  reason: z.string().optional(),
  expectedVersion: z.number().int().optional(),
});

type Ctx = RouteContext<"/api/v1/subscriptions/[id]/transitions">;

export const POST = apiRoute(async (req: NextRequest, ctx: Ctx) => {
  const input = parseOrThrow(body, await readJson(req));
  return transitionSubscription((await ctx.params).id, input.action as (typeof LIFECYCLE_ACTIONS)[number], input);
});
