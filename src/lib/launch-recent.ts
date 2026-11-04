import { parseStreamLink, type StreamInfo } from "./stream-link";

export const recentLimit = 5;
export type RecentLink = Pick<StreamInfo, "url" | "title" | "thumbnail" | "kind" | "platform">;
export type RecentAction =
  | { action: "load"; legacy: RecentLink[] }
  | { action: "touch" | "update"; entry: RecentLink }
  | { action: "remove"; url: string };

export function readLaunchThumbnail(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const hosts = ["jtvnw.net", "ttvnw.net", "kick.com", "kickcdn.com", "ytimg.com", "ggpht.com", "googleusercontent.com"];
    if (url.protocol === "https:" && !url.username && !url.password && !url.port &&
      hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) return url.href;
  } catch { /* Некорректное превью не сохраняется. */ }
  return null;
}

export function readRecentLink(value: unknown): RecentLink | null {
  const entry = typeof value === "string" ? { url: value } : value;
  if (!entry || typeof entry !== "object" || !("url" in entry) || typeof entry.url !== "string" || entry.url.length > 2048) return null;
  const target = parseStreamLink(entry.url);
  if (!target) return null;
  return {
    url: target.url,
    platform: target.platform,
    kind: "kind" in entry && entry.kind === "stream" && target.kind !== "shorts" ? "stream" : target.kind,
    title: "title" in entry && typeof entry.title === "string" ? entry.title.slice(0, 500) : null,
    thumbnail: readLaunchThumbnail("thumbnail" in entry ? entry.thumbnail : null),
  };
}

export function readRecentList(value: unknown): RecentLink[] {
  const entries = new Map<string, RecentLink>();
  if (Array.isArray(value)) for (const item of value) {
    const entry = readRecentLink(item);
    if (entry && !entries.has(entry.url)) entries.set(entry.url, entry);
    if (entries.size === recentLimit) break;
  }
  return [...entries.values()];
}
