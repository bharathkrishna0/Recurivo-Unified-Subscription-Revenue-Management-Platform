import type { NextRequest } from "next/server";
import { apiRoute, readJson } from "@/server/api/handler";
import { listTemplates, saveTemplate } from "@/server/sales/templates";

export const GET = apiRoute(async (req: NextRequest) => listTemplates(Object.fromEntries(req.nextUrl.searchParams)));
export const POST = apiRoute(async (req: NextRequest) => saveTemplate(null, await readJson(req)));
