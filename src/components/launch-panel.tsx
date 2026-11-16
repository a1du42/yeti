"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { FollowerInterval } from "./follower-interval";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowSquareOut, Broadcast, CaretDown, ChatCircleDots, CircleNotch, ClockCounterClockwise, DeviceMobile, Heart, LinkSimple, PlayCircle, RocketLaunch, Star, Trash, UserCircle, Users, Eye, UserPlus, WarningCircle, CheckCircle, VideoCamera, Question } from "@phosphor-icons/react";
import { parseStreamLink, platformNames, streamTypeNames, type Platform, type StreamInfo } from "@/lib/stream-link";
import { formatUsd } from "@/lib/money";
import { readRecentList, type RecentAction, type RecentLink } from "@/lib/launch-recent";
import { launchDurationLabel, launchHoursMax, launchQuote, matchesLaunchTarget, showsLaunchService, liveOrderQuantityMax, type CatalogEntry } from "@/lib/launch-catalog";
import { isFollowerInterval, launchServiceName } from "@/lib/launch-orders";
import { IconTooltip } from "@/components/ui";
import type { ConfirmedLaunch } from "./launch-history";
import { LaunchPreview } from "./launch-preview";
import styles from "./launch-panel.module.css";
import workspaceStyles from "./workspace.module.css";

const streamTypeIcons = { video: PlayCircle, clip: PlayCircle, channel: UserCircle, shorts: DeviceMobile, stream: Broadcast } satisfies Record<StreamInfo["kind"], typeof PlayCircle>;
const sourceIdLabels: Record<StreamInfo["kind"], string> = { video: "ID видео", clip: "ID клипа", channel: "Канал", shorts: "ID шортса", stream: "ID трансляции" };
const serviceIcons = { viewers: Users, chat: ChatCircleDots, followers: UserPlus, views: Eye, likes: Heart, prime: Star };
const serviceCategories = {
  viewers: "Зрители",
  chat: "ИИ-чат",
  followers: "Фолловеры",
  views: "Просмотры",
  likes: "Лайки",
  prime: "Prime",
} satisfies Record<CatalogEntry["category"], string>;
type ServiceCategory = keyof typeof serviceCategories;
const categoryOrder = Object.keys(serviceCategories) as ServiceCategory[];
const numberLabel = (value: number) => value.toLocaleString("ru-RU");
const quantityUnit = { viewers: "чел.", chat: "акк.", followers: "шт.", views: "шт.", likes: "шт.", prime: "шт." };
const quantityName = { viewers: "Количество зрителей", chat: "Количество аккаунтов", followers: "Количество подписок", views: "Количество просмотров", likes: "Количество лайков", prime: "Количество подписок" };
const launchLabels = { viewers: "Запустить привлечение зрителей", chat: "Запустить ИИ-чат", followers: "Запустить привлечение подписчиков", views: "Запустить просмотры", likes: "Запустить лайки", prime: "Запустить Prime-подписки" };

function ServiceRate({ service, priceFactor }: { service: CatalogEntry; priceFactor: number }) {
  if (!service.price) return null;
  if ("tiers" in service.price) {
    const cents = Math.max(1, Math.floor((service.price.tiers[0][1] * priceFactor + 50) / 100));
    return <span className={styles.rate}><strong>от {formatUsd(cents)}</strong><span>{service.duration === "hourly" ? "за пакет в час" : "за пакет"}</span></span>;
  }
  const { unit } = service.price;
  if (!unit) return <span className={styles.rate}><strong>Бесплатно</strong></span>;
  const units = unit % 100 === 0 ? 1 : 100;
  const rate = new Intl.NumberFormat("ru-RU", {
    style: "currency", currency: "USD", currencyDisplay: "code", maximumFractionDigits: units === 1 ? 6 : 4,
  }).format(unit * priceFactor * units / 1_000_000);
  return <span className={styles.rate}><strong>{rate}</strong><span>за {units} {quantityUnit[service.category]}{service.duration === "hourly" ? " в час" : ""}</span></span>;
}

