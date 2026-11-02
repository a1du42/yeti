"use client";

import { useEffect, useRef, useState } from "react";
import { SignIn, WarningCircle } from "@phosphor-icons/react";
import { authClient } from "@/lib/auth-client";
import { IconTooltip } from "@/components/ui";
import styles from "./google-access.module.css";

export function GoogleAccess({ linking = false, disabled = false, active = true, provider = "google" }: { provider?: "google" | "yandex"; linking?: boolean; disabled?: boolean; active?: boolean }) {
  const service = provider === "google" ? "Google" : "Яндекс ID";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const reset = () => { controller.current?.abort(); controller.current = null; setPending(false); };
    window.addEventListener("pageshow", reset);
    if (!active) reset();
    return () => { window.removeEventListener("pageshow", reset); controller.current?.abort(); controller.current = null; };
  }, [active]);
  async function start() {
    if (controller.current || disabled) return;
    const current = new AbortController();
    controller.current = current;
    setPending(true);
    setError("");
    try {
      let timezone = "";
      try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* Keep unknown zone empty. */ }
      const result = linking
        ? await authClient.linkSocial({ provider, disableRedirect: true, fetchOptions: { signal: current.signal } })
        : await authClient.signIn.social({ provider, disableRedirect: true, additionalData: { timezone }, fetchOptions: { signal: current.signal } });
      if (current.signal.aborted) return;
      if (result.error || !result.data?.url) throw new Error("OAuth start failed");
      window.location.assign(result.data.url);
    } catch {
      if (!current.signal.aborted) { setError(`Не удалось начать вход через ${service}. Проверьте соединение и повторите попытку.`); setPending(false); controller.current = null; }
    }
  }
  const label = linking ? `Подключить ${service}` : `Продолжить через ${service}`;
  return <div className={styles.access} data-linking={linking} aria-busy={pending}>
    <IconTooltip label={label}><button type="button" className={`button ${styles.provider}`} aria-label={label} disabled={disabled || pending} onClick={start}>
      <img src={provider === "google" ? "/assets/google.png" : "/assets/yandex.ico"} width="20" height="20" alt="" />{linking && <span>Подключить {service}</span>}
    </button></IconTooltip>
    <p className={styles.progress} data-visible={pending} role="status">{pending && <><SignIn size={20} aria-hidden="true" />Переходим в {service}…</>}</p>
    {error && <p className={styles.error} role="alert"><WarningCircle size={20} aria-hidden="true" />{error}</p>}
  </div>;
}
