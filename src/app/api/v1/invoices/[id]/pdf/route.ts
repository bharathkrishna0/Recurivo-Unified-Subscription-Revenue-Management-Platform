import type { NextRequest } from "next/server";
import { apiRoute } from "@/server/api/handler";
import { invoicePdf } from "@/server/billing/invoices";

type Ctx = RouteContext<"/api/v1/invoices/[id]/pdf">;

export const GET = apiRoute(async (_req: NextRequest, ctx: Ctx) => {
  const { filename, pdf } = await invoicePdf((await ctx.params).id);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