const platformMarks: Record<Platform, string> = {
  twitch: "M5.673 0 1.418 4.255v15.49h5.164V24l4.254-4.255h3.491l7.746-7.745V0zm14.982 11.29-3.273 3.274h-3.273l-2.836 2.836v-2.836H7.418V1.418h13.237zM17.382 4.69h-1.418v4.255h1.418zm-3.927 0h-1.419v4.255h1.419z",
  youtube: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.504 3.545 12 3.545 12 3.545s-7.504 0-9.376.505A3.016 3.016 0 0 0 .502 6.186 31.35 31.35 0 0 0 0 12a31.35 31.35 0 0 0 .502 5.814 3.016 3.016 0 0 0 2.122 2.136c1.872.505 9.376.505 9.376.505s7.504 0 9.376-.505a3.016 3.016 0 0 0 2.122-2.136A31.35 31.35 0 0 0 24 12a31.35 31.35 0 0 0-.502-5.814zM9.545 15.568V8.432L15.818 12z",
  kick: "M3 2h6v7h2V7h2V5h2V2h6v6h-2v2h-2v4h2v2h2v6h-6v-3h-2v-2h-2v-2H9v7H3z",
};

function PlatformMark({ platform }: { platform: Platform }) {
  return <span className={styles.platformMark} data-platform={platform}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fillRule="evenodd" d={platformMarks[platform]} /></svg>
  </span>;
}

function StreamTags({ kind, platform }: Pick<StreamInfo, "kind" | "platform">) {
  return <span className={styles.metadata}>
    <StreamTypeTag kind={kind} />
    <PlatformTag platform={platform} />
  </span>;
}

function StreamTypeTag({ kind }: Pick<StreamInfo, "kind">) {
  const TypeIcon = streamTypeIcons[kind];
  return <span className={styles.typeLabel}>
    <span className="sr-only">Тип ссылки: </span>
    <TypeIcon size="var(--size-icon-small)" weight="regular" aria-hidden="true" />
    <span>{streamTypeNames[kind]}</span>
  </span>;
}

function PlatformTag({ platform }: Pick<StreamInfo, "platform">) {
  return <span className={styles.platform} data-platform={platform}>
    <span className="sr-only">Площадка: </span>
    <span className={styles.platformAccent} aria-hidden="true" />
    <span>{platformNames[platform]}</span>
  </span>;
}

