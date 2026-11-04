import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { getServerEnv } from "./env";
import { readLaunchThumbnail } from "./launch-recent";
import { parseStreamLink, type StreamInfo } from "./stream-link";

const audience = "yeti-launch-source";
const secret = () => new TextEncoder().encode(getServerEnv().BETTER_AUTH_SECRET);

export function signLaunchSource(userId: string, info: StreamInfo) {
  return new SignJWT({ url: info.url, kind: info.kind, title: info.title?.slice(0, 500), thumbnail: readLaunchThumbnail(info.thumbnail) })
    .setProtectedHeader({ alg: "HS256", typ: "yeti-launch-source+jwt" })
    .setAudience(audience).setSubject(userId).setExpirationTime("2h").sign(secret());
}

export async function readLaunchSource(userId: string, token: string) {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ["HS256"], typ: "yeti-launch-source+jwt", audience, subject: userId,
    });
    const source = typeof payload.url === "string" ? parseStreamLink(payload.url) : null;
    if (!source || (payload.kind !== source.kind && payload.kind !== "stream")) return null;
    return { ...source, sourceKind: source.kind, kind: payload.kind === "stream" ? "stream" as const : source.kind,
      title: typeof payload.title === "string" ? payload.title.slice(0, 500) : null,
      thumbnail: readLaunchThumbnail(payload.thumbnail) };
  } catch {
    return null;
  }
}
