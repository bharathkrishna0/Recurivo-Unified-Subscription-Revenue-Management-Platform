import { apiRoute, readJson } from "@/server/api/handler";
import { inviteStaff } from "@/server/identity/team";

export const POST = apiRoute(async (req) => inviteStaff(await readJson(req)));
