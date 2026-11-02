import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { AuthScreen } from "@/components/auth-screen";
import { getServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Вход" };

export default async function AuthPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const reset = params.reset === "1";
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (session?.user.emailVerified && !reset) redirect("/app");
  const verified = (await cookies()).get("yeti-verified")?.value === "1";
  const env = getServerEnv();
  return <AuthScreen googleEnabled={Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)} oauthError={params.oauthError === "1"} initialMode={reset ? "reset" : "login"} verified={verified} invalid={params.invalid === "1" || (!!params.error && params.oauthError !== "1")} />;
}
