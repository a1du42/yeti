import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { Workspace } from "@/components/workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Кабинет" };

export default async function AppPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session || !session.user.emailVerified) redirect("/app/auth");
  const { id, name, email, emailVerified, timezone, createdAt } = session.user;
  return <Workspace user={{ id, name, email, emailVerified, timezone, createdAt: createdAt.toISOString() }} />;
}
