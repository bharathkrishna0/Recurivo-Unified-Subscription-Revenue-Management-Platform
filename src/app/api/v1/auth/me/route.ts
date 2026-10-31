import { apiRoute } from "@/server/api/handler";
import { requireUser } from "@/server/identity/session";

export const GET = apiRoute(async () => {
  const user = await requireUser();
  return { id: user.id, name: user.name, email: user.email, role: user.role, permissions: user.permissions, organization: user.organization };
});
