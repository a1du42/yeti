"use client";

import { useEffect, useId, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import { CaretRight, ChatDots, DotsThree, Globe, Info, Pause, Play, SlidersHorizontal, Timer, WarningCircle } from "@phosphor-icons/react";
import { canChangeDemoRegion, canPauseDemoLaunch, followerControl, isFollowerInterval, launchRegionNames, launchRegions, type LaunchChange, type LaunchOrder, type LaunchRegion } from "@/lib/launch-orders";
import { FollowerInterval } from "./follower-interval";
import { isTwitchViewerPackage, viewerSettingsError } from "@/lib/twitch-viewer-settings";
import { readViewerChatFields, readViewerFields, TwitchViewerFields, ViewerChatFields } from "./twitch-viewer-fields";
import { focusPopupOnOpen } from "./ui";
import workspace from "./workspace.module.css";
import styles from "./launch-actions.module.css";

export function LaunchActions({ order, onChange, onSettingsSaved }: {
  order: LaunchOrder;
  onChange: (order: LaunchOrder, now: number) => void;
  onSettingsSaved: (message: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [regionOpen, setRegionOpen] = useState(false);
  const [chat, setChat] = useState(false);
  const [chatStatus, setChatStatus] = useState<"loading" | "running" | "stopped" | "unavailable" | "error">("loading");
  const [chatRead, setChatRead] = useState(0);
  const [region, setRegion] = useState(order.region);
  const [interval, setIntervalValue] = useState("");
  const [floating, setFloating] = useState(false);
  const [pendingChange, setPendingChange] = useState<LaunchChange | null>(null);
  const pending = pendingChange !== null;
  const pendingChatAction = pendingChange && "viewerChatAction" in pendingChange ? pendingChange.viewerChatAction : undefined;
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const more = useRef<HTMLButtonElement>(null);
  const regionButton = useRef<HTMLButtonElement>(null);
  const chatButton = useRef<HTMLButtonElement>(null);
  const openingRegion = useRef(false);
  const selectId = useId();
  const mobile = "(max-width: 767px)";
  const end = order.pausedAt || order.providerStatus ? undefined : Date.parse(order.endsAt);
  const paused = Boolean(order.pausedAt);
  const PauseIcon = paused ? Play : Pause;
  const pauseLabel = paused ? "Возобновить" : "Поставить на паузу";
  const canPause = !order.providerStatus && canPauseDemoLaunch(order.service);
  const canChangeRegion = !order.providerStatus && canChangeDemoRegion(order.service);
  const followerAction = order.service === "twitch-followers" ? followerControl(order.providerStatus) : null;
  const viewerControl = isTwitchViewerPackage(order.service) ? followerControl(order.providerStatus) : null;
  const canManageChat = viewerControl !== null && order.providerStatus !== "stopped";
  const viewerAction = order.service === "twitch-viewers-hour" ? viewerControl : null;
  const canConfigure = canChangeRegion || followerAction !== null || viewerControl !== null;
  const settingsLabel = viewerControl ? "Настройки зрителей" : followerAction ? "Настроить темп" : "Сменить регион";
  const chatLabel = "Управление чатом";
  const DialogIcon = chat ? ChatDots : SlidersHorizontal;
  const SettingsIcon = viewerControl ? SlidersHorizontal : followerAction ? Timer : Globe;
  const liveAction = followerAction ?? viewerAction;
  const actionLabel = liveAction === "start" ? "Запустить" : liveAction === "stop" ? "Остановить" : pauseLabel;
  const ActionIcon = liveAction ? (liveAction === "start" ? Play : Pause) : PauseIcon;
  const actionChange: LaunchChange = viewerAction ? { viewerAction } : followerAction ? { followerAction } : { paused: !paused };
  const validInterval = isFollowerInterval(Number(interval));

  useEffect(() => {
    const media = window.matchMedia(mobile);
    const closeMenu = () => setMenu(false);
    media.addEventListener("change", closeMenu);
    return () => {
      media.removeEventListener("change", closeMenu);
      request.current?.abort();
      request.current = null;
    };
  }, []);

  useEffect(() => {
    if (!regionOpen || !chat) return;
    if (!canManageChat) {
      setRegionOpen(false);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    let current = true;
    async function readChat() {
      try {
        const params = new URLSearchParams({ chatOrder: order.id });
        const response = await fetch(`/api/launches?${params}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error();
        const { started } = await response.json();
        if (current) setChatStatus(started === true ? "running" : started === false ? "stopped" : started === null ? "unavailable" : "error");
      } catch {
        if (current) setChatStatus("error");
      } finally {
        window.clearTimeout(timeout);
      }
    }
    void readChat();
    return () => {
      current = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [regionOpen, chat, canManageChat, order.id, chatRead]);

  async function save(change: LaunchChange) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    // Chat commands may need a state check both before and after the provider request.
    const timeout = window.setTimeout(() => controller.abort(), "viewerChatAction" in change ? 18_000 : 12_000);
    setPendingChange(change);
    setError("");
    try {
      const response = await fetch("/api/launches", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ id: order.id, ...change }),
      });
      const data = await response.json();
      if (request.current !== controller) return;
      if (!response.ok) {
        if ("viewerChatAction" in change) setChatStatus("error");
        setError(typeof data.error === "string" ? data.error : "Не удалось сохранить изменение.");
        return;
      }
      onChange(data.order, data.now);
      if ("region" in change || "interval" in change || "viewers" in change || "viewerChat" in change) setRegionOpen(false);
      if ("interval" in change) onSettingsSaved("Темп подписок сохранён");
      if ("viewers" in change || "viewerChat" in change) onSettingsSaved("Настройки сохранены");
      if ("viewerChatAction" in change) {
        const started = change.viewerChatAction === "start";
        setChatStatus(started ? "running" : "stopped");
        onSettingsSaved(started ? "Чат запущен" : "Чат остановлен");
      }
    } catch {
      if (request.current === controller) {
        if ("viewerChatAction" in change) setChatStatus("error");
        setError("Не удалось подтвердить изменение. Проверьте состояние заказа перед повтором.");
      }
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        setPendingChange(null);
      }
    }
  }

  function openSettings(forChat = false) {
    if (request.current) return;
    openingRegion.current = menu;
    setMenu(false);
    setError("");
    setChat(forChat);
    setChatStatus("loading");
    setRegion(order.region);
    setIntervalValue(order.followerIntervalSeconds?.toString() ?? "");
    setFloating(order.followerFloatingInterval ?? false);
    setRegionOpen(true);
  }

  const errorMessage = error && <p className={styles.actionError} role="alert"><WarningCircle size={18} aria-hidden="true" />{error}</p>;
  if (!canConfigure && !canPause && !liveAction) return null;
  return <>
    <div className={viewerControl ? styles.viewerActions : styles.desktopActions} role="group" aria-label="Действия запуска" aria-busy={pending}>
      {canConfigure && <button type="button" className={styles.actionButton} data-tone="accent" ref={regionButton}
        aria-haspopup="dialog" aria-disabled={pending} onClick={() => openSettings()}>
        <span className={styles.actionIcon}><SettingsIcon size={20} weight="regular" aria-hidden="true" /></span>
        <span>{settingsLabel}</span><CaretRight className={styles.actionArrow} size={16} weight="regular" aria-hidden="true" />
      </button>}
      {canManageChat && <button type="button" className={styles.actionButton} data-tone="accent" ref={chatButton}
        aria-haspopup="dialog" aria-disabled={pending} onClick={() => openSettings(true)}>
        <span className={styles.actionIcon}><ChatDots size={20} weight="regular" aria-hidden="true" /></span>
        <span>{chatLabel}</span><CaretRight className={styles.actionArrow} size={16} weight="regular" aria-hidden="true" />
      </button>}
      {(canPause || liveAction) && <button type="button" className={styles.actionButton} aria-disabled={pending} onClick={() => void save(actionChange)}>
        <span className={styles.actionIcon}><ActionIcon size={20} weight="regular" aria-hidden="true" /></span><span>{actionLabel}</span>
      </button>}
    </div>
    {!viewerControl && <div className={styles.mobileActions}>
      <Popover.Root open={menu} onOpenChange={setMenu}>
        <Popover.Trigger asChild>
          <button type="button" ref={more} className={`${styles.actionButton} ${styles.iconButton}`}
            aria-label={`Действия запуска: ${order.title || order.url}`} aria-busy={pending}>
            <DotsThree size={24} aria-hidden="true" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content className={`${workspace.accountPopup} ${styles.actionPopup}`} align="end" sideOffset={4} collisionPadding={12}
            aria-label="Действия запуска" data-launch-end={end} data-launch-popup tabIndex={-1} data-popup-focus
            onKeyDown={event => {
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
              const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
              if (!buttons.length) return;
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
                : event.key === "ArrowDown" ? (index + 1) % buttons.length
                : (index <= 0 ? buttons.length : index) - 1;
              event.preventDefault();
              buttons[next].focus();
            }}
            onOpenAutoFocus={focusPopupOnOpen} onCloseAutoFocus={event => {
              if (openingRegion.current || !window.matchMedia(mobile).matches) event.preventDefault();
              openingRegion.current = false;
            }}>
            {(canPause || liveAction) && <button type="button" className={styles.actionButton} disabled={pending} onClick={() => {
              setMenu(false);
              void save(actionChange);
            }}><span className={styles.actionIcon}><ActionIcon size={20} weight="regular" aria-hidden="true" /></span>{actionLabel}</button>}
            {canConfigure && <button type="button" className={styles.actionButton} data-tone="accent" aria-haspopup="dialog" disabled={pending} onClick={() => openSettings()}>
              <span className={styles.actionIcon}><SettingsIcon size={20} weight="regular" aria-hidden="true" /></span>{settingsLabel}
            </button>}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>}
    {!regionOpen && errorMessage}
    {canConfigure && <Dialog.Root open={regionOpen} onOpenChange={setRegionOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.regionOverlay} />
        <Dialog.Content className={viewerControl ? `${styles.regionDialog} ${styles.settingsDialog}` : styles.regionDialog}
          tabIndex={-1} data-popup-focus data-launch-end={end} data-launch-popup
          onOpenAutoFocus={focusPopupOnOpen} onCloseAutoFocus={event => {
            event.preventDefault();
            const trigger = chat ? chatButton.current ?? regionButton.current
              : !viewerControl && window.matchMedia(mobile).matches ? more.current : regionButton.current;
            trigger?.focus({ preventScroll: true });
          }}>
          {viewerControl ? <header className={styles.settingsHeader}>
            <Dialog.Title className={styles.settingsHeading}>
              <span className={styles.groupIcon}><DialogIcon size={20} weight="regular" aria-hidden="true" /></span>
              {chat ? chatLabel : settingsLabel}
            </Dialog.Title>
            <Dialog.Description className={styles.settingsIntro}>
              <span>Заполните только поля, которые хотите изменить.</span>
              <span className={styles.priceNote}><Info size={18} weight="regular" aria-hidden="true" />Стоимость заказа не изменится.</span>
            </Dialog.Description>
          </header> : <>
            <Dialog.Title>{settingsLabel}</Dialog.Title>
            <Dialog.Description>{followerAction ? "Изменение темпа не меняет количество и стоимость заказа." : "Регион сохраняется для этого демозапуска."}</Dialog.Description>
          </>}
          <form className={viewerControl ? styles.settingsForm : undefined} aria-busy={pending}
            noValidate onChange={viewerControl ? () => setError("") : undefined} onSubmit={event => {
            event.preventDefault();
            if (pending) return;
            if (!event.currentTarget.reportValidity()) return;
            if (viewerControl && chat) {
              const settings = readViewerChatFields(event.currentTarget);
              if (!settings) setError("Укажите изменение. В списке может быть до 100 фраз, до 500 знаков в каждой.");
              else void save({ viewerChat: settings });
            } else if (viewerControl) {
              const settings = readViewerFields(event.currentTarget);
              const message = settings ? viewerSettingsError(settings, order.quantity) : "Проверьте имя канала, целые числа и формат графика.";
              if (message) setError(message);
              else if (settings) void save({ viewers: settings });
            } else if (followerAction) {
              if (validInterval) void save({ interval: Number(interval), floating });
            } else if (region !== order.region) void save({ region });
          }}>
            {viewerControl ? <div className={styles.settingsScroll}>
              {chat
                ? <ViewerChatFields pending={pending} pendingAction={pendingChatAction} status={chatStatus}
                  onRetry={() => { setError(""); setChatStatus("loading"); setChatRead(value => value + 1); }}
                  onAction={viewerChatAction => void save({ viewerChatAction })} />
                : <TwitchViewerFields pending={pending} quantity={order.quantity} />}
            </div> : followerAction ? <>
              <FollowerInterval value={interval} pending={pending} onChange={value => { setIntervalValue(value); setError(""); }} />
              <label className={styles.floatingInterval}>
                <input type="checkbox" checked={floating} disabled={pending} aria-describedby={`${selectId}-floating`}
                  onChange={event => { setFloating(event.target.checked); setError(""); }} />
                Менять интервал в пределах ±25%
              </label>
              <p id={`${selectId}-floating`} className={styles.intervalHelp}>Подписки будут идти с небольшим разбросом по времени.</p>
            </> : <><label htmlFor={selectId}>Регион</label>
            <select id={selectId} value={region} disabled={pending} onChange={event => {
              setRegion(event.target.value as LaunchRegion);
              setError("");
            }}>
              {launchRegions.map(value => <option key={value} value={value}>{launchRegionNames[value]}</option>)}
            </select></>}
            <div className={viewerControl ? styles.settingsFooter : styles.inlineFooter}>
              {errorMessage}
              <div className={styles.dialogButtons}>
                <Dialog.Close asChild><button type="button" className={styles.actionButton}>{pending ? "Закрыть" : "Отмена"}</button></Dialog.Close>
                <button type="submit" className={styles.actionButton} data-tone="primary" aria-disabled={pending || (!viewerControl && (followerAction ? !validInterval : region === order.region))}>
                  {pending && !pendingChatAction ? "Сохраняем…" : "Сохранить"}
                </button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>}
  </>;
}
