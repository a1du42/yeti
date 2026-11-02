"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowClockwise, ArrowSquareOut, CheckCircle, Clock, Receipt, Wallet, WarningCircle } from "@phosphor-icons/react";
import { formatUsd, usdCents } from "@/lib/money";
import styles from "./payment-panel.module.css";

type Operation = { id: string; amountCents: number; creditCents: number; status: string; createdAt: string; creditedAt: string | null; checkoutUrl: string | null };
type Overview = { balanceCents: number; history: Operation[]; settings: { enabled: boolean; minCents: number | null; maxCents: number | null; feePayer: string | null } };
const statuses: Record<string, string> = {
  creating: "Счёт не подтверждён", process: "Обрабатывается", check: "Ожидает оплаты", confirm_check: "Подтверждается",
  paid: "Оплачено", paid_over: "Оплачено с переплатой", wrong_amount: "Неполная оплата", wrong_amount_waiting: "Ожидает доплаты",
  fail: "Ошибка оплаты", cancel: "Срок истёк или отменено", system_fail: "Ошибка обработки", locked: "На проверке",
  refund_process: "Возврат обрабатывается", refund_fail: "Ошибка возврата", refund_paid: "Возвращено",
};
const failures = ["fail", "cancel", "system_fail", "wrong_amount", "locked", "refund_fail"];
function Status({ value }: { value: string }) {
  const Icon = value === "paid" || value === "paid_over" ? CheckCircle : failures.includes(value) ? WarningCircle : Clock;
  return <span className={styles.status} data-state={Icon === CheckCircle ? "success" : "pending"}><Icon size={18} weight="regular" aria-hidden="true" />{statuses[value] ?? "Требует проверки"}</span>;
}

