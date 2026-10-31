import { apiRoute, clientIp, readJson } from "@/server/api/handler";
import { login } from "@/server/identity/service";

export const POST = apiRoute(async (req) => login(await readJson(req), clientIp(req)));
