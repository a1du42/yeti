"use client";

import { useRef, useState, type FormEvent } from "react";
import { CheckCircle, Flask, Receipt, ShieldCheck, Wallet } from "@phosphor-icons/react";
import styles from "./payment-sandbox.module.css";

// Вымышленные данные стенда. Не являются финансовыми условиями или данными аккаунта.
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 50_000;
const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
const operations = [
  { id: "DEMO-001", title: "Тестовое пополнение", date: "1 ноября · 12:40 МСК", amount: 5000, status: "Зачислено", Icon: Wallet },
  { id: "DEMO-002", title: "Тестовое списание", date: "1 ноября · 13:15 МСК", amount: -750, status: "Проведено", Icon: Receipt },
  { id: "DEMO-003", title: "Тестовое списание", date: "2 ноября · 09:20 МСК", amount: -1000, status: "Проведено", Icon: Receipt },
];

function validateAmount(value: string, badInput = false) {
  if (badInput) return "Введите сумму числом.";
  if (!value) return "Введите сумму для проверки расчёта.";
  const number = Number(value);
  if (!Number.isFinite(number)) return "Введите сумму числом.";
  if (number < MIN_AMOUNT || number > MAX_AMOUNT) return "Укажите сумму от 100 до 50 000 ₽.";
  if (!Number.isInteger(number)) return "Введите целое число рублей, без дробной части.";
  return "";
}

export function PaymentSandbox({ onCalculated }: { onCalculated: (message: string) => void }) {
  const [amount, setAmount] = useState("1000");
  const [error, setError] = useState("");
  const [checkedAmount, setCheckedAmount] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const validAmount = !validateAmount(amount);
  const formattedAmount = validAmount ? money.format(Number(amount)) : "—";

  function updateAmount(value: string, badInput = false) {
    const number = Number(value);
    const next = value && Number.isFinite(number) && (number < MIN_AMOUNT || number > MAX_AMOUNT)
      ? String(Math.min(MAX_AMOUNT, Math.max(MIN_AMOUNT, number))) : value;
    setAmount(next);
    setCheckedAmount(null);
    if (checkedAmount !== null) onCalculated("");
    if (error) setError(validateAmount(next, badInput));
  }

  function checkCalculation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateAmount(amount, input.current?.validity.badInput);
    setError(validationError);
    if (validationError) {
      input.current?.focus();
      return;
    }
    setCheckedAmount(Number(amount));
    onCalculated(`Тестовый расчёт проверен: ${money.format(Number(amount))}. Платёж не выполнялся.`);
  }

  return <div className={styles.sandbox}>
    <div className={styles.intro}>
      <span className={styles.badge}><Flask size={20} weight="regular" aria-hidden="true" />Тестовый стенд</span>
      <p>Все суммы и операции вымышлены. Здесь можно проверить расчёт пополнения.</p>
    </div>
    <div className={styles.layout}>
      <div className={styles.overview}>
        <section className={styles.balance} aria-labelledby="sandbox-balance">
          <div className={styles.balanceHeading}><h2 id="sandbox-balance">Тестовый баланс</h2><Wallet size={24} weight="regular" aria-hidden="true" /></div>
          <p className={styles.balanceValue}>{money.format(3250)}</p>
          <p className={styles.small}>Пример доступной суммы</p>
          <dl className={styles.balanceDetails}>
            <div><dt>Пополнения</dt><dd>{money.format(5000)}</dd></div>
            <div><dt>Расходы</dt><dd>{money.format(1750)}</dd></div>
          </dl>
        </section>
        <div className={styles.notice}>
          <ShieldCheck size={28} weight="regular" aria-hidden="true" />
          <div><h3>Без реального списания</h3><p>Реквизиты карты не запрашиваются, деньги не переводятся. Проверка расчёта не меняет тестовый баланс и историю.</p></div>
        </div>
      </div>
      <form className={styles.form} onSubmit={checkCalculation} noValidate aria-labelledby="sandbox-topup">
        <h2 id="sandbox-topup">Пополнение баланса</h2>
        <p className={styles.small}>Посмотрите итог на тестовой сумме.</p>
        <div className="field">
          <label htmlFor="sandbox-amount">Сумма, ₽ <span className={styles.optional}>(обязательно)</span></label>
          <input id="sandbox-amount" ref={input} type="number" inputMode="numeric" min={MIN_AMOUNT} max={MAX_AMOUNT} step={1} required value={amount}
            aria-invalid={Boolean(error)} aria-describedby={`sandbox-amount-hint${error ? " sandbox-amount-error" : ""}`}
            onChange={(event) => updateAmount(event.target.value, event.target.validity.badInput)} />
          <p id="sandbox-amount-hint" className={styles.small}>Для примера: от 100 до 50 000 ₽, целое число. Значение вне диапазона сразу заменяется ближайшей границей. Поле можно очистить.</p>
          {error && <p id="sandbox-amount-error" className="error">{error}</p>}
        </div>
        <div className={styles.presets} role="group" aria-label="Примеры сумм">
          {[500, 1000, 2500].map((value) => <button type="button" className="button" key={value} onClick={() => updateAmount(String(value))}>{money.format(value)}</button>)}
        </div>
        <dl className={styles.summary}>
          <div><dt>На баланс в примере</dt><dd>{formattedAmount}</dd></div>
          <div><dt>Комиссия в примере</dt><dd>{money.format(0)}</dd></div>
          <div className={styles.total}><dt>Итого в примере</dt><dd>{formattedAmount}</dd></div>
        </dl>
        <button type="submit" className="button button-primary">Проверить расчёт</button>
        <p className={styles.small}>Валюта, комиссия и лимиты вымышлены. Реальная оплата не подключена.</p>
        {checkedAmount !== null && <p className={styles.result}><CheckCircle size={20} weight="regular" aria-hidden="true" /><span>Расчёт проверен: {money.format(checkedAmount)}. Платёж не выполнялся.</span></p>}
      </form>
    </div>
    <section className={styles.history} aria-labelledby="sandbox-history">
      <div className={styles.historyHeading}><h2 id="sandbox-history">История операций</h2><span className={styles.small}>Пример · ноябрь 2026</span></div>
      <ul className={styles.operations}>
        {operations.map(({ id, title, date, amount: value, status, Icon }) => <li key={id}>
          <span className={styles.operationIcon}><Icon size={22} weight="regular" aria-hidden="true" /></span>
          <div className={styles.operationDescription}><strong>{title}</strong><span>{date} · {id}</span></div>
          <div className={styles.outcome}>
            <strong className={value > 0 ? styles.credit : undefined}>{value > 0 ? "+" : "−"}{money.format(Math.abs(value))}</strong>
            <span className={styles.status}><CheckCircle size={18} weight="regular" aria-hidden="true" />{status}</span>
          </div>
        </li>)}
      </ul>
      <p className={styles.small}>Все операции — примеры. Даты указаны по московскому времени.</p>
    </section>
  </div>;
}
