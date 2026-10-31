import { apiRoute, clientIp, readJson } from "@/server/api/handler";
import { requestPasswordReset } from "@/server/identity/service";

export const POST = apiRoute(async (req) => {
  const body = (await readJson(req)) as { email?: unknown };
  await requestPasswordReset(body?.email, clientIp(req));
  return { message: "If the address is registered, we'll send reset instructions." };
});
