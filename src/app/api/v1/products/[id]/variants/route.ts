import { apiRoute, readJson } from "@/server/api/handler";
import { addVariant } from "@/server/catalog/products";

type Ctx = { params: Promise<{ id: string }> };

export const POST = apiRoute<Ctx>(async (req, { params }) => addVariant((await params).id, await readJson(req)));
