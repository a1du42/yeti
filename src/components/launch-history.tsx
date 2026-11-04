"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { CheckCircle, CurrencyDollar, Globe, Hourglass, ListChecks, Package, PauseCircle, PlayCircle, Timer, WarningCircle } from "@phosphor-icons/react";
import { canChangeDemoRegion, canPauseDemoLaunch, estimatedFollowerCount, finishedProviderStatuses, followerControl, launchRegionNames, launchServiceName, launchStatuses, type LaunchOrder, type LaunchStatus, type ProviderStatus } from "@/lib/launch-orders";
import { demoLaunchMinutes, getCatalogService, launchDurationLabel } from "@/lib/launch-catalog";
import { formatUsd } from "@/lib/money";
import { platformNames } from "@/lib/stream-link";
import { isTwitchViewerPackage } from "@/lib/twitch-viewer-settings";
import { LaunchActions } from "./launch-actions";
import { LaunchPreview } from "./launch-preview";
import workspaceStyles from "./workspace.module.css";
import styles from "./launch-history.module.css";

type Page = { orders: LaunchOrder[]; next: string | null; now: number };
type ListState = { page: Page | null; error: string; loading: boolean; failedCursor: string | null };
const emptyList: ListState = { page: null, error: "", loading: false, failedCursor: null };
const tabLabels: Record<LaunchStatus, string> = { active: "Актуальные", completed: "Завершённые" };
const providerLabels: Record<ProviderStatus, string> = { submitting: "Отправляем заказ", unknown: "Ответ не подтверждён", rejected: "Заказ отклонён", created: "Создан", awaiting: "Ожидает", working: "Запущен", stopped: "Остановлен", completed: "Завершён", failed: "Ошибка выполнения", deleted: "Удалён", refunded: "Средства возвращены" };
export type ConfirmedLaunch = {
  order: LaunchOrder; now: number; receivedAt: number;
  autoStart?: boolean; requestedFloating?: boolean;
};

function timeLeft(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const rest = seconds % 60;
  return [hours, minutes, rest].map(value => String(value).padStart(2, "0")).join(":");
}

function usesOrderClock(order: LaunchOrder) {
  return order.hours !== null && order.hours > 0 && order.providerStatus === "working";
}

