import type { NextRequest } from "next/server";
import { apiRoute, readJson } from "@/server/api/handler";
import { reversePayment } from "@/server/billing/payments";

type Ctx = RouteContext<"/api/v1/payments/[id]/reversal">;

export const POST = apiRoute(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = (await readJson(req)) as { reason?: unknown };
  await reversePayment(id, body.reason);
  return { id, status: "REVERSED" };
});
