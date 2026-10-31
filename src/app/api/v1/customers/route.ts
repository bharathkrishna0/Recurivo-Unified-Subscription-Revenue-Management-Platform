import type { NextRequest } from "next/server";
import { apiRoute, readJson } from "@/server/api/handler";
import { createCustomer, listCustomers } from "@/server/sales/customers";

export const GET = apiRoute(async (req: NextRequest) => listCustomers(Object.fromEntries(req.nextUrl.searchParams)));
export const POST = apiRoute(async (req: NextRequest) => createCustomer(await readJson(req)));
