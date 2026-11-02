import { z } from "zod";
import { eq } from "drizzle-orm";
import { payment } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { verifyWebhook } from "@/lib/heleket";
import { paymentFailure, paymentJson, paymentResponse } from "@/lib/payment-http";
import { PaymentError, reconcilePayment } from "@/lib/payments";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (!getServerEnv().HELEKET_PAYMENT_KEY) throw new PaymentError("Приём уведомлений не настроен.", 503);
    const body = await paymentJson(request);
    const parsed = z.object({ type: z.literal("payment"), uuid: z.uuid(), order_id: z.uuid() }).safeParse(body);
    if (!parsed.success || !verifyWebhook(body as Record<string, unknown>)) throw new PaymentError("Неверная подпись уведомления.", 403);
    const [row] = await getDb().select({ providerId: payment.providerId }).from(payment).where(eq(payment.id, parsed.data.order_id));
    if (!row || (row.providerId && row.providerId !== parsed.data.uuid)) throw new PaymentError("Счёт не найден.", 404);
    // Подпись обязательна; статус и суммы дополнительно сверяются через payment/info.
    await reconcilePayment(parsed.data.order_id);
    return paymentResponse({ ok: true });
  } catch (error) { return paymentFailure(error); }
}