export function LaunchPanel({ active, userId, onLaunch }: { active: boolean; userId: string; onLaunch: (result: ConfirmedLaunch) => void }) {
  const [link, setLink] = useState("");
  const [catalogData, setCatalogData] = useState<{ entries: CatalogEntry[]; live: boolean; priceFactor: number } | null>(null);
  const { entries: catalog, live = false, priceFactor = 100 } = catalogData ?? {};
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [catalogUpdating, setCatalogUpdating] = useState(false);
  const [catalogRetry, setCatalogRetry] = useState(0);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setCatalogFailed(false);
    setCatalogUpdating(true);
    void fetch("/api/launch-catalog", { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) })
      .then(async response => {
        if (!response.ok) throw new Error("Catalog unavailable");
        const data = await response.json();
        if (!controller.signal.aborted) setCatalogData(data);
      }).catch(() => {
        if (!controller.signal.aborted) { setCatalogData(null); setCatalogFailed(true); }
      }).finally(() => {
        if (!controller.signal.aborted) setCatalogUpdating(false);
      });
    return () => controller.abort();
  }, [active, catalogRetry]);
  const linkPlatform = parseStreamLink(link)?.platform;
  const [recent, setRecent] = useState<RecentLink[]>([]);
  const [recentLoaded, setRecentLoaded] = useState(false);
  const [failedRecentAction, setFailedRecentAction] = useState<RecentAction | null>(null);
  const recentQueue = useRef(Promise.resolve());
  const recentHeading = useRef<HTMLHeadingElement>(null);
  const historyKey = `yeti-launch-recent:${userId}`;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<(StreamInfo & { launchToken: string }) | null>(null);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [service, setService] = useState("");
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState<string | null>(null);
  const [interval, setIntervalValue] = useState("10");
  const [floating, setFloating] = useState(false);
  const [hours, setHours] = useState("1");
  const [saving, setSaving] = useState(false);
  const [launchError, setLaunchError] = useState("");
  const launchRequest = useRef<AbortController | null>(null);
  const launchAttempt = useRef<{ signature: string; key: string } | null>(null);
  const request = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const focusLinkAfterReset = useRef(false);
  function queueRecent(action: RecentAction) {
    recentQueue.current = recentQueue.current.then(async () => {
      try {
        const response = await fetch("/api/launch-recent", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...action, userId }), signal: AbortSignal.timeout(12_000),
        });
        if (!response.ok) throw new Error("Recent links unavailable");
        const { entries } = await response.json() as { entries: RecentLink[] };
        if (action.action === "load" && action.legacy.length) {
          try { localStorage.removeItem(historyKey); } catch { /* Серверная копия уже доступна. */ }
        }
        setRecent(entries);
        setRecentLoaded(true);
        setFailedRecentAction(previous => previous === action || previous?.action === "load" ? null : previous);
      } catch {
        if (action.action !== "update") setFailedRecentAction(action);
      }
    });
  }
  useEffect(() => {
    let legacy: RecentLink[] = [];
    try { legacy = readRecentList(JSON.parse(localStorage.getItem(historyKey) ?? "[]")); } catch { /* История загружается из аккаунта. */ }
    queueRecent({ action: "load", legacy });
  }, [historyKey]);
  useEffect(() => { if (!active) { request.current?.abort(); request.current = null; setBusy(false); } return () => { request.current?.abort(); request.current = null; }; }, [active]);
  useEffect(() => () => { const controller = launchRequest.current; launchRequest.current = null; controller?.abort(); }, []);
  async function resolve(value: string) {
    request.current?.abort();
    const target = value.trim().length <= 2048 ? parseStreamLink(value) : null;
    if (!target) { request.current = null; setError("Проверьте ссылку. Поддерживаются каналы, записи и клипы Twitch и Kick, каналы, видео и шортсы YouTube."); setBusy(false); return; }
    queueRecent({ action: "touch", entry: { url: target.url, platform: target.platform, kind: target.kind, title: null, thumbnail: null } });
    const controller = new AbortController();
    request.current = controller;
    setError(""); setLaunchError(""); setBusy(true); setInfo(null); setDescriptionOpen(false); setService(""); setCategory("");
    const timer = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch("/api/stream-info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: value }), signal: controller.signal, cache: "no-store" });
      const data = await response.json();
      if (request.current !== controller || controller.signal.aborted) return;
      if (!response.ok) throw new Error(data.error || "Не удалось получить сведения.");
      const { kind, title, thumbnail } = data;
      if (!data.warning || kind === "stream") queueRecent({ action: "update", entry: { url: target.url, platform: target.platform, kind, title, thumbnail } });
      setQuantity(null);
      setIntervalValue("10");
      setFloating(false);
      setHours("1");
      setInfo(data);
    } catch (cause) {
      if (request.current === controller) setError(controller.signal.aborted ? "Время ожидания истекло. Повторите попытку." : cause instanceof Error ? cause.message : "Не удалось связаться с сервером. Повторите попытку.");
    } finally { window.clearTimeout(timer); if (request.current === controller) setBusy(false); }
  }
  useEffect(() => {
    if (info) resultHeading.current?.focus({ preventScroll: true });
    else if (focusLinkAfterReset.current) { input.current?.focus(); focusLinkAfterReset.current = false; }
  }, [info]);
  function reset(focusLink = true) { request.current?.abort(); request.current = null; focusLinkAfterReset.current = focusLink; setBusy(false); setInfo(null); setService(""); setError(""); setLaunchError(""); }
  const channel = info?.sourceKind === "channel";
  const services = info && catalog ? catalog.filter(item => showsLaunchService(item, info))
    .map(item => ({ ...item, title: launchServiceName(item.id, info.platform, info.kind) })) : [];
  const available = services;
  const categories = categoryOrder.filter(value => available.some(item => item.category === value));
  const activeCategory = categories.find(value => value === category) ?? categories[0];
  const singleService = available.length === 1;
  const selected = singleService ? available[0] : available.find(item => item.id === service);
  const hourly = selected?.duration === "hourly";
  const requestHours = hourly ? Number(hours) : null;
  const twitchFollowers = selected?.id === "twitch-followers";
  const requestInterval = live && twitchFollowers ? Number(interval) : undefined;
  const requestFloating = requestInterval === undefined ? undefined : floating;
  const quantityValue = quantity ?? String(selected?.min ?? "");
  const count = quantityValue === "" ? null : Number(quantityValue);
  const needsLiveStream = !!(selected && info && !matchesLaunchTarget(selected, info));
  const hasOrderLimit = !!(live && selected && selected.max > liveOrderQuantityMax);
  const aboveOrderLimit = hasOrderLimit && count !== null && count > liveOrderQuantityMax;
  const quote = selected && count !== null && !aboveOrderLimit ? launchQuote(selected, count, requestHours, priceFactor) : null;
  const limits = selected ? `от ${numberLabel(selected.min)} до ${numberLabel(selected.max)}` : "";
  const orderLimitText = `Через YETI STREAM можно заказать до ${numberLabel(liveOrderQuantityMax)} за один раз.`;
  const quantityError = quantityValue === "" ? "Укажите количество." : aboveOrderLimit ? "Уменьшите количество до лимита заказа." : !quote ? `Введите целое количество ${limits}.` : "";
  const canLaunch = !!quote && !needsLiveStream && !busy && !saving && !catalogUpdating &&
    (requestInterval === undefined || isFollowerInterval(requestInterval));
  async function launchDemo() {
    if (!canLaunch || !selected || !info || launchRequest.current) return;
    const signature = JSON.stringify([info.url, selected.id, count, requestHours, quote?.amountCents, requestInterval, requestFloating]);
    if (launchAttempt.current?.signature !== signature) launchAttempt.current = { signature, key: crypto.randomUUID() };
    const controller = new AbortController();
    launchRequest.current = controller;
    setSaving(true); setLaunchError("");
    const timer = window.setTimeout(() => controller.abort(), requestFloating === undefined ? 15_000 : 30_000);
    try {
      const response = await fetch("/api/launches", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ requestKey: launchAttempt.current.key, launchToken: info.launchToken, service: selected.id, quantity: count, hours: requestHours, quotedCents: quote?.amountCents, interval: requestInterval, floating: requestFloating }) });
      const data = await response.json();
      if (!response.ok) {
        if ((response.status === 409 || response.status === 422) && launchRequest.current === controller) {
          setCatalogUpdating(true);
          setCatalogRetry(value => value + 1);
        }
        if (launchRequest.current === controller) setLaunchError(typeof data.error === "string" ? data.error : "Не удалось подтвердить запуск. Повторите попытку.");
        return;
      }
      if (launchRequest.current !== controller || controller.signal.aborted) return;
      launchAttempt.current = null;
      reset(false);
      setLink("");
      setDescriptionOpen(false);
      onLaunch({ ...data, receivedAt: performance.now(), autoStart: requestFloating !== undefined, requestedFloating: requestFloating });
    } catch {
      if (launchRequest.current === controller) setLaunchError("Ответ не получен. Повторите запуск с теми же параметрами: второй заказ не создастся.");
    } finally {
      window.clearTimeout(timer);
      if (launchRequest.current === controller) { launchRequest.current = null; setSaving(false); }
    }
  }
  function normalizeQuantity(value: string) {
    if (value === "") return value;
    const number = Number(value);
    return selected && Number.isFinite(number) && (number < selected.min || number > selected.max)
      ? String(Math.min(selected.max, Math.max(selected.min, number))) : value;
  }
  function changeQuantity(value: string) {
    setLaunchError("");
    setQuantity(value);
  }

  const catalogStatus = catalogFailed ? <div>
    <p className={styles.error} role="alert">Не удалось загрузить каталог услуг.</p>
    <button className={styles.back} type="button" onClick={() => setCatalogRetry(value => value + 1)}>Повторить</button>
  </div> : !catalog ? <p className={styles.muted} role="status">Загружаем каталог услуг…</p> : null;
  function renderCategory(value: ServiceCategory) {
    const configurationId = "service-configuration-" + value;
    return <>
      <div className={styles.serviceList} role="group" aria-label={serviceCategories[value]}>
        {available.filter(item => item.category === value).map(item => {
          const Icon = serviceIcons[item.category];
          return <button key={item.id} type="button" className={styles.service} disabled={saving} aria-pressed={selected?.id === item.id} aria-controls={configurationId} onClick={() => {
            if (selected?.id === item.id) return;
            setService(item.id); setQuantity(null); setHours("1"); setLaunchError("");
          }}>
            <Icon size={24} weight="regular" aria-hidden="true" />
            <strong className={styles.serviceCopy}>{item.title}</strong>
            <ServiceRate service={item} priceFactor={priceFactor} />
            {selected?.id === item.id && <CheckCircle className={styles.choiceCheck} size={20} weight="regular" aria-hidden="true" />}
          </button>;
        })}
      </div>
      <div id={configurationId}>
        {selected?.category === value && <form className={`${styles.configuration}${twitchFollowers ? ` ${styles.followerConfiguration}` : ""}`} aria-labelledby="service-title" noValidate onSubmit={event => { event.preventDefault(); if (!live) void launchDemo(); }}>
          <div className={styles.configurationHeading}>
            <h3 id="service-title" className={styles.configurationTitle}>{selected.title}</h3>
            <IconTooltip key={selected.id} label={selected.min === selected.max ? "В пробный пакет входит фиксированное количество зрителей на один час."
              : selected.category === "followers" ? "Обычные подписки на канал. Платные подписки площадки сюда не входят."
              : selected.price && "tiers" in selected.price ? "Цена пакета меняется при переходе в следующий диапазон количества аккаунтов."
              : selected.category === "views" ? "Просмотры выбранной записи или клипа."
              : "Количество относится к выбранной прямой трансляции."}>
              <button type="button" className={styles.help} aria-label={`Об услуге «${selected.title}»`}><Question size={20} weight="regular" aria-hidden="true" /></button>
            </IconTooltip>
          </div>
          <div className={selected.min === selected.max ? undefined : styles.calculation}>
            {selected.min !== selected.max && <div className={styles.parameters}><div className={styles.quantityField}><label htmlFor="service-quantity">{quantityName[selected.category]}, {quantityUnit[selected.category]}</label>
              <input id="service-quantity" type="number" inputMode="numeric" min={selected.min} max={selected.max} step={1} value={quantityValue} readOnly={saving} onChange={event => changeQuantity(normalizeQuantity(event.target.value))} aria-invalid={!!quantityError} aria-describedby={quantityError ? "quantity-help quantity-error" : "quantity-help"} />
              <p id="quantity-help" className={styles.muted}>Диапазон тарифа: {numberLabel(selected.min)}–{numberLabel(selected.max)}.{hasOrderLimit && ` ${orderLimitText}`}</p>
              {quantityError && <p id="quantity-error" className={styles.error}>{quantityError}</p>}
            </div>
            {requestInterval !== undefined && <FollowerInterval value={interval} pending={saving} onChange={value => {
              setIntervalValue(value); setLaunchError("");
            }} />}
            {requestFloating !== undefined && <label className={styles.followerVariation}>
              <input type="checkbox" checked={floating} disabled={saving} onChange={event => {
                setFloating(event.target.checked); setLaunchError("");
              }} />
              <span>Разброс интервала <strong>±25%</strong></span>
            </label>}
            {hourly && <div className={styles.quantityField}>
              <div className={styles.rangeHeading}><label htmlFor="service-hours">Длительность</label><span className={styles.rangeValue}>{hours} ч</span></div>
              <input id="service-hours" className={styles.rangeInput} type="range" min={1} max={launchHoursMax} step={1} value={hours} disabled={saving} onChange={event => { setHours(event.target.value); setLaunchError(""); }} aria-valuetext={`${hours} ч`} aria-describedby="hours-help" />
              <div className={styles.rangeLimits} id="hours-help"><span>1 ч</span><span>{launchHoursMax} ч</span></div>
            </div>}</div>}
            <dl className={styles.total} aria-live="polite" aria-atomic="true">
              <div><dt>Количество</dt><dd>{quote && count !== null ? `${numberLabel(count)} ${quantityUnit[selected.category]}` : "—"}</dd></div>
              {selected.duration !== null && <div><dt>Длительность</dt><dd>{selected.duration === "hourly" ? `${hours} ч` : launchDurationLabel(selected.duration)}</dd></div>}
              <div className={styles.totalAmount}><dt>{live ? "К списанию с баланса" : "Итого в демо"}</dt><dd>{quote ? formatUsd(quote.amountCents) : "—"}</dd></div>
            </dl>
          </div>
          {needsLiveStream && <div className={styles.notice}><p>Для запуска нужен активный эфир. Начните трансляцию и проверьте ссылку ещё раз.</p><button type="button" className={styles.back} disabled={busy || saving} onClick={() => void resolve(link)}>{busy ? "Проверяем…" : "Проверить эфир"}</button></div>}
          <button type={live ? "button" : "submit"} onClick={live ? () => void launchDemo() : undefined} className={`${styles.primary} ${styles.launchButton}`} disabled={!canLaunch} aria-busy={saving} aria-describedby={launchError ? "launch-order-error" : undefined}>
            {requestFloating !== undefined && <RocketLaunch size={24} weight="regular" aria-hidden="true" />}
            {saving ? requestFloating !== undefined ? "Оформляем и запускаем…" : "Сохраняем запуск…"
              : live ? `${requestFloating === undefined ? "Заказать" : "Запустить"}${quote ? ` за ${formatUsd(quote.amountCents)}` : ""}`
              : launchLabels[selected.category]}
          </button>
          {launchError && <p id="launch-order-error" className={styles.error} role="alert"><WarningCircle size={20} weight="regular" aria-hidden="true" />{launchError}</p>}
        </form>}
      </div>
    </>;
  }

  return <div className={styles.root}>
    {!info ? <>
      <div className={styles.heading}><LinkSimple size={24} aria-hidden="true" /><h2>Что будем продвигать?</h2></div>
      <form onSubmit={(event: FormEvent) => { event.preventDefault(); void resolve(link); }} className={styles.form} noValidate aria-busy={busy}>
        <div className={styles.linkLabel}>
          <label htmlFor="launch-link">Ссылка на канал, трансляцию, видео, клип или шортс</label>
          <span className={styles.platformMarks} aria-hidden="true">
            {(Object.keys(platformMarks) as Platform[]).map(platform => <PlatformMark key={platform} platform={platform} />)}
          </span>
          <span id="launch-supported" className="sr-only">Поддерживаются Twitch, YouTube и Kick.</span>
        </div>
        <div className={styles.inputRow}>
          <div className={styles.linkInput}>
            <input id="launch-link" ref={input} type="url" inputMode="url" maxLength={2048} autoComplete="off" spellCheck={false} placeholder="https://www.youtube.com/watch?v=…" value={link} aria-invalid={!!error} aria-describedby={error ? "launch-error launch-supported" : "launch-supported"}
              onChange={event => { request.current?.abort(); request.current = null; setBusy(false); setLink(event.target.value); setError(""); }}
              onPaste={event => { const text = event.clipboardData.getData("text").trim(); if (text.length <= 2048 && parseStreamLink(text)) { event.preventDefault(); setLink(text); void resolve(text); } }} />
            {linkPlatform && <span className={styles.inputMark} aria-hidden="true"><PlatformMark platform={linkPlatform} /></span>}
          </div>
          <button className={styles.primary} type="submit" disabled={busy} aria-busy={busy} aria-label="Продолжить"><span className={styles.buttonLabel} aria-hidden={busy}>Продолжить</span>{busy && <CircleNotch className={styles.spinner} size={20} weight="regular" aria-hidden="true" />}</button></div>

        <span role="status" className="sr-only">{busy ? "Получаем сведения с площадки" : linkPlatform ? `Площадка: ${platformNames[linkPlatform]}` : ""}</span>
        {error && <p id="launch-error" className={styles.error} role="alert"><WarningCircle size={20} aria-hidden="true" />{error}</p>}
      </form>
      <section className={styles.recent} aria-labelledby="launch-recent">
        <div className={styles.heading}><ClockCounterClockwise size={20} weight="regular" aria-hidden="true" /><h2 id="launch-recent" ref={recentHeading} tabIndex={-1}>Недавние</h2></div>
        {failedRecentAction && <div>
          <p className={styles.error} role="alert"><WarningCircle size={20} aria-hidden="true" />
            {failedRecentAction.action === "load" ? "Не удалось загрузить недавние ссылки." : "Не удалось сохранить изменение в недавних ссылках."}
          </p>
          <button type="button" className={styles.back} onClick={() => {
            recentHeading.current?.focus({ preventScroll: true });
            queueRecent(failedRecentAction);
          }}>Повторить</button>
        </div>}
        {!recentLoaded ? !failedRecentAction && <p className={styles.muted} role="status">Загружаем недавние ссылки…</p>
          : recent.length === 0 ? !failedRecentAction && <p className={styles.muted}>Здесь появятся ссылки, которые вы введёте или вставите.</p> : <ul className={styles.recentList} role="list">
          {recent.map(({ url, title, thumbnail, kind, platform }) => <li key={url} className={styles.recentItem}>
            <button type="button" className={styles.recentLink} onClick={() => { setLink(url); void resolve(url); }}>
              <span className={styles.recentPlatform} data-platform={platform}>
                <span className="sr-only">Площадка: </span>
                <span className={styles.recentPlatformName}>{platformNames[platform]}</span>
              </span>
              <LaunchPreview thumbnail={thumbnail} />
              <span className={styles.recentCopy}>
                <strong>{title || "Название недоступно"}</strong>
                <StreamTypeTag kind={kind} />
              </span>
            </button>
            <button type="button" className={styles.recentRemove} aria-label={`Удалить из недавних: ${title || url}`} onClick={event => {
              const row = event.currentTarget.closest("li");
              const neighbor = row?.nextElementSibling ?? row?.previousElementSibling;
              (neighbor?.querySelector("button") ?? recentHeading.current)?.focus({ preventScroll: true });
              queueRecent({ action: "remove", url });
            }}><Trash size={20} weight="regular" aria-hidden="true" /></button>
          </li>)}
        </ul>}
      </section>
    </> : <>
      <button className={styles.back} disabled={saving} onClick={() => reset()}><ArrowLeft size={20} aria-hidden="true" />Изменить ссылку</button>
      <section className={styles.summary} aria-labelledby="launch-result">
        {info.thumbnail ? <img className={styles.thumbnail} src={info.thumbnail} alt="" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} /> : <div className={styles.placeholder}><VideoCamera size={40} aria-hidden="true" /></div>}
        <div className={styles.details}>
          <h2 id="launch-result" ref={resultHeading} tabIndex={-1} data-popup-focus>{info.title || "Название недоступно"}</h2>
          <StreamTags kind={info.kind} platform={info.platform} />
          <div className={styles.resultActions}>
            <button type="button" className={styles.resultAction} aria-expanded={descriptionOpen} aria-controls="launch-description" onClick={() => setDescriptionOpen(open => !open)}>
              Описание<CaretDown className={styles.disclosureIcon} size={16} weight="regular" aria-hidden="true" />
            </button>
            <a href={info.url} target="_blank" rel="noopener noreferrer" className={styles.resultAction}>
              {info.platform === "youtube" ? "Открыть в YouTube" : `Открыть на ${platformNames[info.platform]}`}<ArrowSquareOut size={18} weight="regular" aria-hidden="true" />
            </a>
          </div>
        </div>
        <div id="launch-description" className={styles.descriptionDisclosure} hidden={!descriptionOpen}>
          <p className={styles.description}>{info.description || "Описание недоступно."}</p>
          <dl className={styles.identifiers}>
            <div><dt>{sourceIdLabels[channel ? "channel" : info.kind]}</dt><dd>{info.id}</dd></div>
            <div><dt>Идентификатор</dt><dd>{info.platform}:{info.kind}:{info.id}</dd></div>
            <div><dt>Автор</dt><dd>{info.author || "Не удалось получить"}</dd></div>
          </dl>
        </div>
      </section>
      {info.warning && <div className={styles.notice}><WarningCircle size={20} aria-hidden="true" /><p>{info.warning}</p><button className={styles.back} disabled={busy || saving} onClick={() => void resolve(link)}>{busy ? "Получаем…" : "Повторить"}</button></div>}
      <section aria-labelledby="launch-services" className={styles.services}>
        <h2 id="launch-services">{available.length === 0 ? "Услуги для этой ссылки" : singleService ? "Доступная услуга" : "Выберите услугу"}</h2>
        {catalogStatus}
        {catalog && services.length === 0 && <p className={styles.muted}>Для этого типа ссылки пока нет услуг. Попробуйте другую ссылку.</p>}
        {categories.length > 1 ? (
          <Tabs.Root value={activeCategory} onValueChange={value => { if (!saving) setCategory(value); }}>
            <Tabs.List className={workspaceStyles.tabList + " " + styles.categoryTabs} aria-label="Категории услуг">
              {categories.map(value => {
                const Icon = serviceIcons[value];
                return <Tabs.Trigger key={value} value={value} className={workspaceStyles.tab} disabled={saving}>
                  <Icon size={20} weight="regular" aria-hidden="true" />
                  <span>{serviceCategories[value]}</span>
                </Tabs.Trigger>;
              })}
            </Tabs.List>
            <div className={styles.categoryPanels}>
              {categories.map(value => {
                const visible = value === activeCategory;
                return <Tabs.Content key={value} value={value} forceMount className={styles.categoryPanel}
                  inert={!visible} aria-hidden={!visible} tabIndex={-1}>
                  {renderCategory(value)}
                </Tabs.Content>;
              })}
            </div>
          </Tabs.Root>
        ) : activeCategory && renderCategory(activeCategory)}
      </section>
    </>}
  </div>;
}
