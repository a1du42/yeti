"use client";

import { useId, useState, type ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { ChartBar, ChatDots, Globe, ListBullets, Pause, Play, Question, SlidersHorizontal, Timer, type Icon } from "@phosphor-icons/react";
import { twitchChartEndActions, twitchViewerGeos, twitchViewerModes, twitchViewerSettings, viewerChatInterval, viewerChatSettings, type TwitchViewerSettings } from "@/lib/twitch-viewer-settings";
import { IconTooltip } from "./ui";
import workspaceStyles from "./workspace.module.css";
import styles from "./launch-actions.module.css";

const modeLabels = ["Плавное подключение", "Плавное с колебаниями", "Свой график"];
const endLabels = ["Продолжить работу", "Повторить график", "Завершить заказ"];
const regions = new Intl.DisplayNames("ru", { type: "region" });
const numberFormat = new Intl.NumberFormat("ru");
const numericKeys = ["threads", "stream_views", "uniq_viewers", "raid_time", "connect_time", "geo_percent", "chatlist",
  "manual_chart_randomization", "manual_chart_end_param"];
const chartKeys = ["manual_chart", "manual_chart_randomization", "manual_chart_end_action", "manual_chart_end_param"] as const;
const viewerTabs = [
  { value: "viewers", label: "Зрители", icon: ChartBar },
  { value: "connection", label: "Режим и рейды", icon: SlidersHorizontal },
  { value: "audience", label: "Аудитория", icon: Globe },
];
export type ViewerFieldsSnapshot = Partial<Record<keyof TwitchViewerSettings, string>>;
export type ChatFieldsSnapshot = { interval?: number; mode?: number; messages: string | null };

export function readViewerFields(form: HTMLFormElement, current: ViewerFieldsSnapshot) {
  const fields = new FormData(form);
  const chartChanged = fields.get("online_mode") === "manual" && (
    current.online_mode !== "manual" ||
    chartKeys.some(key => {
      const value = fields.get(key);
      return typeof value === "string" && value.trim() && value !== current[key];
    })
  );
  const values: Record<string, unknown> = {};
  for (const [key, entry] of fields) {
    if (typeof entry !== "string" || !entry.trim()) continue;
    const chartField = chartKeys.some(chartKey => chartKey === key);
    if (chartField ? !chartChanged : entry === current[key as keyof TwitchViewerSettings]) continue;
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
  if (chartChanged) values.online_mode = "manual";
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

function SettingsField({ label, hint, help, wide = false, group = false, children }: {
  label: string;
  hint?: string;
  help?: string;
  wide?: boolean;
  group?: boolean;
  children: (props: { id: string; "aria-describedby"?: string }, labelId: string) => ReactNode;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = hint ? `${id}-hint` : undefined;
  return <div className={wide ? `${styles.settingsField} ${styles.wideField}` : styles.settingsField}>
    <div className={styles.fieldLabel}>
      {group ? <span id={labelId}>{label}</span> : <label id={labelId} htmlFor={id}>{label}</label>}
      {help && <IconTooltip label={help}>
        <button type="button" className={styles.fieldHelp} aria-label={`Пояснение к настройке «${label}»`}>
          <Question size={18} weight="regular" aria-hidden="true" />
        </button>
      </IconTooltip>}
    </div>
    <div className={styles.fieldControl}>
      {children({ id, "aria-describedby": hintId }, labelId)}
      {hint && <small id={hintId}>{hint}</small>}
    </div>
  </div>;
}

function NumberSetting({ name, label, min, max, unit, help, initial, slider = false, wide, onValue }: {
  name: string; label: string; min: number; max: number; unit?: string; help?: string; initial?: string | number;
  slider?: boolean; wide?: boolean; onValue?: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string>();
  const saved = String(initial ?? "");
  const savedFits = !saved || (Number.isInteger(Number(saved)) && Number(saved) >= min && Number(saved) <= max);
  const isConnectTime = name === "connect_time";
  const draftOutsideRange = draft !== undefined && draft !== "" && (Number(draft) < min || Number(draft) > max);
  const value = isConnectTime && draftOutsideRange ? String(max) : draft ?? (savedFits ? saved : "");
  const invalid = value !== "" && (!Number.isInteger(Number(value)) || Number(value) < min || Number(value) > max);
  const range = `${numberFormat.format(min)}–${numberFormat.format(max)}${unit ? ` ${unit}` : ""}`;
  const update = (next: string) => {
    setDraft(next);
    onValue?.(next);
  };
  return <SettingsField label={label} help={help} wide={wide} hint={range}>{(props, labelId) => {
    const noteId = `${props.id}-current`;
    const errorId = `${props.id}-error`;
    const showSaved = !savedFits && draft === undefined;
    const showMax = isConnectTime && showSaved && (Number(saved) < min || Number(saved) > max);
    const sliderValue = showMax ? max : Math.min(max, Math.max(min, Number(value) || min));
    return <>
      <div className={slider ? styles.numberControls : undefined}>
        {slider && <input className={styles.rangeInput} type="range" min={min} max={max} step={1} value={sliderValue}
          aria-labelledby={labelId} aria-describedby={props["aria-describedby"]}
          aria-valuetext={value === "" && !showMax ? "Значение не выбрано" : unit ? `${sliderValue} ${unit}` : undefined}
          disabled={min === max} onChange={event => update(event.currentTarget.value)} />}
        <input {...props} name={name} type="number" inputMode="numeric" min={min} max={max} step={1} value={value}
          aria-invalid={invalid || undefined}
          aria-describedby={[props["aria-describedby"], showSaved && noteId, invalid && errorId].filter(Boolean).join(" ")}
          onChange={event => {
            const { value, valueAsNumber } = event.currentTarget;
            const outOfRange = valueAsNumber < min || valueAsNumber > max;
            update(outOfRange ? String(isConnectTime ? max : Math.min(max, Math.max(min, valueAsNumber))) : value);
          }} />
      </div>
      {showSaved && <small id={noteId}>Текущее значение вне диапазона: {saved}{unit && ` ${unit}`}.</small>}
      {invalid && <small id={errorId} className={styles.fieldError}>Введите целое число в пределах диапазона.</small>}
    </>;
  }}</SettingsField>;
}

const multiplierOptions = [0, 2, 5, 10] as const;

function MultiplierSetting({ name, label, help, initial }: {
  name: "stream_views" | "uniq_viewers"; label: string; help: string; initial?: string;
}) {
  const [value, setValue] = useState(initial ?? "");
  const showSaved = value && !multiplierOptions.some(option => String(option) === value);
  return <SettingsField group label={label} help={help} hint={showSaved ? `Текущее значение: ×${value}.` : undefined}>{(props, labelId) =>
    <div {...props} className={styles.multiplierOptions} role="group" aria-labelledby={labelId}>
      {multiplierOptions.map(option => <button key={option} type="button" aria-pressed={value === String(option)}
        disabled={option === 0} onClick={() => setValue(String(option))}>
        {option === 0 ? "0" : `×${option}`}
      </button>)}
      <input type="hidden" name={name} value={value} />
    </div>
  }</SettingsField>;
}

function CurrentOption({ value, options, label }: { value?: string; options: readonly string[]; label?: string }) {
  if (value && options.includes(value)) return null;
  return <option value={value ?? ""} disabled={!value}>{value ? label ?? `Текущее значение: ${value}` : "Не задано"}</option>;
}

function ViewerSettingsPanel({ value, activeTab, children }: { value: string; activeTab: string; children: ReactNode }) {
  const inactive = value !== activeTab;
  return <Tabs.Content value={value} forceMount className={`${styles.settingsGroup} ${styles.viewerPanel}`}
    inert={inactive} aria-hidden={inactive} tabIndex={-1}>
    <div className={styles.settingsGrid}>{children}</div>
  </Tabs.Content>;
}

export function TwitchViewerFields({ pending, quantity, current }: { pending: boolean; quantity: number; current: ViewerFieldsSnapshot }) {
  const [tab, setTab] = useState("viewers");
  const [pointerFocus, setPointerFocus] = useState(false);
  const [mode, setMode] = useState(current.online_mode ?? "");
  const [threads, setThreads] = useState("");
  const viewers = Number(threads) || Number(current.threads);
  const connectMax = Math.min(60, Number.isInteger(viewers) && viewers >= 1 && viewers <= quantity ? viewers : quantity);
  return <fieldset className={styles.viewerFields} disabled={pending}>
    <legend className="sr-only">Параметры зрителей</legend>
    <Tabs.Root value={tab} onValueChange={setTab}>
      <Tabs.List className={`${workspaceStyles.tabList} ${styles.viewerTabs}`} aria-label="Разделы настроек зрителей"
        data-pointer={pointerFocus} onPointerDownCapture={() => setPointerFocus(true)} onKeyDownCapture={() => setPointerFocus(false)}
        onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) setPointerFocus(false);
        }}>
        {viewerTabs.map(({ value, label, icon: TabIcon }) => <Tabs.Trigger key={value} value={value} className={workspaceStyles.tab} disabled={pending}>
          <TabIcon size={20} weight="regular" aria-hidden="true" /><span>{label}</span>
        </Tabs.Trigger>)}
      </Tabs.List>
      <div className={styles.viewerPanels}>
        <ViewerSettingsPanel value="viewers" activeTab={tab}>
          <NumberSetting slider wide name="threads" label="Количество зрителей" min={1} max={quantity} initial={current.threads} onValue={setThreads}
            help="Задайте, сколько зрителей подключать к трансляции в рамках этого заказа." />
          <MultiplierSetting name="stream_views" label="Множитель просмотров" initial={current.stream_views}
            help="Количество просмотров трансляции рассчитывается умножением количества зрителей на выбранное значение." />
          <MultiplierSetting name="uniq_viewers" label="Множитель уникальных зрителей" initial={current.uniq_viewers}
            help="Количество уникальных зрителей за трансляцию рассчитывается умножением количества зрителей на выбранное значение." />
          <p className={`${styles.wideField} ${styles.settingsNote}`}>Изменение множителя на 0 недоступно.</p>
        </ViewerSettingsPanel>
        <ViewerSettingsPanel value="connection" activeTab={tab}>
          <SettingsField label="Режим подключения" help="Выберите, как зрители будут подключаться к трансляции и как их количество будет меняться со временем.">{props =>
            <select {...props} name="online_mode" value={mode} onChange={event => setMode(event.target.value)}>
              <CurrentOption value={current.online_mode} options={twitchViewerModes} />
              {twitchViewerModes.map((value, index) => <option key={value} value={value}>{modeLabels[index]}</option>)}
            </select>
          }</SettingsField>
          <NumberSetting slider name="connect_time" label="Время подключения" min={1} max={connectMax} unit="мин" initial={current.connect_time}
            help="За это время к трансляции должно подключиться заданное количество зрителей." />
          {mode === "manual" && <div className={styles.chartFields} role="group" aria-label="Свой график">
            <h3>Свой график</h3>
            <div className={styles.settingsGrid}>
              <SettingsField label="Точки графика" wide hint="Одна точка на строку в формате «минута: зрители». Начните с 0, закончите на 10–180-й минуте. До 2 200 знаков.">{props =>
                <textarea {...props} name="manual_chart" rows={4} maxLength={2200} placeholder={"0: 1\n10: 5"} defaultValue={current.manual_chart} />
              }</SettingsField>
              <NumberSetting slider name="manual_chart_randomization" label="Разброс" min={0} max={100} unit="%" initial={current.manual_chart_randomization}
                help="Задайте, насколько количество зрителей может отклоняться от значений графика." />
              <SettingsField label="После завершения графика" help="Выберите, что произойдёт после последней точки графика.">{props =>
                <select {...props} name="manual_chart_end_action" defaultValue={current.manual_chart_end_action ?? ""}>
                  <CurrentOption value={current.manual_chart_end_action} options={twitchChartEndActions} />
                  {twitchChartEndActions.map((value, index) => <option key={value} value={value}>{endLabels[index]}</option>)}
                </select>
              }</SettingsField>
              <NumberSetting slider name="manual_chart_end_param" label="Время для действия после графика" min={0} max={60} unit="мин" initial={current.manual_chart_end_param}
                help="Для повторения графика это время паузы перед следующим циклом." />
            </div>
          </div>}
          <SettingsField label="Подключение к рейдам" help="Включите, чтобы зрители переходили на канал, куда вы отправляете рейд.">{props =>
            <select {...props} name="raid" defaultValue={current.raid ?? ""}>
              <CurrentOption value={current.raid} options={["on", "off"]} />
              <option value="on">Подключаться</option>
              <option value="off">Не подключаться</option>
            </select>
          }</SettingsField>
          <NumberSetting slider name="raid_time" label="Время на канале рейда" min={5} max={60} unit="мин" initial={current.raid_time}
            help="Укажите, сколько минут зрители пробудут на канале рейда перед возвращением на основной канал." />
        </ViewerSettingsPanel>
        <ViewerSettingsPanel value="audience" activeTab={tab}>
          <SettingsField label="Страна зрителей" help="Выберите страну для заданной доли зрителей или подбор по языку трансляции.">{props =>
            <select {...props} name="geo" defaultValue={current.geo ?? ""}>
              <CurrentOption value={current.geo} options={twitchViewerGeos} label={current.geo === "random" ? "Случайно" : undefined} />
              {twitchViewerGeos.map(value => <option key={value} value={value}>{value === "auto" ? "По языку трансляции" : regions.of(value.toUpperCase())}</option>)}
            </select>
          }</SettingsField>
          <NumberSetting slider name="geo_percent" label="Доля зрителей из выбранной страны" min={0} max={100} unit="%" initial={current.geo_percent}
            help="Укажите, какая доля зрителей должна быть из выбранной страны." />
          <NumberSetting slider name="chatlist" label="Доля зрителей в списке чата" min={0} max={100} unit="%" initial={current.chatlist}
            help="Укажите, какая доля зрителей будет видна в списке участников чата." />
        </ViewerSettingsPanel>
      </div>
    </Tabs.Root>
  </fieldset>;
}

function readChatPhrases(text: string) {
  return text.split(/\r\n?|\n/).map(line => line.trim()).filter(Boolean);
}

export function readViewerChatFields(form: HTMLFormElement, current: ChatFieldsSnapshot) {
  const values = new FormData(form);
  const interval = values.get("interval");
  const mode = values.get("mode");
  const phrases = readChatPhrases(String(values.get("phrases") ?? ""));
  const changedPhrases = phrases.length > 0 && phrases.join("\n") !== readChatPhrases(current.messages ?? "").join("\n");
  const changes = {
    ...(interval && Number(interval) !== current.interval ? { interval: Number(interval) } : {}),
    ...(mode && Number(mode) !== current.mode ? { mode: Number(mode) } : {}),
    ...(changedPhrases ? { phrases } : {}),
  };
  if (!Object.keys(changes).length) return undefined;
  const parsed = viewerChatSettings.safeParse(changes);
  return parsed.success ? parsed.data : null;
}

export function ViewerChatFields({ pending, pendingAction, status, current, onRetry, onAction }: {
  pending: boolean;
  pendingAction?: "start" | "stop";
  status: "loading" | "running" | "stopped" | "unavailable" | "error";
  current: ChatFieldsSnapshot | null;
  onRetry: () => void;
  onAction: (action: "start" | "stop") => void;
}) {
  const [phrasesError, setPhrasesError] = useState("");
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
    {current && <fieldset className={styles.viewerFields} disabled={pending || status === "loading"}>
      <legend className="sr-only">Параметры чат-ботов</legend>
      <SettingsGroup title="Порядок и интервал" icon={Timer}>
        <SettingsField label="Порядок сообщений">{props =>
          <select {...props} name="mode" defaultValue={current.mode ?? ""}>
            <CurrentOption value={current.mode?.toString()} options={["0", "1"]} />
            <option value="0">Случайный</option>
            <option value="1">С начала списка</option>
          </select>
        }</SettingsField>
        <NumberSetting name="interval" label="Интервал между сообщениями" {...viewerChatInterval} unit="с" initial={current.interval} />
      </SettingsGroup>
      <SettingsGroup title="Список сообщений" icon={ListBullets}>
        <SettingsField label="Фразы чата" wide hint={
          (current.messages === null ? "Текущий список недоступен. " : "") +
          "По одной фразе на строку, до 100 фраз и 500 знаков в каждой, до 4 000 знаков всего. Пустое поле сохранит текущий список."
        }>{props => <>
          <textarea {...props} name="phrases" rows={4} maxLength={4000} defaultValue={current.messages ?? ""}
            aria-invalid={Boolean(phrasesError) || undefined}
            aria-describedby={phrasesError ? `${props["aria-describedby"]} ${props.id}-error` : props["aria-describedby"]}
            onChange={event => {
              const input = event.currentTarget;
              const phrases = readChatPhrases(input.value);
              const result = viewerChatSettings.shape.phrases.safeParse(phrases);
              const unchanged = phrases.join("\n") === readChatPhrases(current.messages ?? "").join("\n");
              const issue = !unchanged && !result.success ? result.error.issues[0] : undefined;
              const message = !issue ? "" : issue.path.length
                ? "Сократите каждую фразу до 500 знаков."
                : "Оставьте не более 100 фраз.";
              input.setCustomValidity(message);
              setPhrasesError(message);
            }} />
          {phrasesError && <small id={`${props.id}-error`} className={styles.fieldError}>{phrasesError}</small>}
        </>}</SettingsField>
      </SettingsGroup>
    </fieldset>}
  </div>;
}
