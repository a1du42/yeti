"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowSquareOut, LinkSimple, Play, WarningCircle, CheckCircle, VideoCamera, Question } from "@phosphor-icons/react";
import { parseStreamLink, platformNames, type StreamInfo } from "@/lib/stream-link";
import { IconTooltip } from "@/components/ui";
import styles from "./launch-panel.module.css";

export function LaunchPanel({ active }: { active: boolean }) {
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<StreamInfo | null>(null);
  const [service, setService] = useState("");
  const request = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const focusLinkAfterReset = useRef(false);
  useEffect(() => { if (!active) { request.current?.abort(); request.current = null; setBusy(false); } return () => { request.current?.abort(); request.current = null; }; }, [active]);
  async function resolve(value: string) {
    request.current?.abort();
    if (!parseStreamLink(value)) { setError("Проверьте ссылку. Поддерживаются видео YouTube, каналы, записи и клипы Twitch, каналы и записи Kick."); setBusy(false); return; }
    const controller = new AbortController();
    request.current = controller;
    setError(""); setBusy(true); setInfo(null); setService("");
    const timer = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch("/api/stream-info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: value }), signal: controller.signal, cache: "no-store" });
      const data = await response.json();
      if (request.current !== controller || controller.signal.aborted) return;
      if (!response.ok) throw new Error(data.error || "Не удалось получить сведения.");
      setInfo(data);
    } catch (cause) {
      if (request.current === controller) setError(controller.signal.aborted ? "Время ожидания истекло. Повторите попытку." : cause instanceof Error ? cause.message : "Не удалось связаться с сервером. Повторите попытку.");
    } finally { window.clearTimeout(timer); if (request.current === controller) setBusy(false); }
  }
  useEffect(() => {
    if (info) resultHeading.current?.focus({ preventScroll: true });
    else if (focusLinkAfterReset.current) { input.current?.focus(); focusLinkAfterReset.current = false; }
  }, [info]);
  function reset() { request.current?.abort(); request.current = null; focusLinkAfterReset.current = true; setBusy(false); setInfo(null); setService(""); setError(""); }
  const platform = parseStreamLink(link)?.platform;
  const live = info?.kind === "channel";
  const services = info ? [
    { id: "viewers", title: "Зрители трансляции", description: "Количество зрителей и длительность подключения к прямому эфиру.", available: live || info.platform === "youtube" },
    { id: "views", title: "Просмотры видео", description: "Количество просмотров выбранной записи или клипа.", available: !live },
    { id: "followers", title: info.platform === "youtube" ? "Подписчики канала" : "Фолловеры канала", description: "Количество подписок на канал, на который ведёт ссылка.", available: live },
  ].filter(item => item.available) : [];
  return <div className={styles.root}>
    {!info ? <>
      <div className={styles.heading}><LinkSimple size={24} aria-hidden="true" /><h2>Что будем продвигать?</h2></div>
      <p className={styles.muted}>Вставьте ссылку на видео или трансляцию. Сервис определится автоматически.</p>
      <form onSubmit={(event: FormEvent) => { event.preventDefault(); void resolve(link); }} className={styles.form} noValidate aria-busy={busy}>
        <label htmlFor="launch-link">Ссылка на видео или канал</label>
        <div className={styles.inputRow}><input id="launch-link" ref={input} type="url" inputMode="url" maxLength={2048} autoComplete="off" spellCheck={false} placeholder="https://www.youtube.com/watch?v=…" value={link} aria-invalid={!!error} aria-describedby={error ? "launch-error launch-supported" : "launch-supported"}
          onChange={event => { request.current?.abort(); request.current = null; setBusy(false); setLink(event.target.value); setError(""); }}
          onPaste={event => { const text = event.clipboardData.getData("text").trim(); if (parseStreamLink(text)) { event.preventDefault(); setLink(text); void resolve(text); } }} />
          <button className={styles.primary} type="submit" disabled={busy}>{busy ? "Получаем сведения…" : "Продолжить"}</button></div>
        <p id="launch-supported" className={styles.muted}>Twitch · YouTube · Kick</p>
        {platform && <p className={styles.status}><CheckCircle size={18} aria-hidden="true" />Определён {platformNames[platform]}</p>}
        <span role="status" className="sr-only">{busy ? "Получаем сведения с площадки" : ""}</span>
        {error && <p id="launch-error" className={styles.error} role="alert"><WarningCircle size={20} aria-hidden="true" />{error}</p>}
      </form>
    </> : <>
      <button className={styles.back} onClick={reset}><ArrowLeft size={20} aria-hidden="true" />Изменить ссылку</button>
      <section className={styles.summary} aria-labelledby="launch-result">
        {info.thumbnail ? <img className={styles.thumbnail} src={info.thumbnail} alt="" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} /> : <div className={styles.placeholder}><VideoCamera size={40} aria-hidden="true" /></div>}
        <div className={styles.details}><span className={styles.platform}>{platformNames[info.platform]}</span><h2 id="launch-result" ref={resultHeading} tabIndex={-1} data-popup-focus>{info.title || "Название недоступно"}</h2>
          <dl><div><dt>{live ? "Канал" : "ID видео / клипа"}</dt><dd>{info.id}</dd></div><div><dt>Идентификатор</dt><dd>{info.platform}:{info.kind}:{info.id}</dd></div>{info.author && <div><dt>Автор</dt><dd>{info.author}</dd></div>}</dl>
          <a href={info.url} target="_blank" rel="noopener noreferrer" className={styles.source}>Открыть на {platformNames[info.platform]}<ArrowSquareOut size={18} aria-hidden="true" /></a>
        </div>
        {info.description && <p className={styles.description}>{info.description}</p>}
      </section>
      <div className={styles.notice}><WarningCircle size={20} aria-hidden="true" /><p>{info.warning}</p><button className={styles.back} disabled={busy} onClick={() => void resolve(link)}>{busy ? "Получаем…" : "Повторить"}</button></div>
      <section aria-labelledby="launch-services" className={styles.services}>
        <div className={styles.heading}><h2 id="launch-services">Выберите услугу</h2><IconTooltip label="Выберите вариант, чтобы посмотреть его описание. Список услуг предварительный; заказы пока не запускаются."><button className={styles.help} aria-label="О выборе услуги"><Question size={20} aria-hidden="true" /></button></IconTooltip></div>
        <p className={styles.muted}>Демонстрационные услуги. Цены и выполнение пока не подключены.</p>
        <fieldset><legend className="sr-only">Услуги {platformNames[info.platform]}</legend>{services.map(item => <label key={item.id} className={styles.service} data-selected={service === item.id}><input type="radio" name="launch-service" value={item.id} checked={service === item.id} onChange={() => setService(item.id)} /><span><strong>{item.title}</strong><span>{item.description}</span></span></label>)}</fieldset>
        {service && <div className={styles.selection} role="status"><Play size={20} aria-hidden="true" /><p>Выбрано: {services.find(item => item.id === service)?.title}. Настройка и запуск будут доступны после подключения услуги. Деньги не списываются.</p></div>}
      </section>
    </>}
  </div>;
}
