import type { NextRequest } from "next/server";
import { apiRoute } from "@/server/api/handler";
import { exportCsv } from "@/server/reports/exports";

export const GET = apiRoute(async (req: NextRequest, ctx: RouteContext<"/api/v1/exports/[kind]">) => {
  const { kind } = await ctx.params;
  const { filename, csv } = await exportCsv(kind, Object.fromEntries(req.nextUrl.searchParams));
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" },
  });
});
