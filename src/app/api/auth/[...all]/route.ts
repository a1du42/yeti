import { cookies } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";
import { confirmEmail } from "@/lib/email-verification";
import { isTimezone } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postPaths = new Set(["/sign-in/email", "/sign-up/email", "/sign-out", "/get-session", "/update-user", "/request-password-reset", "/reset-password", "/send-verification-email"]);
const genericLogin = "Не удалось войти. Проверьте почту и пароль, подтвердите адрес или восстановите доступ";

async function handle(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname.slice("/api/auth".length);
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const allowed = request.method === "POST" ? postPaths.has(path) || (googleEnabled && path === "/sign-in/social") : path === "/get-session" || path === "/verify-email" || /^\/reset-password\/[^/]+$/.test(path) || (googleEnabled && path === "/callback/google");
  if (!allowed) return Response.json({ message: "Способ входа недоступен" }, { status: 404 });
  const env = getServerEnv();
  const origin = new URL(env.BETTER_AUTH_URL).origin;
  if (path === "/verify-email") {
    const verified = await confirmEmail(url.searchParams.get("token") || "");
    const redirectHeaders = new Headers({ Location: origin + (verified ? "/app/auth" : "/app/auth?invalid=1"), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    redirectHeaders.append("Set-Cookie", verified ? `yeti-verified=1; Path=/app/auth; Max-Age=60; HttpOnly; SameSite=Lax${origin.startsWith("https:") ? "; Secure" : ""}` : "yeti-verified=; Path=/app/auth; Max-Age=0; HttpOnly; SameSite=Lax");
    return new Response(null, { status: 303, headers: redirectHeaders });
  }
  if (/^\/reset-password\/[^/]+$/.test(path)) url.searchParams.set("callbackURL", origin + "/app/auth/reset");
  const headers = new Headers(request.headers);
  // The app is loopback-only by default. Production proxy must overwrite its configured header.
  const proxyHeader = process.env.AUTH_TRUSTED_PROXY_HEADER;
  const trustedIp = proxyHeader ? request.headers.get(proxyHeader) : "127.0.0.1";
  for (const key of ["x-forwarded-for", "x-real-ip", "x-yeti-client-ip", "forwarded"]) headers.delete(key);
  headers.set("x-yeti-client-ip", trustedIp && !trustedIp.includes(",") ? trustedIp : "unknown");
  let body: string | undefined;
  if (request.method === "POST" && path === "/get-session") {
    // Better Auth's automatic refresh sends a bodyless POST; this endpoint has no body inputs.
    headers.delete("content-length");
    headers.delete("content-type");
  } else if (request.method === "POST") {
    if (!headers.get("content-type")?.startsWith("application/json")) return Response.json({ message: "Ожидается JSON" }, { status: 415 });
    if (Number(headers.get("content-length")) > 16_384) return Response.json({ message: "Слишком большой запрос" }, { status: 413 });
    const raw = await request.text();
    if (raw.length > 16_384) return Response.json({ message: "Слишком большой запрос" }, { status: 413 });
    let data: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      data = parsed as Record<string, unknown>;
    } catch { return Response.json({ message: "Проверьте отправленные данные" }, { status: 400 }); }
    if (path === "/sign-in/social") {
      if (data.provider !== "google" || data.idToken) return Response.json({ message: "Способ входа недоступен" }, { status: 404 });
      const extra = data.additionalData as Record<string, unknown> | undefined;
      const zone = extra?.timezone;
      data = { provider: "google", callbackURL: origin + "/app", errorCallbackURL: origin + "/app/auth?oauthError=1", disableRedirect: data.disableRedirect === true, additionalData: { timezone: typeof zone === "string" && isTimezone(zone) ? zone : "" } };
    }
    if (path === "/sign-up/email" || path === "/send-verification-email") data.callbackURL = origin + "/app/auth?verified=1";
    if (path === "/request-password-reset") data.redirectTo = origin + "/app/auth/reset";
    if (path === "/sign-in/email") delete data.callbackURL;
    if (path === "/reset-password") {
      const token = (await cookies()).get("yeti-reset")?.value;
      if (!token) return Response.json({ code: "INVALID_TOKEN", message: "Ссылка недействительна или уже использована. Запросите новую" }, { status: 400 });
      data.token = token;
    }
    body = JSON.stringify(data);
    headers.delete("content-length");
  }
  const forwarded = new Request(url, { method: request.method, headers, body, signal: request.signal });
  let response = await getAuth().handler(forwarded);
  if (path === "/sign-in/email" && [400, 401, 403, 422].includes(response.status)) {
    response = Response.json({ code: "INVALID_CREDENTIALS", message: genericLogin }, { status: 401 });
  }
  if (path === "/sign-up/email" && response.ok) {
    response = Response.json({ status: true, message: "Проверьте почту для продолжения регистрации" });
  }
  const result = new Response(response.body, { status: response.status, statusText: response.statusText, headers: response.headers });
  result.headers.set("Cache-Control", "no-store");
  result.headers.set("Referrer-Policy", "no-referrer");
  if (path === "/reset-password" && response.ok) {
    result.headers.append("Set-Cookie", `yeti-reset=; Path=/api/auth/reset-password; Max-Age=0; HttpOnly; SameSite=Strict${origin.startsWith("https:") ? "; Secure" : ""}`);
  }
  return result;
}

export const GET = handle;
export const POST = handle;
