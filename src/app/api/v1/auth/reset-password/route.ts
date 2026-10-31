import { apiRoute, clientIp, readJson } from "@/server/api/handler";
import { resetPassword } from "@/server/identity/service";

export const POST = apiRoute(async (req) => {
  await resetPassword(await readJson(req), clientIp(req));
  return { reset: true };
});
