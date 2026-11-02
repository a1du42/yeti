import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getServerEnv } from "./env";
import { MAX_TOPUP_CENTS, usdCents } from "./money";

export class HeleketInactiveError extends Error {
  constructor() { super("heleket_api_inactive"); }
}

export function paymentSettings() {
  const env = getServerEnv();
  const min = usdCents(env.HELEKET_MIN_USD ?? "");
  const configuredMax = usdCents(env.HELEKET_MAX_USD ?? "");
  const max = configuredMax === null ? null : Math.min(configuredMax, MAX_TOPUP_CENTS);
  const policyReady = min !== null && max !== null && min > 0 && max >= min && max <= 100_000_000
    && Boolean(env.HELEKET_FEE_PAYER);
  return {
    enabled: env.HELEKET_ENABLED === "true" && policyReady
      && z.uuid().safeParse(env.HELEKET_MERCHANT_ID).success && Boolean(env.HELEKET_PAYMENT_KEY)
      && new URL(env.BETTER_AUTH_URL).protocol === "https:",
    minCents: min, maxCents: max, feePayer: env.HELEKET_FEE_PAYER || null,
  };
}

function signature(body: string) {
  const key = getServerEnv().HELEKET_PAYMENT_KEY;
  if (!key) throw new Error("payment_not_configured");
  return createHash("md5").update(Buffer.from(body).toString("base64") + key).digest("hex");
}

export function verifyWebhook(body: Record<string, unknown>) {
  const { sign, ...payload } = body;
  if (typeof sign !== "string" || !/^[a-f0-9]{32}$/i.test(sign)) return false;
  // Heleket использует JSON_UNESCAPED_UNICODE с PHP-экранированием slash.
  const json = JSON.stringify(payload).replace(/\//g, "\\/").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return timingSafeEqual(Buffer.from(sign, "hex"), Buffer.from(signature(json), "hex"));
}

export const invoiceSchema = z.object({
  uuid: z.uuid(), order_id: z.string(), amount: z.string(), currency: z.literal("USD"),
  payment_status: z.enum(["process", "check", "confirm_check", "paid", "paid_over", "wrong_amount", "wrong_amount_waiting", "fail", "cancel", "system_fail", "refund_process", "refund_fail", "refund_paid", "locked"]),
  is_final: z.boolean(), url: z.string().optional(),
  payment_amount: z.string().nullable().optional(),
  payer_amount: z.string().nullable().optional(),
  payer_amount_exchange_rate: z.string().nullable().optional(),
});
export type Invoice = z.infer<typeof invoiceSchema>;

export function checkoutUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password
    || !(url.hostname === "heleket.com" || url.hostname.endsWith(".heleket.com"))) throw new Error("invalid_checkout_url");
  return url.href;
}

export async function heleketRequest(path: "payment" | "payment/info", payload: Record<string, unknown>): Promise<Invoice> {
  const env = getServerEnv();
  const body = JSON.stringify(payload);
  const response = await fetch(`https://api.heleket.com/v1/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", merchant: env.HELEKET_MERCHANT_ID ?? "", sign: signature(body) },
    body, cache: "no-store", signal: AbortSignal.timeout(12_000), redirect: "error",
  });
  const result = await response.json();
  if (response.status === 401 && result.message === "Api not active.") throw new HeleketInactiveError();
  if (!response.ok) throw new Error("heleket_request_failed");
  if (result.state !== 0) throw new Error("heleket_request_failed");
  return invoiceSchema.parse(result.result);
}
