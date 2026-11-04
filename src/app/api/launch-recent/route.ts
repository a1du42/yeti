import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { launchRecent } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { readRecentLink, readRecentList, recentLimit } from "@/lib/launch-recent";

export const runtime = "nodejs";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

async function readInput(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 48_000) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return value && typeof value === "object" ? value as Record<string, unknown> : null;
  } catch { return null; } finally { reader.releaseLock(); }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(getServerEnv().BETTER_AUTH_URL).origin) return json({}, 403);
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user.emailVerified) return json({}, 401);
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return json({}, 415);
    const input = await readInput(request);
    if (!input) return json({}, 400);
    const userId = session.user.id;
    if (input.userId !== userId) return json({}, 403);
    const { action } = input;
    const db = getDb();
    const ownRow = eq(launchRecent.userId, userId);
    if (action === "load") {
      const legacy = readRecentList(input.legacy);
      if (legacy.length) await db.insert(launchRecent).values({ userId, entries: legacy }).onConflictDoNothing();
      const [row] = await db.select().from(launchRecent).where(ownRow);
      return json({ entries: row?.entries ?? [] });
    }
    if (action !== "touch" && action !== "update" && action !== "remove") return json({}, 400);
    const entry = readRecentLink(action === "remove" ? input.url : input.entry);
    if (!entry) return json({}, 400);
    const entries = await db.transaction(async tx => {
      await tx.insert(launchRecent).values({ userId, entries: [] }).onConflictDoNothing();
      const [row] = await tx.select().from(launchRecent).where(ownRow).for("update");
      const current = row.entries;
      const existing = current.find(item => item.url === entry.url);
      const next = action === "remove" ? current.filter(item => item.url !== entry.url)
        : action === "touch" ? [existing ?? entry, ...current.filter(item => item.url !== entry.url)].slice(0, recentLimit)
          : current.map(item => item.url === entry.url
            ? { ...entry, title: entry.title ?? item.title, thumbnail: entry.thumbnail ?? item.thumbnail }
            : item);
      await tx.update(launchRecent).set({ entries: next }).where(ownRow);
      return next;
    });
    return json({ entries });
  } catch {
    console.error("launch_recent_failed");
    return json({}, 503);
  }
}
