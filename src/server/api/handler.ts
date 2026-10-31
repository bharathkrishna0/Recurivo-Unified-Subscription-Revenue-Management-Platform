import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { AppError } from "@/server/platform/errors";

export function clientIp(req: Request | Headers): string {
  const h = req instanceof Headers ? req : req.headers;
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

/** Cookie-authenticated mutations must originate from this site (CSRF defense). */
function assertSameOrigin(req: NextRequest): void {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host || new URL(origin).host !== host) throw new AppError("FORBIDDEN", "Cross-origin request rejected.");
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response | unknown>;

/** Wrap a route handler with CSRF checks, structured errors and a correlation ID. */
export function apiRoute<C>(handler: Handler<C>) {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    const requestId = req.headers.get("x-request-id") ?? randomUUID();
    try {
      assertSameOrigin(req);
      const result = await handler(req, ctx);
      const res = result instanceof Response ? result : NextResponse.json({ data: result ?? null });
      res.headers.set("x-request-id", requestId);
      res.headers.set("cache-control", "no-store");
      return res;
    } catch (error) {
      if (error instanceof AppError) {
        return NextResponse.json(
          { error: { code: error.code, message: error.message, fields: error.fieldErrors, requestId } },
          { status: error.status, headers: { "x-request-id": requestId, "cache-control": "no-store" } },
        );
      }
      console.error(`[${requestId}]`, error instanceof Error ? error.message : "Unknown error");
      return NextResponse.json(
        { error: { code: "INTERNAL", message: "Something went wrong. Try again.", requestId } },
        { status: 500, headers: { "x-request-id": requestId } },
      );
    }
  };
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError("VALIDATION_FAILED", "Request body must be valid JSON.");
  }
}
