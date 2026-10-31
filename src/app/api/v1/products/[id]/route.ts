import { apiRoute, readJson } from "@/server/api/handler";
import { getProduct, updateProduct } from "@/server/catalog/products";

type Ctx = { params: Promise<{ id: string }> };

export const GET = apiRoute<Ctx>(async (_req, { params }) => getProduct((await params).id));
export const PATCH = apiRoute<Ctx>(async (req, { params }) => {
  const { id } = await params;
  await updateProduct(id, await readJson(req));
  return getProduct(id);
});
