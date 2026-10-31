import { apiRoute, clientIp, readJson } from "@/server/api/handler";
import { registerCustomer } from "@/server/identity/service";
import { NextResponse } from "next/server";

export const POST = apiRoute(async (req) => {
  const result = await registerCustomer(await readJson(req), clientIp(req));
  return NextResponse.json({ data: result }, { status: 201 });
});
