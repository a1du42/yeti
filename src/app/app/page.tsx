import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { account } from "@/db/schema";
import { getServerEnv } from "@/lib/env";
import { Workspace } from "@/components/workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Кабинет" };

export default async function AppPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session || !session.user.emailVerified) redirect("/app/auth");
  const { id, name, email, emailVerified, timezone, createdAt } = session.user;
  const accounts = await getDb().select({ provider: account.providerId }).from(account).where(eq(account.userId, id));
  const env = getServerEnv();
  return <Workspace providers={accounts.map(value => value.provider)} googleEnabled={Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)} yandexEnabled={Boolean(env.YANDEX_CLIENT_ID && env.YANDEX_CLIENT_SECRET)} user={{ id, name, email, emailVerified, timezone, createdAt: createdAt.toISOString() }} />;
}
