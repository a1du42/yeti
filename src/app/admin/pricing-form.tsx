"use client";

import { CheckCircle } from "@phosphor-icons/react";
import { useActionState, useEffect, useState } from "react";
import { formatUsd } from "@/lib/money";
import { savePricing, type PricingState } from "./actions";
import styles from "./admin.module.css";

const factorText = (factor: number) => (factor / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 });

export function PricingForm({ initial }: { initial: NonNullable<PricingState["settings"]> }) {
  const [state, submit, pending] = useActionState(savePricing, { settings: initial });
  const [current, setCurrent] = useState(initial);
  const [value, setValue] = useState(factorText(initial.factor));
  const [showSuccess, setShowSuccess] = useState(false);
  const settings = state.settings ?? current;
  const draft = /^\d{0,3}(?:[.,]\d{1,2})?$/.test(value) ? Number(value.replace(",", ".")) : NaN;
  const valid = value !== "" && draft >= 0.01 && draft <= 100;
  const fieldError = value !== "" && !valid && !/[.,]$/.test(value)
    ? "Введите число с двумя знаками после запятой или меньше." : state.invalid ? state.error : undefined;

  useEffect(() => {
    if (state.settings) setCurrent(state.settings);
    if (!state.saved || !state.settings) return;
    setValue(factorText(state.settings.factor));
    setShowSuccess(true);
    const timer = window.setTimeout(() => setShowSuccess(false), 4500);
    return () => window.clearTimeout(timer);
  }, [state]);

  return <section className={`${styles.panel} ${styles.pricing}`} aria-labelledby="pricing-heading">
    <div className={styles.sectionHeading}>
      <h2 id="pricing-heading">Цены услуг</h2>
      <p className={styles.secondary}>Базовая цена умножается на коэффициент. Суммы уже созданных заказов не меняются.</p>
    </div>
    <div className={styles.pricingBody}>
      <form action={submit} className={styles.form} aria-busy={pending}>
        <input type="hidden" name="revision" value={settings.revision} />
        <div className="field">
          <label htmlFor="price-factor">Коэффициент цен</label>
          <div className={styles.unitInput}>
            <input id="price-factor" name="factor" inputMode="decimal" autoComplete="off" value={value} maxLength={8} required readOnly={pending}
              aria-invalid={!!fieldError || undefined} aria-describedby={`factor-hint${fieldError ? " factor-error" : ""}`}
              onChange={event => {
                const input = event.target.value;
                const number = Number(input.replace(",", "."));
                const complete = /^-?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(input);
                setShowSuccess(false);
                setValue(complete && number > 100 ? "100" : complete && number < 0.01 ? "0,01" : input);
                if (input === "0") {
                  const target = event.currentTarget;
                  requestAnimationFrame(() => { if (target.value === "0,01") target.setSelectionRange(1, 4); });
                }
              }} />
            <span aria-hidden="true">×</span>
          </div>
          <small id="factor-hint">От 0,01 до 100, до двух знаков после запятой. Значения вне диапазона заменяются ближайшей границей.</small>
          {fieldError && <p id="factor-error" className="error" role="alert">{fieldError}</p>}
        </div>
        <div><button className="button button-primary" disabled={pending || !valid || draft === settings.factor / 100}>
          {pending ? "Сохраняем…" : "Сохранить"}
        </button></div>
        {state.error && !state.invalid && <p className="error" role="alert">{state.error}</p>}
      </form>
      <dl className={styles.pricingExample}>
        <div><dt>Действующий коэффициент</dt><dd>×{factorText(settings.factor)}</dd></div>
        <div><dt>Как изменится цена {formatUsd(1000)}</dt><dd>{valid ? formatUsd(Math.round(draft * 1000)) : "—"}</dd></div>
      </dl>
    </div>
    <div role="status">{showSuccess && <p className={styles.toast}><CheckCircle size={20} aria-hidden="true" />Коэффициент сохранён</p>}</div>
  </section>;
}
