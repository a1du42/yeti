import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const base = getServerEnv().BETTER_AUTH_URL;
  const validFormat = token && /^[A-Za-z0-9_-]{16,512}$/.test(token);
  const response = NextResponse.redirect(new URL(validFormat ? "/app/auth?reset=1" : "/app/auth?invalid=1", base), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  if (validFormat) response.cookies.set("yeti-reset", token, {
    httpOnly: true,
    secure: base.startsWith("https:"),
    sameSite: "strict",
    path: "/api/auth/reset-password",
    maxAge: 3600,
  });
  return response;
}
