import { z } from "zod";
import { paymentFailure, paymentResponse, paymentUser } from "@/lib/payment-http";
import { PaymentError, reconcilePayment } from "@/lib/payments";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await paymentUser(request, true);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) throw new PaymentError("Счёт не найден.", 404);
    return paymentResponse(await reconcilePayment(id, userId));
  } catch (error) { return paymentFailure(error); }
}