function LaunchCard({ order, now, clockOffset, interactive, onChange, onSettingsSaved }: {
  order: LaunchOrder; now: number; clockOffset: number | null; interactive: boolean;
  onChange: (order: LaunchOrder, now: number) => void;
  onSettingsSaved: (message: string) => void;
}) {
  const end = Date.parse(order.endsAt);
  const real = order.providerStatus;
  const paused = real ? real === "stopped" : Boolean(order.pausedAt);
  const complete = real ? finishedProviderStatuses.includes(real) : !paused && now >= end;
  const duration = (order.hours === null ? demoLaunchMinutes : order.hours * 60) * 60_000;
  const remaining = Math.max(0, end - (order.pausedAt ? Date.parse(order.pausedAt) : now));
  const fraction = Math.max(0, 1 - remaining / duration);
  const percent = Math.floor(Math.max(0, duration - remaining) * 100 / duration);
  const running = !real && interactive && !paused && !complete;
  const timedHeld = order.hours !== null && Boolean(order.pausedAt) && (real === "stopped" || real === "awaiting");
  const timedRemaining = usesOrderClock(order) || timedHeld ? Math.min(duration, remaining) : null;
  const timedPercent = real === "completed" && order.hours !== null ? 100
    : timedRemaining === null ? null : Math.min(99, percent);
  const estimatePercent = order.followerEstimate
    ? (real === "completed" ? 100 : Math.min(99, Math.floor(
      100 * estimatedFollowerCount(order.followerEstimate, order.followerIntervalSeconds ?? 1, now) / order.quantity,
    ))) : null;
  const fill = useRef<HTMLSpanElement>(null);
  const linkText = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const text = linkText.current;
    const clip = text?.parentElement;
    if (!text || !clip) return;
    const observer = new ResizeObserver(() => {
      clip.toggleAttribute("data-overflow", clip.scrollWidth > clip.clientWidth);
    });
    observer.observe(text);
    observer.observe(clip);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = fill.current;
    if (!element || !running || clockOffset === null) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animation: Animation | undefined;
    const syncFill = () => {
      animation?.cancel();
      if (reducedMotion.matches) return;
      const remainingMs = Math.max(0, end - clockOffset - performance.now());
      const start = Math.max(0, 1 - remainingMs / duration);
      animation = element.animate(
        [{ transform: `scaleX(${start})` }, { transform: "scaleX(1)" }],
        { duration: remainingMs, easing: "linear", fill: "forwards" },
      );
    };
    syncFill();
    reducedMotion.addEventListener("change", syncFill);
    return () => {
      animation?.cancel();
      reducedMotion.removeEventListener("change", syncFill);
    };
  }, [clockOffset, duration, end, running]);
  const service = launchServiceName(order.service, order.platform, order.kind);
  const issue = real === "unknown" || real === "failed" || real === "rejected";
  const Icon = issue ? WarningCircle : complete ? CheckCircle : paused || real === "stopped" ? PauseCircle : real && real !== "working" ? Hourglass : PlayCircle;
  const badgeColor = issue || real === "stopped" ? styles.pausedBadge : complete ? styles.completedBadge : paused ? styles.pausedBadge : styles.runningBadge;
  const category = getCatalogService(order.service)?.category ?? order.service;
  const unit = category === "chat" ? "акк." : category === "viewers" ? "чел." : "шт.";
  const hasRegion = !real && canChangeDemoRegion(order.service);
  const manageable = real ? (order.service === "twitch-followers" || isTwitchViewerPackage(order.service)) && followerControl(real) !== null
    : !complete && (hasRegion || canPauseDemoLaunch(order.service));
  return <li className={styles.card} data-provider-order={real ? "" : undefined} data-launch-end={paused || real ? undefined : end}>
    <div className={styles.platform} data-platform={order.platform}>
      <span className={styles.platformName}>{platformNames[order.platform]}</span>
    </div>
    <div className={styles.cardBody} data-mobile-action-menu={manageable && interactive && !(real && isTwitchViewerPackage(order.service))}>
      <div className={styles.cardHeader}>
        <span className={`${styles.badge} ${badgeColor}`}>
          <Icon size={16} weight="regular" aria-hidden="true" />
          <span>{real ? providerLabels[real] : complete ? providerLabels.completed : paused ? "Пауза" : providerLabels.working}</span>
        </span>
        <div className={styles.resource}>
          <div className={styles.cardPreview}><LaunchPreview thumbnail={order.thumbnail} /></div>
          <div className={styles.resourceCopy}>
            <h2>{service}</h2>
            <p>
              <a className={styles.resourceLink} href={order.url} target="_blank" rel="noopener noreferrer">
                <span className={styles.resourceClip}><span ref={linkText}>{order.title || order.url}</span></span>
                <span className="sr-only"> (в новой вкладке)</span>
              </a>
            </p>
          </div>
        </div>
      </div>
      <dl className={styles.details}>
        <div>
          <dt className="sr-only">Заказано</dt>
          <dd><Package size={18} weight="regular" aria-hidden="true" /><span>{order.quantity.toLocaleString("ru-RU")} {unit}{order.hours === null ? "" : ` на ${launchDurationLabel(order.hours)}`}</span></dd>
        </div>
        <div>
          <dt className="sr-only">{real ? "Стоимость заказа" : "Сумма демозапуска"}</dt>
          <dd><CurrencyDollar size={18} weight="regular" aria-hidden="true" /><span>{formatUsd(order.amountCents)}</span></dd>
        </div>
        {!real && !complete && <div>
          <dt className="sr-only">До завершения</dt>
          <dd><Timer size={18} weight="regular" aria-hidden="true" /><span>{timeLeft(remaining)}</span></dd>
        </div>}
        {real && order.followerIntervalSeconds != null && <div>
          <dt className="sr-only">Интервал между подписками</dt>
          <dd><Timer size={18} weight="regular" aria-hidden="true" /><span>{order.followerIntervalSeconds.toLocaleString("ru-RU")} сек.{order.followerFloatingInterval ? " ±25%" : ""}</span></dd>
        </div>}
        {hasRegion && <div>
          <dt className="sr-only">Регион</dt>
          <dd><Globe size={18} weight="regular" aria-hidden="true" /><span>{launchRegionNames[order.region]}</span></dd>
        </div>}
      </dl>
      {real === "unknown" && <p>Сумма зарезервирована. Не оформляйте заказ повторно до проверки.</p>}
      {real === "created" && order.service === "twitch-followers" && <p>Заказ оплачен. Нажмите «Запустить», когда будете готовы.</p>}
      {!real && <div className={styles.progress}>
        <progress className="sr-only" aria-label="Выполнено" value={percent} max={100} />
        <span className={styles.progressTrack} aria-hidden="true" data-running={running || (interactive && paused)} data-paused={paused ? "" : undefined}>
          <span ref={fill} className={styles.progressFill} style={{ transform: `scaleX(${fraction})` }} />
        </span>
        <strong aria-hidden="true">{percent}%</strong>
      </div>}
      {timedPercent !== null && <div className={styles.timedProgress}>
        {timedRemaining !== null && <p className={styles.timedProgressLabel}>
          <span>По времени заказа</span>
          <span>{timedRemaining > 0 ? `≈ ${timeLeft(timedRemaining)} осталось` : "Ждём подтверждения завершения"}</span>
        </p>}
        <div className={styles.progress}>
          <progress className="sr-only" aria-label="Прогресс по времени заказа" value={timedPercent} max={100} />
          <span className={styles.progressTrack} aria-hidden="true" data-paused={paused ? "" : undefined}
            data-running={interactive && (paused || (!timedHeld && timedRemaining !== null && timedRemaining > 0))}>
            <span className={styles.progressFill} style={{ transform: `scaleX(${timedPercent / 100})` }} />
          </span>
          <strong aria-hidden="true">{timedPercent}%</strong>
        </div>
      </div>}
      {estimatePercent !== null && <div className={styles.progress}>
        <progress className="sr-only" aria-label="Прогресс заказа" value={estimatePercent} max={100} />
        <span className={styles.progressTrack} aria-hidden="true" data-estimate="" data-paused={paused ? "" : undefined} data-running={interactive && paused}>
          <span className={styles.progressFill} style={{ transform: `scaleX(${estimatePercent / 100})` }} />
        </span>
        <strong aria-hidden="true">{estimatePercent}%</strong>
      </div>}
      {manageable && interactive && <LaunchActions order={order} onChange={onChange} onSettingsSaved={onSettingsSaved} />}
    </div>
  </li>;
}

