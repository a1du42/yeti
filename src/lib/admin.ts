import "server-only";
import { headers } from "next/headers";
import { getAuth } from "./auth";
import { getServerEnv } from "./env";

export async function adminSession() {
  const email = getServerEnv().ADMIN_EMAIL;
  if (!email) return null;
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session?.user.emailVerified && session.user.email.toLowerCase() === email.toLowerCase()
    ? session : null;
}
