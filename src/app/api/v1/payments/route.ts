import type { NextRequest } from "next/server";
import { apiRoute, readJson } from "@/server/api/handler";
import { listPayments, recordPayment } from "@/server/billing/payments";

export const GET = apiRoute(async (req: NextRequest) => listPayments(Object.fromEntries(req.nextUrl.searchParams)));

/** The Idempotency-Key header (or body field) makes client retries safe: a replay returns the original payment. */
export const POST = apiRoute(async (req: NextRequest) => {
  const body = (await readJson(req)) as Record<string, unknown>;
  const result = await recordPayment({ ...body, idempotencyKey: req.headers.get("idempotency-key") ?? body.idempotencyKey });
  return Response.json({ data: result }, { status: result.replayed ? 200 : 201 });
});
