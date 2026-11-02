// Все суммы приложения хранятся в центах USD; десятичные строки не проходят через float.
export const CURRENCY = "USD";
export const MIN_TOPUP_CENTS = 100;
export const MAX_TOPUP_CENTS = 1_000_000;
export const formatUsd = (cents: number) => new Intl.NumberFormat("ru-RU", {
  style: "currency", currency: CURRENCY, currencyDisplay: "code",
}).format(cents / 100);

export function usdCents(value: string): number | null {
  const match = /^(0|[1-9]\d{0,7})(?:\.(\d{1,8}))?$/.exec(value);
  if (!match || /[1-9]/.test((match[2] ?? "").slice(2))) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").slice(0, 2).padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function usdDecimal(cents: number) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
