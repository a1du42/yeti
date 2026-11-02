import { z } from "zod";
import { paymentSettings } from "@/lib/heleket";
import { paymentFailure, paymentJson, paymentResponse, paymentUser } from "@/lib/payment-http";
import { usdCents } from "@/lib/money";
import { PaymentError, paymentOverview, reconcilePayment, reservePayment } from "@/lib/payments";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const userId = await paymentUser(request);
    return paymentResponse({ ...await paymentOverview(userId), settings: paymentSettings() });
  } catch (error) { return paymentFailure(error); }
}
export async function POST(request: Request) {
  try {
    const userId = await paymentUser(request, true);
    const settings = paymentSettings();
    if (!settings.enabled) throw new PaymentError("Приём платежей пока недоступен.", 503);
    const parsed = z.object({ amount: z.string().max(32), requestKey: z.uuid() }).safeParse(await paymentJson(request));
    if (!parsed.success) throw new PaymentError("Проверьте сумму и повторите запрос.");
    const cents = usdCents(parsed.data.amount);
    if (cents === null || cents < settings.minCents! || cents > settings.maxCents!) throw new PaymentError("Введите сумму от 1 до 1000 USD с точностью до цента.");
    const row = await reservePayment(userId, parsed.data.requestKey, cents, settings.feePayer!);
    return paymentResponse(await reconcilePayment(row.id, userId, true));
  } catch (error) { return paymentFailure(error); }
}
