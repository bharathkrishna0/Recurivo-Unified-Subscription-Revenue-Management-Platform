import { apiRoute, readJson } from "@/server/api/handler";
import { createPlan, listPlans } from "@/server/catalog/plans";

export const GET = apiRoute(async (req) => listPlans(Object.fromEntries(req.nextUrl.searchParams)));
export const POST = apiRoute(async (req) => createPlan(await readJson(req)));
