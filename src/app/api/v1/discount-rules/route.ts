import { apiRoute, readJson } from "@/server/api/handler";
import { createDiscountRule, listDiscountRules } from "@/server/settings/discounts";

export const GET = apiRoute(async () => listDiscountRules());
export const POST = apiRoute(async (req) => createDiscountRule(await readJson(req)));
