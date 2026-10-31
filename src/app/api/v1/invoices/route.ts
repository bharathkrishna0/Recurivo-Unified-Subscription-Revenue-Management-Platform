import type { NextRequest } from "next/server";
import { apiRoute } from "@/server/api/handler";
import { listInvoices } from "@/server/billing/invoices";

export const GET = apiRoute(async (req: NextRequest) => listInvoices(Object.fromEntries(req.nextUrl.searchParams)));
