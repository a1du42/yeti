"use client";

import { useId, useState, type ReactNode } from "react";
import { ChartBar, ChatDots, Globe, ListBullets, Pause, Play, SlidersHorizontal, Timer, type Icon } from "@phosphor-icons/react";
import { twitchChartEndActions, twitchViewerGeos, twitchViewerModes, twitchViewerSettings, viewerChatInterval, viewerChatSettings } from "@/lib/twitch-viewer-settings";
import styles from "./launch-actions.module.css";

const modeLabels = ["Плавное подключение", "Плавное с колебаниями", "Свой график"];
const endLabels = ["Продолжить работу", "Повторить график", "Завершить заказ"];
const regions = new Intl.DisplayNames("ru", { type: "region" });
const numberFormat = new Intl.NumberFormat("ru");
const numericKeys = ["threads", "stream_views", "uniq_viewers", "raid_time", "connect_time", "geo_percent", "chatlist", "preferred_account_group",
  "manual_chart_randomization", "manual_chart_end_param"];

export function readViewerFields(form: HTMLFormElement) {
  const values: Record<string, unknown> = {};
  for (const [key, entry] of new FormData(form)) {
    if (typeof entry !== "string" || !entry.trim()) continue;
    if (key === "manual_chart") {
      const chart: Record<string, number> = {};
      for (const line of entry.trim().split(/\r?\n/)) {
        const point = /^\s*(0|[1-9][0-9]{0,2})\s*:\s*([0-9]+)\s*$/.exec(line);
        if (!point || Object.hasOwn(chart, point[1])) return null;
        chart[point[1]] = Number(point[2]);
      }
      values[key] = chart;
    } else {
      values[key] = numericKeys.includes(key) ? Number(entry) : key === "raid" ? entry === "on" : entry.trim();
    }
  }
  const parsed = twitchViewerSettings.safeParse(values);
  return parsed.success ? parsed.data : null;
}

function SettingsGroup({ title, icon: GroupIcon, children }: { title: string; icon: Icon; children: ReactNode }) {
  const titleId = useId();
  return <section className={styles.settingsGroup} aria-labelledby={titleId}>
    <h3 id={titleId} className={styles.groupTitle}>
      <span className={styles.groupIcon}><GroupIcon size={20} weight="regular" aria-hidden="true" /></span>
      {title}
    </h3>
    <div className={styles.settingsGrid}>{children}</div>
  </section>;
}

function SettingsField({ label, hint, wide = false, children }: {
  label: string;
  hint?: string;
  wide?: boolean;
  children: (props: { id: string; "aria-describedby"?: string }) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return <div className={wide ? `${styles.settingsField} ${styles.wideField}` : styles.settingsField}>
    <label htmlFor={id}>{label}</label>
    <div className={styles.fieldControl}>
      {children({ id, "aria-describedby": hintId })}
      {hint && <small id={hintId}>{hint}</small>}
    </div>
  </div>;
}

function NumberSetting({ name, label, min, max, unit, explainLimit }: {
  name: string; label: string; min: number; max: number; unit?: string; explainLimit?: boolean;
}) {
  const range = `${numberFormat.format(min)}–${numberFormat.format(max)}${unit ? ` ${unit}` : ""}`;
  return <SettingsField label={label} hint={explainLimit ? `${range}. За пределами диапазона подставится ближайшая граница.` : range}>{props =>
    <input {...props} name={name} type="number" inputMode="numeric" min={min} max={max} step={1} onChange={event => {
      const { value, valueAsNumber } = event.currentTarget;
      if (value !== "" && Number.isFinite(valueAsNumber) && (valueAsNumber < min || valueAsNumber > max)) {
        event.currentTarget.value = String(Math.min(max, Math.max(min, valueAsNumber)));
      }
    }} />
  }</SettingsField>;
}

export function TwitchViewerFields({ pending, quantity }: { pending: boolean; quantity: number }) {
  const [mode, setMode] = useState("");
  return <fieldset className={styles.viewerFields} disabled={pending}>
    <legend className="sr-only">Параметры зрителей</legend>
    <SettingsGroup title="Канал и просмотры" icon={ChartBar}>
      <SettingsField label="Новый канал Twitch" hint="Имя без ссылки, до 25 знаков.">{props =>
        <input {...props} name="channel" type="text" maxLength={25} autoComplete="off" />
      }</SettingsField>
      <NumberSetting name="threads" label="Количество зрителей" min={1} max={quantity} />
      <NumberSetting name="stream_views" label="Множитель просмотров" min={1} max={10} />
      <NumberSetting name="uniq_viewers" label="Множитель уникальных зрителей" min={1} max={10} />
    </SettingsGroup>
    <SettingsGroup title="Подключение и рейды" icon={SlidersHorizontal}>
      <SettingsField label="Режим подключения">{props =>
        <select {...props} name="online_mode" value={mode} onChange={event => setMode(event.target.value)}>
          <option value="">Оставить как есть</option>
          {twitchViewerModes.map((value, index) => <option key={value} value={value}>{modeLabels[index]}</option>)}
        </select>
      }</SettingsField>
      <NumberSetting name="connect_time" label="Время подключения" min={1} max={Math.min(60, quantity)} unit="мин" />
      {mode === "manual" && <div className={styles.chartFields} role="group" aria-label="Свой график">
        <h4>Свой график</h4>
        <div className={styles.settingsGrid}>
          <SettingsField label="Точки графика" wide hint="Одна точка на строку в формате «минута: зрители». Начните с 0, закончите на 10–180-й минуте. До 2 200 знаков.">{props =>
            <textarea {...props} name="manual_chart" rows={4} maxLength={2200} placeholder={"0: 1\n10: 5"} />
          }</SettingsField>
          <NumberSetting name="manual_chart_randomization" label="Разброс" min={0} max={100} unit="%" />
          <SettingsField label="После завершения графика">{props =>
            <select {...props} name="manual_chart_end_action" defaultValue="">
              <option value="">Выберите действие</option>
              {twitchChartEndActions.map((value, index) => <option key={value} value={value}>{endLabels[index]}</option>)}
            </select>
          }</SettingsField>
          <NumberSetting name="manual_chart_end_param" label="Время для действия после графика" min={0} max={60} unit="мин" />
        </div>
      </div>}
      <SettingsField label="Подключение к рейдам">{props =>
        <select {...props} name="raid" defaultValue="">
          <option value="">Оставить как есть</option>
          <option value="on">Подключаться</option>
          <option value="off">Не подключаться</option>
        </select>
      }</SettingsField>
      <NumberSetting name="raid_time" label="Время на канале рейда" min={5} max={60} unit="мин" />
    </SettingsGroup>
    <SettingsGroup title="Состав аудитории" icon={Globe}>
      <SettingsField label="Страна зрителей">{props =>
        <select {...props} name="geo" defaultValue="">
          <option value="">Оставить как есть</option>
          {twitchViewerGeos.map(value => <option key={value} value={value}>{value === "auto" ? "По языку трансляции" : regions.of(value.toUpperCase())}</option>)}
        </select>
      }</SettingsField>
      <NumberSetting name="geo_percent" label="Доля зрителей из выбранной страны" min={0} max={100} unit="%" />
      <SettingsField label="Группа аккаунтов">{props =>
        <select {...props} name="preferred_account_group" defaultValue="">
          <option value="">Оставить как есть</option>
          <option value="0">По умолчанию</option>
        </select>
      }</SettingsField>
      <NumberSetting name="chatlist" label="Доля зрителей в списке чата" min={0} max={100} unit="%" />
    </SettingsGroup>
  </fieldset>;
}

export function readViewerChatFields(form: HTMLFormElement) {
  const values = new FormData(form);
  const interval = values.get("interval");
  const mode = values.get("mode");
  const phrases = String(values.get("phrases") ?? "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const parsed = viewerChatSettings.safeParse({
    ...(interval ? { interval: Number(interval) } : {}),
    ...(mode ? { mode: Number(mode) } : {}),
    ...(values.has("clearPhrases") ? { phrases: [] } : phrases.length ? { phrases } : {}),
  });
  return parsed.success ? parsed.data : null;
}

