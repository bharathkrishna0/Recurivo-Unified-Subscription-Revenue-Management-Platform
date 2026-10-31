import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/identity/session";

export default async function Home() {
  const user = await getCurrentUser();
  redirect(!user ? "/login" : user.role === "CUSTOMER" ? "/portal" : "/app");
}
