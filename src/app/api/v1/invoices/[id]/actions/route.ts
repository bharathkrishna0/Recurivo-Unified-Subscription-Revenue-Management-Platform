import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiRoute, readJson } from "@/server/api/handler";
import { parseOrThrow } from "@/server/identity/service";
import { cancelInvoice, confirmInvoice, getInvoice, sendInvoice } from "@/server/billing/invoices";

const body = z.object({ action: z.enum(["confirm", "send", "cancel"], "Unknown action"), reason: z.string().optional() });

type Ctx = RouteContext<"/api/v1/invoices/[id]/actions">;

export const POST = apiRoute(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const input = parseOrThrow(body, await readJson(req));
  if (input.action === "confirm") await confirmInvoice(id);
  else if (input.action === "send") await sendInvoice(id);
  else await cancelInvoice(id, input.reason);
  const inv = await getInvoice(id);
  return { id, status: inv.status, state: inv.state, deliveryStatus: inv.deliveryStatus };
});
