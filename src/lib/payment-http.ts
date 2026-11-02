import "server-only";
import { NextResponse } from "next/server";
import { getAuth } from "./auth";
import { getServerEnv } from "./env";
import { PaymentError } from "./payments";
import { getDb } from "./db";
import { rateLimit } from "@/db/schema";
import { sql } from "drizzle-orm";
import { HeleketInactiveError } from "./heleket";

export async function paymentUser(request: Request, mutation = false) {
  if (mutation && request.headers.get("origin") !== new URL(getServerEnv().BETTER_AUTH_URL).origin) {
    throw new PaymentError("Обновите страницу и повторите действие.", 403);
  }
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user.emailVerified) throw new PaymentError("Войдите в аккаунт для оплаты.", 401);
  if (mutation) {
    const key = `payments:${session.user.id}`;
    const now = Date.now();
    const [limit] = await getDb().insert(rateLimit).values({ id: key, key, count: 1, lastRequest: now })
      .onConflictDoUpdate({ target: rateLimit.key, set: {
        count: sql`case when ${rateLimit.lastRequest} < ${now - 60_000} then 1 else ${rateLimit.count} + 1 end`,
        lastRequest: sql`case when ${rateLimit.lastRequest} < ${now - 60_000} then ${now} else ${rateLimit.lastRequest} end`,
      } }).returning({ count: rateLimit.count });
    if (limit.count > 20) throw new PaymentError("Слишком много запросов. Подождите минуту.", 429);
  }
  return session.user.id;
}

export async function paymentJson(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new PaymentError("Ожидается JSON.", 415);
  // Ограничиваем и chunked body, а не только доверяем Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new PaymentError("Пустой запрос.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16_384) { await reader.cancel(); throw new PaymentError("Слишком большой запрос.", 413); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof PaymentError) throw error;
    throw new PaymentError("Некорректный запрос.");
  } finally { reader.releaseLock(); }
}

export function paymentResponse(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}
export function paymentFailure(error: unknown) {
  if (error instanceof PaymentError) return paymentResponse({ error: error.message }, error.status);
  if (error instanceof HeleketInactiveError) {
    console.error("heleket_api_inactive");
    return paymentResponse({ error: "Оплата пока недоступна. Попробуйте позже." }, 503);
  }
  console.error("payment_request_failed");
  return paymentResponse({ error: "Не удалось подтвердить результат. Обновите статус счёта или повторите тот же запрос." }, 503);
}
