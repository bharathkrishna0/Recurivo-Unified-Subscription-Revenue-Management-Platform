import { apiRoute, readJson } from "@/server/api/handler";
import { listTaxRules, saveTaxRule } from "@/server/settings/taxes";

export const GET = apiRoute(async () => listTaxRules());
export const POST = apiRoute(async (req) => saveTaxRule(null, await readJson(req)));
