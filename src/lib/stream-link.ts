export type Platform = "twitch" | "youtube" | "kick";
export type StreamTarget = { platform: Platform; id: string; kind: "video" | "channel" | "clip"; url: string };
export type StreamInfo = StreamTarget & { title: string | null; author: string | null; description: string | null; thumbnail: string | null; warning: string | null };
export const platformNames: Record<Platform, string> = { twitch: "Twitch", youtube: "YouTube", kick: "Kick" };

export function parseStreamLink(input: string): StreamTarget | null {
  try {
    const url = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
    const parts = url.pathname.split("/").filter(Boolean);
    if (["youtube.com", "youtu.be"].includes(host)) {
      const id = host === "youtu.be" ? parts[0] : parts[0] === "watch" ? url.searchParams.get("v") : ["live", "shorts", "embed"].includes(parts[0]) ? parts[1] : null;
      if (!id || !/^[\w-]{11}$/.test(id)) return null;
      return { platform: "youtube", id, kind: "video", url: `https://www.youtube.com/watch?v=${id}` };
    }
    if (host === "twitch.tv") {
      if (parts[0] === "videos" && /^\d+$/.test(parts[1] ?? "") && parts.length === 2) return { platform: "twitch", kind: "video", id: parts[1], url: `https://www.twitch.tv/videos/${parts[1]}` };
      if (parts.length === 1 && /^[a-zA-Z0-9_]{2,25}$/.test(parts[0]) && !["directory", "downloads", "settings", "subscriptions", "inventory", "wallet", "login", "signup", "search", "videos"].includes(parts[0].toLowerCase())) return { platform: "twitch", kind: "channel", id: parts[0].toLowerCase(), url: `https://www.twitch.tv/${parts[0].toLowerCase()}` };
      if (parts.length === 3 && parts[1] === "clip" && /^[\w-]{1,150}$/.test(parts[2])) return { platform: "twitch", kind: "clip", id: parts[2], url: `https://clips.twitch.tv/${parts[2]}` };
    }
    if (host === "clips.twitch.tv" && parts.length === 1 && /^[\w-]{1,150}$/.test(parts[0])) return { platform: "twitch", kind: "clip", id: parts[0], url: `https://clips.twitch.tv/${parts[0]}` };
    if (host === "kick.com") {
      if (parts.length === 1 && /^[a-zA-Z0-9_-]{2,40}$/.test(parts[0]) && !["categories", "search", "settings", "login", "register", "browse"].includes(parts[0].toLowerCase())) return { platform: "kick", kind: "channel", id: parts[0].toLowerCase(), url: `https://kick.com/${parts[0].toLowerCase()}` };
      if (parts.length === 3 && parts[1] === "videos" && /^[0-9a-f-]{36}$/i.test(parts[2])) return { platform: "kick", kind: "video", id: parts[2], url: `https://kick.com/${parts[0].replace(/[^\w-]/g, "")}/videos/${parts[2]}` };
    }
  } catch { /* Некорректный адрес не отправляется в сеть. */ }
  return null;
}
