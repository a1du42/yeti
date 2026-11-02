import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { payment, paymentCredit } from "@/db/schema";
import { getDb } from "./db";
import { getServerEnv } from "./env";
import { checkoutUrl, heleketRequest, paymentSettings, type Invoice } from "./heleket";
import { usdCents, usdDecimal } from "./money";

export class PaymentError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function paymentOverview(userId: string) {
  return getDb().transaction(async tx => {
    const [totals] = await tx.select({ cents: sql<string>`coalesce(sum(${paymentCredit.amountCents}), 0)` }).from(paymentCredit).where(eq(paymentCredit.userId, userId));
    const history = await tx.select({
      id: payment.id, amountCents: payment.amountCents, status: payment.status,
      creditedAt: payment.creditedAt, createdAt: payment.createdAt, checkoutUrl: payment.checkoutUrl,
      creditCents: payment.creditCents,
    }).from(payment)
      .where(eq(payment.userId, userId)).orderBy(desc(payment.createdAt)).limit(50);
    return { balanceCents: Number(totals.cents), history };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function reservePayment(userId: string, requestKey: string, amountCents: number, feePayer: string) {
  return getDb().transaction(async tx => {
    // Сериализация создания для аккаунта: разные вкладки не обходят лимит запросов.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const [existing] = await tx.select().from(payment).where(and(eq(payment.userId, userId), eq(payment.requestKey, requestKey)));
    if (existing) {
      if (existing.amountCents !== amountCents) throw new PaymentError("Для другой суммы создайте новый счёт.", 409);
      return existing;
    }
    const [count] = await tx.select({ value: sql<number>`count(*)::int` }).from(payment)
      .where(and(eq(payment.userId, userId), gte(payment.createdAt, new Date(Date.now() - 60_000))));
    if (count.value >= 5) throw new PaymentError("Слишком много счетов. Подождите минуту и повторите.", 429);
    const [created] = await tx.insert(payment).values({ id: randomUUID(), userId, requestKey, amountCents, feePayer }).returning();
    return created;
  });
}

const SCALE = 10n ** 18n;
function decimal(value: string | null | undefined) {
  if (!value || !/^\d{1,18}(\.\d{1,18})?$/.test(value)) throw new Error("invalid_payment_amount");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(18, "0"));
}

function creditAmount(invoice: Invoice, amountCents: number) {
  if (invoice.payment_status === "paid") return amountCents;
  // Обе криптосуммы включают комиссию клиенту. Только превышение требуемой
  // payer_amount переводится в USD по курсу счёта. Комиссия не зачисляется.
  const excess = decimal(invoice.payment_amount) - decimal(invoice.payer_amount);
  const rate = decimal(invoice.payer_amount_exchange_rate);
  if (excess <= 0n || rate <= 0n) throw new Error("unconfirmed_overpayment");
  const cents = BigInt(amountCents) + excess * rate * 100n / (SCALE * SCALE);
  // Доли цента не округляем вверх; крупные аномальные платежи требуют сверки.
  if (cents > 2_147_483_647n) throw new Error("payment_requires_review");
  return Number(cents);
}

export async function reconcilePayment(id: string, userId?: string, create = false) {
  return getDb().transaction(async tx => {
    const [row] = await tx.select().from(payment).where(userId
      ? and(eq(payment.id, id), eq(payment.userId, userId)) : eq(payment.id, id)).for("update");
    if (!row) throw new PaymentError("Счёт не найден.", 404);
    if (create && row.checkoutUrl) return { id: row.id, url: checkoutUrl(row.checkoutUrl) };
    if (!row.checkoutUrl && row.status === "creating") create = true;
    if (create && !paymentSettings().enabled) throw new PaymentError("Приём платежей пока недоступен.", 503);
    const base = getServerEnv().BETTER_AUTH_URL;
    // Сохранённый id всегда повторяется как order_id: timeout не создаёт новый счёт.
    const invoice = await heleketRequest(create ? "payment" : "payment/info", create ? {
      amount: usdDecimal(row.amountCents), currency: "USD", order_id: row.id,
      url_return: `${base}/app?tab=payment`, url_success: `${base}/app?tab=payment`,
      url_callback: `${base}/api/payments/heleket/webhook`,
      subtract: row.feePayer === "customer" ? 100 : 0,
      accuracy_payment_percent: 0, is_payment_multiple: true,
    } : { order_id: row.id });
    if (invoice.order_id !== row.id || usdCents(invoice.amount) !== row.amountCents
      || (row.providerId && row.providerId !== invoice.uuid)) throw new Error("payment_mismatch");
    const url = invoice.url ? checkoutUrl(invoice.url) : row.checkoutUrl;
    if (create && !url) throw new Error("missing_checkout_url");
    const paid = invoice.is_final && ["paid", "paid_over"].includes(invoice.payment_status);
    let creditedAt = row.creditedAt;
    let creditCents = row.creditCents;
    if (paid) {
      const target = creditAmount(invoice, row.amountCents);
      if (target > creditCents) {
        await tx.insert(paymentCredit).values({ id: randomUUID(), paymentId: row.id, userId: row.userId, amountCents: target - creditCents, confirmedTotalCents: target });
        creditCents = target;
      }
      creditedAt ??= new Date();
    }
    // После зачисления устаревший pending-ответ не откатывает подтверждённое состояние.
    const status = creditedAt && !paid && !invoice.payment_status.startsWith("refund_") && invoice.payment_status !== "locked"
      ? row.status : invoice.payment_status;
    await tx.update(payment).set({ providerId: invoice.uuid, checkoutUrl: url, status, creditedAt, creditCents, updatedAt: new Date() }).where(eq(payment.id, row.id));
    return { id: row.id, url };
  });
}