export function ViewerChatFields({ pending, pendingAction, status, onRetry, onAction }: {
  pending: boolean;
  pendingAction?: "start" | "stop";
  status: "loading" | "running" | "stopped" | "unavailable" | "error";
  onRetry: () => void;
  onAction: (action: "start" | "stop") => void;
}) {
  const [clear, setClear] = useState(false);
  const running = status === "running";
  const ChatIcon = running ? Pause : Play;
  const available = running || status === "stopped";
  const actionLabel = pendingAction === "start" ? "Запускаем чат…" : pendingAction === "stop" ? "Останавливаем чат…"
    : status === "loading" ? "Проверяем состояние чата…" : status === "unavailable" ? "Чат недоступен"
      : status === "error" ? "Проверить состояние чата" : running ? "Остановить чат" : "Запустить чат";
  const blocked = pending || (!available && status !== "error");
  return <div className={styles.viewerFields}>
    <SettingsGroup title="Запуск и остановка" icon={ChatDots}>
      <div className={styles.chatActions}>
        <button type="button" className={styles.actionButton} data-tone={available && !running ? "accent" : undefined}
          aria-disabled={blocked} onClick={() => {
            if (blocked) return;
            if (status === "error") onRetry();
            else onAction(running ? "stop" : "start");
          }}>
          {available && <span className={styles.actionIcon}><ChatIcon size={20} weight="regular" aria-hidden="true" /></span>}
          {actionLabel}
        </button>
      </div>
    </SettingsGroup>
    <fieldset className={styles.viewerFields} disabled={pending}>
      <legend className="sr-only">Параметры чат-ботов</legend>
      <SettingsGroup title="Порядок и интервал" icon={Timer}>
        <SettingsField label="Порядок сообщений">{props =>
          <select {...props} name="mode" defaultValue="">
            <option value="">Оставить как есть</option>
            <option value="0">Случайный</option>
            <option value="1">С начала списка</option>
          </select>
        }</SettingsField>
        <NumberSetting name="interval" label="Интервал между сообщениями" {...viewerChatInterval} unit="с" explainLimit />
      </SettingsGroup>
      <SettingsGroup title="Список сообщений" icon={ListBullets}>
        <SettingsField label="Новые фразы" wide hint="По одной фразе на строку, до 100 фраз и 500 знаков в каждой, до 4 000 знаков всего. Новый список заменит текущий.">{props =>
          <textarea {...props} name="phrases" rows={4} maxLength={4000} disabled={clear} />
        }</SettingsField>
        <label className={styles.chatCheckbox}>
          <input type="checkbox" name="clearPhrases" checked={clear} onChange={event => setClear(event.target.checked)} /> Очистить текущий список
        </label>
      </SettingsGroup>
    </fieldset>
  </div>;
}
