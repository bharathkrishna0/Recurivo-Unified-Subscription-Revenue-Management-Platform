import { apiRoute, readJson } from "@/server/api/handler";
import { createProduct, listProducts } from "@/server/catalog/products";

export const GET = apiRoute(async (req) => listProducts(Object.fromEntries(req.nextUrl.searchParams)));
export const POST = apiRoute(async (req) => createProduct(await readJson(req)));
