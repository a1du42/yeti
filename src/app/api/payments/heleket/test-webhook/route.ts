import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { verification } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { verifyWebhook } from "@/lib/heleket";
import { paymentFailure, paymentJson, paymentResponse } from "@/lib/payment-http";
import { PaymentError } from "@/lib/payments";

export const runtime = "nodejs";

// Отдельный приёмник официального test-webhook/payment. Не обращается к
// payment/payment_credit и никогда не подтверждает реальное пополнение.
export async function POST(request: Request) {
  try {
    if (!getServerEnv().HELEKET_PAYMENT_KEY) throw new PaymentError("Приём уведомлений не настроен.", 503);
    const probe = z.uuid().safeParse(new URL(request.url).searchParams.get("probe"));
    if (!probe.success) throw new PaymentError("Проверка не найдена.", 404);
    const body = await paymentJson(request);
    const parsed = z.object({ type: z.literal("payment"), currency: z.literal("ETH"), network: z.literal("eth"), status: z.literal("paid") }).safeParse(body);
    if (!parsed.success || !verifyWebhook(body as Record<string, unknown>)) throw new PaymentError("Неверное тестовое уведомление.", 403);
    const filter = and(eq(verification.id, probe.data), eq(verification.identifier, "heleket-webhook-probe"), gt(verification.expiresAt, new Date()));
    const db = getDb();
    const [row] = await db.select({ value: verification.value }).from(verification).where(filter);
    if (!row) throw new PaymentError("Проверка не найдена или истекла.", 404);
    if (row.value === "pending") {
      await db.update(verification).set({ value: JSON.stringify({ receivedAt: new Date().toISOString(), status: parsed.data.status, signatureVerified: true }) })
        .where(and(filter, eq(verification.value, "pending")));
    }
    return paymentResponse({ ok: true, test: true });
  } catch (error) { return paymentFailure(error); }
}
