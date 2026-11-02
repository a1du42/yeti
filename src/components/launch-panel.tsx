"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowSquareOut, CircleNotch, LinkSimple, Users, Eye, UserPlus, WarningCircle, CheckCircle, VideoCamera, Question } from "@phosphor-icons/react";
import { parseStreamLink, platformNames, streamTypeNames, type StreamInfo } from "@/lib/stream-link";
import { formatUsd } from "@/lib/money";
import { IconTooltip } from "@/components/ui";
import styles from "./launch-panel.module.css";

export function LaunchPanel({ active }: { active: boolean }) {
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<StreamInfo | null>(null);
  const [service, setService] = useState("");
  const [quantity, setQuantity] = useState("100");
  const [hours, setHours] = useState("1");
  const request = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const focusLinkAfterReset = useRef(false);
  useEffect(() => { if (!active) { request.current?.abort(); request.current = null; setBusy(false); } return () => { request.current?.abort(); request.current = null; }; }, [active]);
  async function resolve(value: string) {
    request.current?.abort();
    if (!parseStreamLink(value)) { setError("Проверьте ссылку. Поддерживаются каналы и видео YouTube, каналы, записи и клипы Twitch, каналы и записи Kick."); setBusy(false); return; }
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
  const channel = info?.sourceKind === "channel";
  const live = info?.kind === "stream";
  const services = info ? [
    { id: "viewers", title: "Зрители трансляции", summary: "От 100 зрителей · от 1 до 24 часов", description: "Укажите количество зрителей и длительность подключения к прямой трансляции. Минимум 100 зрителей, длительность от 1 до 24 целых часов. Стоимость: количество зрителей × цена за зрителя в час × часы. Ссылка должна вести на подтверждённую трансляцию.", unit: "зритель на 1 час", priceCents: 5, Icon: Users, available: live },
    { id: "views", title: "Просмотры видео", summary: "Просмотры выбранной записи или клипа", description: "Укажите количество просмотров для видео по выбранной ссылке. Одна единица — один просмотр. Этот вариант относится к записи или клипу, а не к одновременным зрителям эфира.", unit: "просмотр", priceCents: 5, Icon: Eye, available: !live && !channel },
    { id: "followers", title: info.platform === "youtube" ? "Подписчики канала" : "Фолловеры канала", summary: "Подписки на выбранный канал", description: "Укажите количество подписок для выбранного канала. Одна единица — одна подписка. Подписка на канал не является платной подпиской площадки и не включает зрителей или просмотры.", unit: "подписка", priceCents: 5, Icon: UserPlus, available: channel },
  ].filter(item => item.available) : [];
  const selected = services.find(item => item.id === service);
  const isViewers = service === "viewers";
  const minQuantity = isViewers ? 100 : 1;
  const duration = hours === "" ? null : Number(hours);
  const validHours = duration !== null && Number.isInteger(duration) && duration >= 1 && duration <= 24;
  const count = quantity === "" ? null : Number(quantity);
  const validQuantity = count !== null && Number.isInteger(count) && count >= minQuantity && count <= 10000;
  const quantityError = quantity === "" ? "Укажите количество." : !validQuantity ? `Введите целое количество от ${minQuantity} до 10 000.` : "";
  function changeQuantity(value: string) {
    if (value === "") { setQuantity(""); return; }
    const number = Number(value);
    setQuantity(Number.isFinite(number) ? number < minQuantity ? String(minQuantity) : number > 10000 ? "10000" : value : value);
  }

  return <div className={styles.root}>
    {!info ? <>
      <div className={styles.heading}><LinkSimple size={24} aria-hidden="true" /><h2>Что будем продвигать?</h2></div>
      <p id="launch-supported" className={styles.muted}>Поддерживаемые сервисы Twitch · YouTube · Kick</p>
      <form onSubmit={(event: FormEvent) => { event.preventDefault(); void resolve(link); }} className={styles.form} noValidate aria-busy={busy}>
        <label htmlFor="launch-link">Ссылка на видео, канал или трансляцию</label>
        <div className={styles.inputRow}><input id="launch-link" ref={input} type="url" inputMode="url" maxLength={2048} autoComplete="off" spellCheck={false} placeholder="https://www.youtube.com/watch?v=…" value={link} aria-invalid={!!error} aria-describedby={error ? "launch-error launch-supported" : "launch-supported"}
          onChange={event => { request.current?.abort(); request.current = null; setBusy(false); setLink(event.target.value); setError(""); }}
          onPaste={event => { const text = event.clipboardData.getData("text").trim(); if (parseStreamLink(text)) { event.preventDefault(); setLink(text); void resolve(text); } }} />
          <button className={styles.primary} type="submit" disabled={busy} aria-busy={busy} aria-label="Продолжить"><span className={styles.buttonLabel} aria-hidden={busy}>Продолжить</span>{busy && <CircleNotch className={styles.spinner} size={20} weight="regular" aria-hidden="true" />}</button></div>

        {platform && <p className={styles.status}><CheckCircle size={18} aria-hidden="true" />Определён {platformNames[platform]}</p>}
        <span role="status" className="sr-only">{busy ? "Получаем сведения с площадки" : ""}</span>
        {error && <p id="launch-error" className={styles.error} role="alert"><WarningCircle size={20} aria-hidden="true" />{error}</p>}
      </form>
    </> : <>
      <button className={styles.back} onClick={reset}><ArrowLeft size={20} aria-hidden="true" />Изменить ссылку</button>
      <section className={styles.summary} aria-labelledby="launch-result">
        {info.thumbnail ? <img className={styles.thumbnail} src={info.thumbnail} alt="" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} /> : <div className={styles.placeholder}><VideoCamera size={40} aria-hidden="true" /></div>}
        <div className={styles.details}><span className={styles.platform}>{platformNames[info.platform]}</span><h2 id="launch-result" ref={resultHeading} tabIndex={-1} data-popup-focus>{info.title || "Название недоступно"}</h2>
          <dl><div><dt>Тип ссылки</dt><dd>{streamTypeNames[info.kind]}</dd></div><div><dt>{channel ? "Канал" : live ? "ID трансляции" : "ID видео / клипа"}</dt><dd>{info.id}</dd></div><div><dt>Идентификатор</dt><dd>{info.platform}:{info.kind}:{info.id}</dd></div>{info.author && <div><dt>Автор</dt><dd>{info.author}</dd></div>}</dl>
          <a href={info.url} target="_blank" rel="noopener noreferrer" className={styles.source}>Открыть на {platformNames[info.platform]}<ArrowSquareOut size={18} aria-hidden="true" /></a>
        </div>
        {info.description && <p className={styles.description}>{info.description}</p>}
      </section>
      {info.warning && <div className={styles.notice}><WarningCircle size={20} aria-hidden="true" /><p>{info.warning}</p><button className={styles.back} disabled={busy} onClick={() => void resolve(link)}>{busy ? "Получаем…" : "Повторить"}</button></div>}
      <section aria-labelledby="launch-services" className={styles.services}>
        <div className={styles.heading}><h2 id="launch-services">Выберите услугу</h2><IconTooltip label="Выберите вариант, чтобы посмотреть его описание. Список услуг предварительный; заказы пока не запускаются."><button className={styles.help} aria-label="О выборе услуги"><Question size={20} aria-hidden="true" /></button></IconTooltip></div>
        <p className={styles.muted}>Демонстрационные цены. Можно выбрать услугу и рассчитать стоимость; оформление и списание не подключены.</p>
        <div className={styles.serviceList} role="group" aria-label={`Услуги ${platformNames[info.platform]}`}>
          {services.map(item => <button type="button" key={item.id} className={styles.service} aria-pressed={service === item.id} aria-controls="service-configuration" onClick={() => { setService(item.id); setQuantity("100"); setHours("1"); }}>
            <item.Icon size={24} weight="regular" aria-hidden="true" />
            <span className={styles.serviceCopy}><strong>{item.title}</strong><span>{item.summary}</span></span>
            <span className={styles.rate}><strong>{formatUsd(item.priceCents)}</strong><span>за 1 · {item.unit}</span></span>
            {service === item.id && <CheckCircle className={styles.choiceCheck} size={20} weight="regular" aria-hidden="true" />}
          </button>)}
        </div>
        <div id="service-configuration">
          {selected && <section className={styles.configuration} aria-labelledby="service-title">
            <div className={styles.serviceDescription}><h3 id="service-title">{selected.title}</h3><p>{selected.description}</p></div>
            <div className={styles.calculation}>
              <div className={styles.parameters}><div className={styles.quantityField}><label htmlFor="service-quantity">{isViewers ? "Количество зрителей, чел." : "Количество, шт."}</label>
                <input id="service-quantity" type="number" inputMode="numeric" min={minQuantity} max={10000} step={1} value={quantity} onChange={event => changeQuantity(event.target.value)} aria-invalid={!!quantityError} aria-describedby={quantityError ? "quantity-help quantity-error" : "quantity-help"} />
                <p id="quantity-help" className={styles.muted}>От {minQuantity} до 10 000. Значения за пределами диапазона ограничиваются его границей. Поле можно очистить.</p>
                {quantityError && <p id="quantity-error" className={styles.error}>{quantityError}</p>}
              </div>
              {isViewers && <div className={styles.quantityField}>
                <div className={styles.rangeHeading}><label htmlFor="service-hours">Длительность</label><span className={styles.rangeValue}>{duration} ч</span></div>
                <input id="service-hours" className={styles.hoursRange} type="range" min={1} max={24} step={1} value={hours} onChange={event => setHours(event.target.value)} aria-valuetext={`${duration} ч`} aria-describedby="hours-help" />
                <div className={styles.rangeLimits} id="hours-help"><span>1 ч</span><span>24 ч</span></div>
              </div>}
              </div>
              <dl className={styles.total} aria-live="polite" aria-atomic="true"><div><dt>{isViewers ? "Цена за зрителя в час" : "Цена за единицу"}</dt><dd>{formatUsd(selected.priceCents)}</dd></div><div><dt>{isViewers ? "Зрителей" : "Количество"}</dt><dd>{validQuantity ? `${count}${isViewers ? " чел." : " шт."}` : "—"}</dd></div>{isViewers && <div><dt>Длительность</dt><dd>{validHours ? `${duration} ч` : "—"}</dd></div>}<div className={styles.totalAmount}><dt>Итого</dt><dd>{validQuantity && (!isViewers || validHours) ? formatUsd(selected.priceCents * count! * (isViewers ? duration! : 1)) : "—"}</dd></div></dl>
            </div>
            <p className={styles.muted}>Предварительный расчёт по демонстрационной цене. Заказ не создаётся, баланс не меняется.</p>
          </section>}
        </div>
      </section>
    </>}
  </div>;
}
