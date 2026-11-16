"use client";

import { useId, useState, type ComponentProps } from "react";
import { clampFollowerInterval, followerInterval, isFollowerInterval } from "@/lib/launch-orders";
import styles from "./launch-panel.module.css";

export function FollowerNumberInput({ value, onValue, normalize, readOnly, ...props }: Omit<
  ComponentProps<"input">, "value" | "onChange" | "onBlur" | "onFocus"
> & { value: string; onValue: (value: string) => void; normalize: (value: string) => string }) {
  const [fresh, setFresh] = useState(false);
  return <input {...props} type="number" inputMode="numeric" readOnly={readOnly} value={fresh && !readOnly ? "" : value}
    onFocus={() => { if (!readOnly) setFresh(true); }}
    onChange={event => { setFresh(false); onValue(event.currentTarget.value); }}
    onBlur={() => {
      setFresh(false);
      const normalized = normalize(value);
      if (!fresh && normalized !== value) onValue(normalized);
    }} />;
}

export function FollowerInterval({ value, onChange, pending }: {
  value: string; onChange: (value: string) => void; pending: boolean;
}) {
  const id = useId();
  const { min, max, step } = followerInterval;
  const invalid = !isFollowerInterval(Number(value));
  const maxLabel = max.toLocaleString("ru-RU");
  return <div className={styles.quantityField}>
    <label id={`${id}-label`} htmlFor={id}>Интервал между подписками, сек.</label>
    <div className={styles.intervalControls}>
      <input className={styles.rangeInput} type="range" min={min} max={max} step={step}
        value={clampFollowerInterval(value) || min} disabled={pending} onChange={event => onChange(event.target.value)}
        aria-labelledby={`${id}-label`} aria-describedby={`${id}-help`} />
      <FollowerNumberInput id={id} min={min} max={max} step={step} value={value} readOnly={pending}
        onValue={value => onChange(clampFollowerInterval(value))} normalize={clampFollowerInterval}
        aria-invalid={invalid} aria-describedby={`${id}-help${invalid ? ` ${id}-error` : ""}`} />
    </div>
    <p id={`${id}-help`} className={styles.muted}>{min}–{maxLabel} сек.</p>
    {invalid && <p id={`${id}-error`} className={styles.error}>Введите целое число от {min} до {maxLabel}.</p>}
  </div>;
}
