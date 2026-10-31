import { apiRoute } from "@/server/api/handler";
import { destroySession } from "@/server/identity/session";

export const POST = apiRoute(async () => {
  await destroySession();
  return { signedOut: true };
});
