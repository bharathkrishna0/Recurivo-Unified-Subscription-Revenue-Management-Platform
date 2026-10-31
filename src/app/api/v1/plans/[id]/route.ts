import { apiRoute, readJson } from "@/server/api/handler";
import { getPlan, updatePlan } from "@/server/catalog/plans";

type Ctx = { params: Promise<{ id: string }> };

export const GET = apiRoute<Ctx>(async (_req, { params }) => getPlan((await params).id));
export const PATCH = apiRoute<Ctx>(async (req, { params }) => updatePlan((await params).id, await readJson(req)));
