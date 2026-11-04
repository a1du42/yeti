"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Desktop, Sun, Moon } from "@phosphor-icons/react";
import styles from "./ui.module.css";

export function focusPopupOnOpen(event: Event) {
  event.preventDefault();
  if (event.target instanceof HTMLElement) event.target.focus({ preventScroll: true });
}

export function Logo({ mark = false }: { mark?: boolean }) {
  return <span className={`${styles.logo} ${mark ? styles.logoMark : ""}`} role="img" aria-label="YETI STREAM">
    {/* Готовые SVG содержат надпись в кривых. */}
    <img className={styles.light} src={mark ? "/assets/logo-mark.svg" : "/assets/logo.svg"} width={mark ? 48 : 180} height={mark ? 48 : 76} alt="" />
    <img className={styles.dark} src={mark ? "/assets/logo-mark-dark.svg" : "/assets/logo-dark.svg"} width={mark ? 48 : 180} height={mark ? 48 : 76} alt="" />
  </span>;
}

export function IconTooltip({ label, children, toggleOnClick = true }: { label: string; children: ReactElement; toggleOnClick?: boolean }) {
  const [open, setOpen] = useState(false);
  const wasOpenOnPointerDown = useRef(false);
  return <Tooltip.Provider delayDuration={240} skipDelayDuration={0}>
    <Tooltip.Root open={open} onOpenChange={setOpen}>
      <Tooltip.Trigger
        asChild
        onPointerDown={() => { wasOpenOnPointerDown.current = open; }}
        onClick={event => {
          if (!toggleOnClick) { setOpen(false); return; }
          event.preventDefault();
          setOpen(!(event.detail === 0 ? open : wasOpenOnPointerDown.current));
        }}
      >{children}</Tooltip.Trigger>
      <Tooltip.Portal><Tooltip.Content className={styles.tooltip} sideOffset={8} collisionPadding={16}>{label}</Tooltip.Content></Tooltip.Portal>
    </Tooltip.Root>
  </Tooltip.Provider>;
}

type Theme = "system" | "light" | "dark";
export function ThemeChoices() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    const read = () => {
      try {
        const value = localStorage.getItem("yeti-theme");
        setTheme(value === "light" || value === "dark" ? value : "system");
      } catch { setTheme("system"); }
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener("yeti-theme-change", read);
    return () => { window.removeEventListener("storage", read); window.removeEventListener("yeti-theme-change", read); };
  }, []);
  const choose = (value: Theme) => {
    setTheme(value);
    if (value === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = value;
    try { localStorage.setItem("yeti-theme", value); } catch { /* Тема доступна и при запрете хранилища. */ }
    window.dispatchEvent(new Event("yeti-theme-change"));
  };
  return <div className={styles.themes} role="group" aria-label="Цветовая тема">
    {([{ value: "system", label: "Как в системе", Icon: Desktop }, { value: "light", label: "Светлая тема", Icon: Sun }, { value: "dark", label: "Тёмная тема", Icon: Moon }] as const).map(({ value, label, Icon }) =>
      <IconTooltip key={value} label={label}><button type="button" className={styles.theme} aria-label={label} aria-pressed={theme === value} onClick={() => choose(value)}><Icon size={20} weight="regular" aria-hidden="true" /></button></IconTooltip>
    )}
  </div>;
}
