import "server-only";
import { getAuth } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";
import { parseStreamLink, type StreamInfo } from "@/lib/stream-link";
import { signLaunchSource } from "@/lib/launch-source";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { rateLimit } from "@/db/schema";
import { sql } from "drizzle-orm";
export const runtime = "nodejs";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const clean = (value: string) => value.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : "").slice(0, 2000);
function readPageMeta(html: string) {
  const meta = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = new Map([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map(m => [m[1].toLowerCase(), m[3]]));
    const name = attrs.get("property") ?? attrs.get("name");
    if (name && attrs.has("content")) meta.set(name, clean(attrs.get("content")!));
  }
  return meta;
}
function hasLiveBroadcast(html: string) {
  const now = Date.now();
  function visit(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some(visit);
    const node = value as Record<string, unknown>;
    if (node["@type"] === "VideoObject") {
      const publications = Array.isArray(node.publication) ? node.publication : [node.publication];
      return publications.some(event => {
        if (!event || typeof event !== "object") return false;
        const start = Date.parse(event.startDate);
        const end = event.endDate ? Date.parse(event.endDate) : Infinity;
        return event["@type"] === "BroadcastEvent" && event.isLiveBroadcast === true && Number.isFinite(start) && start <= now && end > now;
      });
    }
    return Array.isArray(node["@graph"]) && node["@graph"].some(visit);
  }
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { if (visit(JSON.parse(match[1]))) return true; } catch { /* Неполные метаданные не подтверждают эфир. */ }
  }
  for (const match of html.matchAll(/<span\b[^>]*itemtype=["']https?:\/\/schema.org\/BroadcastEvent["'][^>]*>([\s\S]*?)<\/span>/gi)) {
    const properties: Record<string, string> = {};
    for (const meta of match[1].matchAll(/<meta\b[^>]*>/gi)) {
      const attrs = new Map([...meta[0].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map(m => [m[1].toLowerCase(), m[3]]));
      const name = attrs.get("itemprop");
      if (name && attrs.has("content")) properties[name] = attrs.get("content")!;
    }
    const start = Date.parse(properties.startDate);
    const end = properties.endDate ? Date.parse(properties.endDate) : Infinity;
    if (properties.isLiveBroadcast?.toLowerCase() === "true" && Number.isFinite(start) && start <= now && end > now) return true;
  }
  return false;
}
async function boundedText(response: Response, max = 1_500_000, prefix = false) {
  if (!response.ok || !response.body) throw new Error("Unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        if (!prefix) throw new Error("Too large");
        chunks.push(value.subarray(0, value.length - (size - max)));
        break;
      }
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(getServerEnv().BETTER_AUTH_URL).origin) return json({ error: "Обновите страницу и повторите попытку." }, 403);
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user.emailVerified) return json({ error: "Сессия завершилась. Войдите снова." }, 401);
  const key = `stream-info:${session.user.id}`;
  const now = Date.now();
  const [limit] = await getDb().insert(rateLimit).values({ id: key, key, count: 1, lastRequest: now })
    .onConflictDoUpdate({ target: rateLimit.key, set: {
      count: sql`case when ${rateLimit.lastRequest} < ${now - 60_000} then 1 else ${rateLimit.count} + 1 end`,
      lastRequest: sql`case when ${rateLimit.lastRequest} < ${now - 60_000} then ${now} else ${rateLimit.lastRequest} end`,
    } }).returning();
  if (limit.count > 20) return json({ error: "Слишком много запросов. Повторите через минуту." }, 429);
  let input: unknown;
  try {
    const text = await boundedText(new Response(request.body), 4096);
    if (text.length > 4096) return json({ error: "Ссылка слишком длинная." }, 400);
    input = JSON.parse(text).url;
  } catch { return json({ error: "Не удалось прочитать ссылку." }, 400); }
  const target = typeof input === "string" ? parseStreamLink(input) : null;
  if (!target) return json({ error: "Вставьте ссылку на канал, запись или клип Twitch и Kick, канал, видео или шортс YouTube." }, 400);
  const result: StreamInfo = { ...target, sourceKind: target.kind, title: null, author: null, description: null, thumbnail: null, warning: null };
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]);
  try {
    if (target.platform === "youtube" && target.kind !== "channel") {
      // Для публичных метаданных YouTube используем обычный адрес ролика; ссылку Shorts сохраняем в результате.
      const metadataUrl = target.kind === "shorts" ? `https://www.youtube.com/watch?v=${target.id}` : target.url;
      const [embed, page] = await Promise.allSettled([
        fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(metadataUrl)}`, { redirect: "error", signal, cache: "no-store" }).then(response => boundedText(response)).then(text => JSON.parse(text)),
        fetch(metadataUrl, { redirect: "error", signal, cache: "no-store" }).then(response => boundedText(response, 1_500_000, true)),
      ]);
      if (page.status === "fulfilled") {
        if (target.kind !== "shorts" && hasLiveBroadcast(page.value)) result.kind = "stream";
        result.description = readPageMeta(page.value).get("og:description")?.trim() || null;
      }
      if (embed.status === "rejected") throw new Error("Unavailable");
      const data = embed.value;
      const embedTitle = typeof data.html === "string" ? /\btitle="([^"]+)"/.exec(data.html)?.[1] : null;
      result.title = typeof data.title === "string" ? data.title.slice(0, 500) : embedTitle ? clean(embedTitle).slice(0, 500) : null;
      result.author = typeof data.author_name === "string" ? data.author_name.slice(0, 200) : null;
      result.thumbnail = `https://i.ytimg.com/vi/${target.id}/hqdefault.jpg`;
    } else {
      // Только канонический адрес из строгого парсера; переходы на другие хосты запрещены.
      const html = await boundedText(await fetch(target.url, { redirect: "error", signal, cache: "no-store", headers: { Accept: "text/html" } }), 1_500_000, true);
      if (target.kind === "channel" && hasLiveBroadcast(html)) result.kind = "stream";
      const meta = readPageMeta(html);
      const title = meta.get("og:title") ?? null;
      result.title = title && !/^(Twitch|Kick|Kick Streaming)$/i.test(title.trim()) ? title : null;
      result.description = meta.get("og:description") ?? null;
      const thumb = meta.get("og:image");
      if (thumb) {
        const url = new URL(thumb);
        if (url.protocol === "https:" && !url.username && !url.password && ["jtvnw.net", "ttvnw.net", "kick.com", "kickcdn.com", "ytimg.com", "ggpht.com", "googleusercontent.com"].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) result.thumbnail = url.href;
      }
    }
  } catch { result.warning = "Не удалось получить сведения с площадки. Проверьте доступность ссылки и повторите попытку."; }
  return json({ ...result, launchToken: await signLaunchSource(session.user.id, result) });
}