export function LaunchHistory({ active, confirmed, startLink, onSettingsSaved }: {
  active: boolean; confirmed: ConfirmedLaunch | null; startLink: ReactNode; onSettingsSaved: (message: string) => void;
}) {
  const [tab, setTab] = useState<LaunchStatus>(() =>
    confirmed?.autoStart && confirmed.order.providerStatus && finishedProviderStatuses.includes(confirmed.order.providerStatus)
      ? "completed" : "active");
  const [lists, setLists] = useState({ active: emptyList, completed: emptyList });
  const [clockOffset, setClockOffset] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const request = useRef<AbortController | null>(null);
  const changesDuringLoad = useRef(new Map<string, LaunchOrder>());
  const activeTrigger = useRef<HTMLButtonElement>(null);
  const activePanel = useRef<HTMLDivElement>(null);
  const clock = now || confirmed?.now || 0;
  const recent = new Map(lists.active.page?.orders.map(order => [order.id, order]));
  const running: LaunchOrder[] = [];
  const finished = new Map(lists.completed.page?.orders.map(order => [order.id, order]));
  if (confirmed && !lists.active.page && !recent.has(confirmed.order.id) && !finished.has(confirmed.order.id)) recent.set(confirmed.order.id, confirmed.order);
  for (const order of recent.values()) {
    if (order.providerStatus ? !finishedProviderStatuses.includes(order.providerStatus) : order.pausedAt || Date.parse(order.endsAt) > clock) { running.push(order); finished.delete(order.id); }
    else finished.set(order.id, order);
  }
  const sortOrders = (a: LaunchOrder, b: LaunchOrder) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id);
  const orders = { active: running.sort(sortOrders), completed: [...finished.values()].sort(sortOrders) };
  const ticking = active && tab === "active" && clockOffset !== null && running.some(order =>
    (!order.providerStatus && !order.pausedAt) || usesOrderClock(order) ||
    (order.providerStatus === "working" && order.followerEstimate?.since != null),
  );

  const updateList = useCallback((status: LaunchStatus, update: (previous: ListState) => ListState) => {
    setLists(previous => ({ ...previous, [status]: update(previous[status]) }));
  }, []);

  const updateClock = useCallback((serverTime: number) => {
    const focused = document.activeElement;
    if (focused && (activePanel.current?.contains(focused) || focused.closest("[data-launch-popup]"))) {
      const end = focused.closest<HTMLElement>("[data-launch-end]")?.dataset.launchEnd;
      if (end && Number(end) <= serverTime) {
        if (focused.closest("[data-launch-popup]")) {
          window.requestAnimationFrame(() => {
            if (document.activeElement === document.body || document.activeElement === focused) {
              activeTrigger.current?.focus({ preventScroll: true });
            }
          });
        } else activeTrigger.current?.focus({ preventScroll: true });
      }
    }
    setNow(previous => Math.max(previous, serverTime));
  }, []);

  function applyChange(order: LaunchOrder, serverNow: number) {
    if (request.current) changesDuringLoad.current.set(order.id, order);
    updateList("active", previous => {
      const entries = new Map(previous.page?.orders.map(entry => [entry.id, entry]));
      entries.set(order.id, order);
      return { ...previous, page: { orders: [...entries.values()], next: previous.page?.next ?? null, now: serverNow } };
    });
    const offset = serverNow - performance.now();
    setClockOffset(offset);
    updateClock(serverNow);
  }

  const load = useCallback(async (status: LaunchStatus, cursor: string | null) => {
    request.current?.abort();
    changesDuringLoad.current = new Map();
    const controller = new AbortController();
    request.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 12_000);
    updateList(status, previous => ({ ...previous, loading: true, error: "" }));
    try {
      const params = new URLSearchParams({ status });
      if (cursor) params.set("before", cursor);
      const response = await fetch(`/api/launches?${params}`, { cache: "no-store", signal: controller.signal });
      const data = await response.json() as Page & { error?: string };
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Не удалось загрузить запуски.");
      if (request.current !== controller || controller.signal.aborted) return;
      setClockOffset(data.now - performance.now());
      updateClock(data.now);
      const changes = changesDuringLoad.current;
      updateList(status, previous => {
        const entries = new Map((cursor ? previous.page?.orders ?? [] : []).map(order => [order.id, order]));
        for (const order of data.orders) entries.set(order.id, changes.get(order.id) ?? order);
        if (status === "active") for (const order of changes.values()) entries.set(order.id, order);
        return { ...previous, page: { ...data, orders: [...entries.values()] } };
      });
    } catch (cause) {
      if (request.current === controller) {
        const error = controller.signal.aborted ? "Время ожидания истекло. Повторите попытку."
          : cause instanceof Error && !(cause instanceof TypeError || cause instanceof SyntaxError) ? cause.message : "Не удалось загрузить запуски. Проверьте соединение и повторите попытку.";
        updateList(status, previous => ({ ...previous, failedCursor: cursor, error }));
      }
    } finally {
      window.clearTimeout(timer);
      if (request.current === controller) {
        request.current = null;
        updateList(status, previous => ({ ...previous, loading: false }));
      }
    }
  }, [updateClock, updateList]);

  useEffect(() => {
    if (!confirmed) return;
    const offset = confirmed.now - confirmed.receivedAt;
    setClockOffset(offset);
    updateClock(offset + performance.now());
  }, [confirmed, updateClock]);

  useEffect(() => {
    if (!active) return;
    void load(tab, null);
    const timer = window.setInterval(() => {
      if (!request.current && document.visibilityState === "visible" && activePanel.current?.querySelector("[data-provider-order]")) void load(tab, null);
    }, 20_000);
    return () => {
      window.clearInterval(timer);
      const controller = request.current;
      request.current = null;
      controller?.abort();
    };
  }, [active, tab, load]);

  const { page: activePage, loading: activeLoading, error: activeError } = lists.active;
  const refillActive = active && tab === "active" && !!activePage?.next && running.length === 0 && !activeLoading && !activeError;
  useEffect(() => {
    if (refillActive && !request.current) void load("active", null);
  }, [refillActive, load]);

  useEffect(() => {
    if (!ticking || clockOffset === null) return;
    const tick = () => updateClock(clockOffset + performance.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [ticking, clockOffset, updateClock]);

  const createdOrder = confirmed?.autoStart ? running.find(order => order.id === confirmed.order.id) : undefined;
  const startPending = createdOrder?.providerStatus === "created" || createdOrder?.providerStatus === "stopped";
  return <Tabs.Root value={tab} onValueChange={value => setTab(value === "completed" ? "completed" : "active")} className={styles.history}>
    {startPending && <p role="status">
      {confirmed?.requestedFloating && !createdOrder.followerFloatingInterval
        ? "Разброс не подтверждён. Проверьте настройки темпа перед запуском заказа."
        : "Автоматический запуск пока не подтверждён. Проверьте статус заказа перед повторным запуском."}
    </p>}
    <Tabs.List className={`${workspaceStyles.tabList} ${styles.historyTabs}`} aria-label="Статус запуска">
      <Tabs.Trigger className={workspaceStyles.tab} value="active" ref={activeTrigger}>
        <PlayCircle size={20} weight="regular" aria-hidden="true" /><span>{tabLabels.active}</span>
      </Tabs.Trigger>
      <Tabs.Trigger className={workspaceStyles.tab} value="completed">
        <CheckCircle size={20} weight="regular" aria-hidden="true" /><span>{tabLabels.completed}</span>
      </Tabs.Trigger>
    </Tabs.List>
    <div className={styles.panels}>
      {launchStatuses.map(status => {
        const selected = status === tab;
        const isRunning = status === "active";
        const Icon = isRunning ? ListChecks : CheckCircle;
        const { page, loading, error, failedCursor } = lists[status];
        const entries = orders[status];
        const waiting = loading || (!page && !error && entries.length === 0);
        const next = page?.next;
        return <Tabs.Content key={status} value={status} forceMount className={styles.tabPanel}
          ref={isRunning ? activePanel : undefined} inert={!selected} aria-hidden={!selected}>
          {entries.length > 0 && <ul className={styles.list} aria-label={`${tabLabels[status]} запуски`} role="list">
            {entries.map(order => <LaunchCard key={order.id} order={order} now={clock} clockOffset={clockOffset} interactive={active && selected} onChange={applyChange} onSettingsSaved={onSettingsSaved} />)}
          </ul>}
          {!waiting && !error && !next && entries.length === 0 && <div className={workspaceStyles.emptyState}>
            <h2 className={styles.emptyHeading}>
              <Icon size="var(--size-icon-large)" weight="regular" aria-hidden="true" />
              <span>{isRunning ? "Актуальных запусков пока нет" : "Завершённых запусков пока нет"}</span>
            </h2>
            <p>{isRunning ? "Новые заказы появятся здесь после запуска." : "Заказы появятся здесь, когда их выполнение закончится."}</p>
            {isRunning && startLink}
          </div>}
          {error && <div className={styles.error}>
            <p role={active && selected ? "alert" : undefined}><WarningCircle size={20} weight="regular" aria-hidden="true" />{error}</p>
            <button type="button" className={workspaceStyles.secondaryButton} onClick={() => void load(status, failedCursor)}>Повторить</button>
          </div>}
          {next && !error && <button type="button" className={workspaceStyles.secondaryButton}
            disabled={loading} onClick={() => void load(status, next)}>Показать ещё</button>}
          {waiting && <p className={styles.loading} role={active && selected ? "status" : undefined}>
            <Hourglass size={18} weight="regular" aria-hidden="true" />Загружаем запуски…
          </p>}
        </Tabs.Content>;
      })}
    </div>
  </Tabs.Root>;
}