export function PaymentPanel({ active, onConfirmed }: { active: boolean; onConfirmed: (message: string) => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [amount, setAmount] = useState("10");
  const [fieldError, setFieldError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const pending = useRef(false);
  const key = useRef<{ amount: string; value: string } | null>(null);
  const lastBalance = useRef<number | null>(null);

  const run = useCallback(async (path: string, body?: object) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch(path, {
        method: body ? "POST" : "GET", cache: "no-store", credentials: "same-origin", signal: controller.signal,
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Не удалось получить данные оплаты.");
      if (controller.signal.aborted || request.current !== controller) throw new Error("Запрос отменён.");
      return result;
    } finally { window.clearTimeout(timer); }
  }, []);

  const load = useCallback(async () => {
    const result: Overview = await run("/api/payments");
    setData(result);
    setUpdated(new Intl.DateTimeFormat("ru", { timeStyle: "short" }).format(new Date()));
    if (lastBalance.current !== null && result.balanceCents > lastBalance.current) onConfirmed(`Зачислено ${formatUsd(result.balanceCents - lastBalance.current)}.`);
    lastBalance.current = result.balanceCents;
  }, [run, onConfirmed]);

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    setLoading(true);
    setError("");
    load().catch(() => { if (mounted) setError("Не удалось загрузить оплату. Повторите обновление."); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; request.current?.abort(); };
  }, [active, load]);

  const min = data?.settings.minCents ?? 100;
  const max = data?.settings.maxCents ?? 100_000;
  function validateAmount(value: string) {
    const cents = usdCents(value);
    return cents === null || cents < min || cents > max
      ? "Введите сумму от 1 до 1000 USD с точностью до цента." : "";
  }
  function updateAmount(value: string) {
    const number = Number(value);
    const next = value && Number.isFinite(number) && (number * 100 < min || number * 100 > max)
      ? String(Math.min(max, Math.max(min, number * 100)) / 100) : value;
    setAmount(next);
    if (fieldError) setFieldError(validateAmount(next));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    const validation = validateAmount(amount);
    if (validation) {
      setFieldError(validation);
      input.current?.focus();
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    // Ключ сохраняется при timeout. Повтор той же суммы продолжает тот же счёт.
    if (key.current?.amount !== amount) key.current = { amount, value: crypto.randomUUID() };
    try {
      const result = await run("/api/payments", { amount, requestKey: key.current.value });
      if (!result.url) throw new Error("Ссылка на оплату пока недоступна. Обновите статус счёта.");
      window.location.assign(result.url);
    } catch (reason) {
      setError(reason instanceof Error && reason.name !== "AbortError" ? reason.message : "Ответ не получен. Повторите запрос с той же суммой или обновите историю.");
    } finally { pending.current = false; setBusy(false); }
  }

  async function refresh(id?: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      if (id) await run(`/api/payments/${id}`, {});
      await load();
    } catch (reason) { setError(reason instanceof Error && reason.name !== "AbortError" ? reason.message : "Не удалось обновить статус. Повторите запрос."); }
    finally { pending.current = false; setBusy(false); }
  }

  return <div className={styles.panel} aria-busy={busy || loading}>
    <div className={styles.intro}><p>Пополняйте баланс в долларах США через Heleket. Криптовалюту и сеть можно выбрать на странице оплаты.</p></div>
    {error && <p className="error" role="alert">{error}{data ? " Последние полученные данные сохранены ниже." : ""}</p>}
    <div className={styles.layout}>
      <section className={styles.balance} aria-labelledby="payment-balance">
        <div className={styles.balanceHeading}><h2 id="payment-balance">Баланс</h2><Wallet size={24} weight="regular" aria-hidden="true" /></div>
        <p className={styles.balanceValue}>{data ? formatUsd(data.balanceCents) : "—"}</p>
        <p className={styles.small}>{data ? "Подтверждённые зачисления в USD" : loading ? "Загружаем баланс…" : "Баланс пока не получен"}</p>
        {updated && <p className={styles.small}>Обновлено в {updated}</p>}
      </section>
      <form className={styles.form} onSubmit={submit} noValidate aria-labelledby="payment-topup">
        <h2 id="payment-topup">Пополнение баланса</h2>
        <div className="field">
          <label htmlFor="payment-amount">Сумма, USD <span className={styles.optional}>(обязательно)</span></label>
          <input id="payment-amount" ref={input} type="number" inputMode="decimal" min={min / 100} max={max / 100} step="0.01" required value={amount} disabled={busy}
            aria-invalid={Boolean(fieldError)} aria-describedby={`payment-hint${fieldError ? " payment-amount-error" : ""}`}
            onChange={event => updateAmount(event.target.value)} onBlur={() => setFieldError(validateAmount(amount))} />
          <p id="payment-hint" className={styles.small}>От {formatUsd(min)} до {formatUsd(max)}, с точностью до цента. Значение вне диапазона сразу заменяется ближайшей границей. Поле можно очистить.</p>
          {fieldError && <p id="payment-amount-error" className="error">{fieldError}</p>}
        </div>
        <div className={styles.presets} role="group" aria-label="Суммы пополнения">{[10, 25, 50].map(value => <button className="button" type="button" disabled={busy} key={value} onClick={() => updateAmount(String(value))}>{formatUsd(value * 100)}</button>)}</div>
        <dl className={styles.summary}>
          <div><dt>На баланс</dt><dd>{usdCents(amount) !== null ? formatUsd(usdCents(amount)!) : "—"}</dd></div>
          <div><dt>Комиссия</dt><dd>За счёт клиента</dd></div>
        </dl>
        <p className={styles.small}>Комиссия добавляется к сумме счёта. Итог в выбранной криптовалюте покажет Heleket до перевода. Подтверждённая переплата также зачисляется в USD по курсу счёта; доли цента отбрасываются. Зачисление происходит после подтверждения оплаты.</p>
        <button type="submit" className="button button-primary" disabled={busy || loading || !data?.settings.enabled}>{busy ? "Обрабатываем…" : "Перейти к оплате"}</button>
        {data && !data.settings.enabled && <p className={styles.small}>Приём платежей пока недоступен.</p>}
      </form>
    </div>
    <section className={styles.history} aria-labelledby="payment-history">
      <div className={styles.historyHeading}><h2 id="payment-history">История пополнений</h2><button type="button" className="button" aria-label="Обновить историю пополнений" disabled={busy || loading} onClick={() => refresh()}><ArrowClockwise size={20} weight="regular" aria-hidden="true" /></button></div>
      {data && data.history.length === 0 && <p className={styles.small}>Пополнений пока нет. Создайте первый счёт выше.</p>}
      <ul className={styles.operations}>{data?.history.map(operation => <li key={operation.id}>
        <span className={styles.operationIcon}><Receipt size={22} weight="regular" aria-hidden="true" /></span>
        <div className={styles.operationDescription}><strong>Счёт на {formatUsd(operation.amountCents)}</strong><span>{new Intl.DateTimeFormat("ru", { dateStyle: "short", timeStyle: "short" }).format(new Date(operation.createdAt))} · {operation.id}</span>
          <Status value={operation.status} />{operation.creditCents > 0 && <span>Зачислено {formatUsd(operation.creditCents)}</span>}
        </div>
        <div className={styles.outcome}>
          {operation.checkoutUrl && !operation.creditedAt && !["cancel", "fail", "system_fail"].includes(operation.status) && <a href={operation.checkoutUrl} className="button" aria-label={`Открыть оплату счёта ${operation.id}`}><ArrowSquareOut size={20} weight="regular" aria-hidden="true" /></a>}
          <button type="button" className="button" aria-label={`Обновить статус счёта ${operation.id}`} disabled={busy || loading} onClick={() => refresh(operation.id)}><ArrowClockwise size={20} weight="regular" aria-hidden="true" /></button>
        </div>
      </li>)}</ul>
      {data && data.history.length === 50 && <p className={styles.small}>Показаны последние 50 счетов.</p>}
    </section>
  </div>;
}
