"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { ArrowLeft, CheckCircle, EnvelopeSimple, Eye, EyeSlash, Key, SignIn, UserPlus, WarningCircle } from "@phosphor-icons/react";
import { authClient } from "@/lib/auth-client";
import { emailError, isTimezone, nameError, passwordError } from "@/lib/validation";
import { timezoneLabel, timezoneOptions } from "@/lib/timezones";
import { IconTooltip, Logo, ThemeChoices } from "@/components/ui";
import styles from "./auth-screen.module.css";

type Mode = "login" | "register" | "recovery" | "reset";
type Fields = { name: string; email: string; password: string; repeat: string; timezone: string };
type FieldName = keyof Fields;
type Errors = Partial<Record<FieldName, string>>;
const labels: Record<FieldName, string> = { name: "Имя", email: "Email", password: "Пароль", repeat: "Повторите пароль", timezone: "Часовой пояс" };

function AccessForm({ mode, active, goLogin, goRecovery, googleEnabled }: { mode: Mode; active: boolean; goLogin: () => void; goRecovery: () => void; googleEnabled: boolean }) {
  const [fields, setFields] = useState<Fields>({ name: "", email: "", password: "", repeat: "", timezone: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [shown, setShown] = useState({ password: false, repeat: false });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const [detected, setDetected] = useState(false);
  const [zones, setZones] = useState<ReturnType<typeof timezoneOptions>>([]);
  const controller = useRef<AbortController | null>(null);
  const summary = useRef<HTMLDivElement>(null);
  const focusErrors = useRef(false);
  const touched = useRef(new Set<FieldName>());
  const isNewPassword = mode === "register" || mode === "reset";
  const visibleFields: FieldName[] = mode === "register" ? ["name", "email", "password", "repeat", "timezone"] : mode === "login" ? ["email", "password"] : mode === "recovery" ? ["email"] : ["password", "repeat"];
  const id = (field: FieldName) => `${mode}-${field}`;

  useEffect(() => {
    if (mode !== "register") return;
    let zone = "";
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* Ручной выбор без значения по умолчанию. */ }
    const valid = isTimezone(zone);
    setFields(value => ({ ...value, timezone: valid ? zone : "" }));
    setDetected(valid);
    setZones(timezoneOptions(valid ? zone : ""));
  }, [mode]);

  useEffect(() => {
    if (!active) { controller.current?.abort(); controller.current = null; setBusy(false); }
    return () => { controller.current?.abort(); controller.current = null; };
  }, [active]);

  useEffect(() => {
    if (!focusErrors.current) return;
    focusErrors.current = false;
    const invalid = (Object.keys(errors) as FieldName[]).filter(field => !!errors[field]);
    if (invalid.length > 1) summary.current?.focus();
    else if (invalid.length === 1) document.getElementById(id(invalid[0]))?.focus();
  }, [errors]);

  const validateField = (field: FieldName, value: Fields): string | undefined => {
    if (field === "name") return nameError(value.name);
    if (field === "email") return emailError(value.email);
    if (field === "password") return isNewPassword ? passwordError(value.password) : !value.password ? "Введите пароль" : undefined;
    if (field === "repeat") return !value.repeat ? "Повторите пароль" : value.repeat !== value.password ? "Пароли не совпадают. Повторите пароль ещё раз" : undefined;
    if (field === "timezone" && !isTimezone(value.timezone)) return "Выберите часовой пояс";
  };

  const change = (field: FieldName, value: string) => {
    const next = { ...fields, [field]: value };
    setFields(next);
    setErrors(previous => {
      const updated = { ...previous };
      if (touched.current.has(field)) updated[field] = validateField(field, next);
      if ((field === "password" || field === "repeat") && touched.current.has("repeat")) updated.repeat = validateField("repeat", next);
      return updated;
    });
  };

  const validate = (names = visibleFields) => {
    const next: Errors = {};
    for (const field of names) { touched.current.add(field); const error = validateField(field, fields); if (error) next[field] = error; }
    focusErrors.current = true;
    setErrors(next);
    const invalid = Object.keys(next) as FieldName[];
    if (!invalid.length) return true;
    return false;
  };

  const blur = (field: FieldName, nextTarget: EventTarget | null) => {
    // Submit validates all fields. Avoid moving its target between pointer-down and pointer-up.
    if (nextTarget instanceof HTMLButtonElement && nextTarget.type === "submit") return;
    touched.current.add(field);
    setErrors(previous => ({ ...previous, [field]: validateField(field, fields) }));
  };

  const run = async (action: (signal: AbortSignal) => Promise<void>) => {
    if (controller.current) return;
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setNotice(undefined);
    try { await action(current.signal); }
    catch {
      if (!current.signal.aborted) setNotice({ text: "Не удалось получить ответ. Проверьте соединение и повторите попытку. Введённые данные сохранены", error: true });
    } finally {
      if (controller.current === current) { controller.current = null; setBusy(false); }
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    void run(async signal => {
      const fetchOptions = { signal };
      const result = mode === "login"
        ? await authClient.signIn.email({ email: fields.email.trim(), password: fields.password, fetchOptions })
        : mode === "register"
          ? await authClient.signUp.email({ name: fields.name.trim(), email: fields.email.trim(), password: fields.password, timezone: fields.timezone, callbackURL: "/app/auth?verified=1", fetchOptions })
          : mode === "recovery"
            ? await authClient.requestPasswordReset({ email: fields.email.trim(), redirectTo: "/app/auth/reset", fetchOptions })
            : await authClient.resetPassword({ newPassword: fields.password, fetchOptions });
      if (signal.aborted) return;
      if (result.error) {
        const text = result.error.status === 429 ? "Слишком много попыток. Подождите немного и повторите"
          : mode === "login" ? "Не удалось войти. Проверьте почту и пароль, подтвердите адрес или восстановите доступ"
          : mode === "reset" && result.error.code === "INVALID_TOKEN" ? "Ссылка недействительна или уже использована. Запросите новую"
          : result.error.status >= 500 ? "Сервис временно недоступен. Попробуйте ещё раз"
          : "Не удалось выполнить действие. Проверьте данные и повторите попытку";
        setNotice({ text, error: true });
        return;
      }
      if (mode === "login") { window.location.replace("/app"); return; }
      setNotice({ text: mode === "register" ? "Проверьте почту для продолжения регистрации. Если аккаунт уже есть, попробуйте войти или восстановить пароль"
        : mode === "recovery" ? "Если для этого адреса доступно восстановление, придёт письмо со ссылкой. Проверьте входящие и спам"
        : "Пароль сохранён. Войдите с новым паролем" });
      if (mode === "reset") { setFields(value => ({ ...value, password: "", repeat: "" })); window.history.replaceState(null, "", "/app/auth"); }
    });
  };

  const resend = () => {
    if (!validate(["email"])) return;
    void run(async signal => {
      const result = await authClient.sendVerificationEmail({ email: fields.email.trim(), callbackURL: "/app/auth?verified=1", fetchOptions: { signal } });
      if (signal.aborted) return;
      setNotice(result.error ? { text: result.error.status === 429 ? "Слишком много запросов. Подождите немного и повторите" : "Не удалось отправить запрос. Повторите попытку", error: true } : { text: "Если адрес ожидает подтверждения, придёт письмо со ссылкой. Проверьте входящие и спам" });
    });
  };

  const errorEntries = Object.entries(errors).filter((entry): entry is [FieldName, string] => !!entry[1]);
  const googleLogin = () => void run(async signal => {
    let timezone = "";
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* Не подставлять неизвестную зону. */ }
    const result = await authClient.signIn.social({ provider: "google", callbackURL: "/app", errorCallbackURL: "/app/auth?oauthError=1", additionalData: { timezone }, fetchOptions: { signal } });
    if (!signal.aborted && result.error) setNotice({ text: "Не удалось начать вход через Google. Попробуйте ещё раз", error: true });
  });
  const passwordField = (field: "password" | "repeat") => {
    const label = field === "password" ? mode === "reset" ? "Новый пароль" : "Пароль" : mode === "reset" ? "Повторите новый пароль" : "Повторите пароль";
    const toggleLabel = `${shown[field] ? "Скрыть" : "Показать"} ${field === "repeat" ? "повтор пароля" : "пароль"}`;
    return <div className="field" key={field}>
      <label htmlFor={id(field)}>{label}</label>
      <div className={styles.password}>
        <input id={id(field)} name={field} type={shown[field] ? "text" : "password"} autoComplete={isNewPassword ? "new-password" : "current-password"} required readOnly={busy} value={fields[field]} aria-invalid={!!errors[field]} aria-describedby={`${isNewPassword && field === "password" ? `${mode}-password-help ` : ""}${errors[field] ? `${id(field)}-error` : ""}`.trim() || undefined} onChange={event => change(field, event.target.value)} onBlur={event => blur(field, event.relatedTarget)} />
        <IconTooltip label={toggleLabel}><button type="button" className={styles.eye} aria-label={toggleLabel} aria-pressed={shown[field]} onClick={() => setShown(previous => ({ ...previous, [field]: !previous[field] }))}>{shown[field] ? <EyeSlash size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}</button></IconTooltip>
      </div>
      {isNewPassword && field === "password" && <small id={`${mode}-password-help`}>От 15 до 128 символов. Можно использовать пробелы и вставку.</small>}
      {errors[field] && <p id={`${id(field)}-error`} className="error">{errors[field]}</p>}
    </div>;
  };

  const inputField = (field: "name" | "email") => <div className="field" key={field}>
    <label htmlFor={id(field)}>{labels[field]}</label>
    <input id={id(field)} name={field} type={field === "email" ? "email" : "text"} inputMode={field === "email" ? "email" : undefined} autoCapitalize={field === "email" ? "none" : undefined} autoComplete={field === "name" ? "name" : mode === "login" ? "username" : "email"} required readOnly={busy} value={fields[field]} aria-invalid={!!errors[field]} aria-describedby={errors[field] ? `${id(field)}-error` : undefined} onChange={event => change(field, event.target.value)} onBlur={event => blur(field, event.relatedTarget)} />
    {errors[field] && <p className="error" id={`${id(field)}-error`}>{errors[field]}</p>}
  </div>;

  const resetDone = mode === "reset" && notice && !notice.error;
  return <form className={styles.form} noValidate onSubmit={submit} aria-busy={busy}>
    <h2>{mode === "login" ? "Быстрый старт" : mode === "register" ? "Создать аккаунт" : mode === "recovery" ? "Восстановить доступ" : "Новый пароль"}</h2>
    {mode === "login" && googleEnabled && <>
      <IconTooltip label="Продолжить через Google"><button type="button" className={`button ${styles.provider}`} aria-label="Продолжить через Google" disabled={busy} onClick={googleLogin}><img src="/assets/google.png" width="20" height="20" alt="" /></button></IconTooltip>
      <p className={styles.divider}>или по электронной почте</p>
    </>}
    {mode === "recovery" && <p className={styles.description}>Укажите почту аккаунта. Мы отправим ссылку для установки нового пароля.</p>}
    {errorEntries.length > 1 && <div ref={summary} tabIndex={-1} className="error-summary"><strong>Проверьте поля</strong><ul>{errorEntries.map(([field, message]) => <li key={field}><a href={`#${id(field)}`} onClick={event => { event.preventDefault(); document.getElementById(id(field))?.focus(); }}>{message}</a></li>)}</ul></div>}
    {notice && <div className={`${styles.notice} ${notice.error ? styles.noticeError : mode === "reset" ? styles.savedToast : ""}`} role={notice.error ? "alert" : "status"}>{notice.error ? <WarningCircle size={20} aria-hidden="true" /> : <CheckCircle size={20} aria-hidden="true" />}<p>{notice.text}</p></div>}
    {!resetDone && <>
      {visibleFields.filter(field => field !== "timezone").map(field => field === "password" || field === "repeat" ? passwordField(field) : inputField(field as "name" | "email"))}
      {mode === "register" && <div className="field">
        {detected ? <p className={styles.zone}>Часовой пояс: {timezoneLabel(fields.timezone)}. Определён автоматически.</p> : <>
          <label htmlFor={id("timezone")}>Часовой пояс</label>
          <small id="register-timezone-help">Не удалось определить часовой пояс. Выберите его из списка.</small>
          <select id={id("timezone")} name="timezone" required disabled={busy} value={fields.timezone} onChange={event => change("timezone", event.target.value)} aria-invalid={!!errors.timezone} aria-describedby={`register-timezone-help register-timezone-value${errors.timezone ? " register-timezone-error" : ""}`}>
            <option value="">Выберите часовой пояс</option>{zones.map(zone => <option key={zone.value} value={zone.value}>{zone.label}</option>)}
          </select>
          <small id="register-timezone-value">{fields.timezone ? timezoneLabel(fields.timezone) : "Часовой пояс не выбран"}</small>
        </>}
        {errors.timezone && <p className="error" id="register-timezone-error">{errors.timezone}</p>}
      </div>}
      <button type="submit" disabled={busy} className={`button button-primary ${styles.submit}`}>{busy ? "Проверяем…" : mode === "login" ? "Войти" : mode === "register" ? "Создать аккаунт" : mode === "recovery" ? "Отправить ссылку" : "Сохранить пароль"}</button>
    </>}
    {mode === "login" ? <div className={styles.secondaryActions}>
      <button className={styles.linkButton} type="button" onClick={goRecovery}>Не помню пароль</button>
      <button className={styles.linkButton} type="button" disabled={busy} onClick={resend}>Повторить письмо подтверждения</button>
    </div> : (mode === "recovery" || mode === "reset") && <button className={styles.back} type="button" onClick={goLogin}><ArrowLeft size={18} aria-hidden="true" />Вернуться ко входу</button>}
    {mode === "recovery" && <p className={styles.description}>Если входили через сервис без email, войдите тем же способом.</p>}
  </form>;
}

export function AuthScreen({ initialMode, verified, invalid, googleEnabled, oauthError }: { initialMode: Mode; verified: boolean; invalid: boolean; googleEnabled: boolean; oauthError: boolean }) {
  const [pointerFocus, setPointerFocus] = useState(false);
  const [mode, setMode] = useState<Mode>(initialMode);
  const loginTab = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const goLogin = () => { returnFocus.current = true; setMode("login"); window.history.replaceState(null, "", "/app/auth"); };
  const goRecovery = () => { setMode("recovery"); };
  useEffect(() => {
    if (mode === "recovery") document.getElementById("recovery-email")?.focus();
    if (returnFocus.current && mode === "login") { returnFocus.current = false; loginTab.current?.focus(); }
  }, [mode]);
  const standard = mode === "login" || mode === "register";
  const modes: Mode[] = standard ? ["login", "register"] : [mode];
  return <div className={styles.screen} data-pointer={pointerFocus} onPointerDownCapture={() => setPointerFocus(true)} onKeyDownCapture={() => setPointerFocus(false)}>
    <a className="skip-link" href="#auth-main">К форме входа</a>
    <header className={styles.header}><span className={styles.brandLabel}>YETI STREAM</span><ThemeChoices /></header>
    <main id="auth-main" className={styles.main}>
      <div className={styles.brand}><Logo /></div>
      <h1 className="sr-only">Вход в YETI STREAM</h1>
      <section className={styles.card} aria-label="Доступ к аккаунту">
        {oauthError && <p className={`${styles.banner} ${styles.noticeError}`} role="alert"><WarningCircle size={20} aria-hidden="true" />Не удалось войти через Google. Попробуйте ещё раз или войдите по email.</p>}
        {verified && <p className={styles.banner}><CheckCircle size={20} aria-hidden="true" />Почта подтверждена. Теперь можно войти.</p>}
        {invalid && <p className={`${styles.banner} ${styles.noticeError}`}><WarningCircle size={20} aria-hidden="true" />Ссылка недействительна или уже использована. Запросите новую.</p>}
        <Tabs.Root value={mode} onValueChange={value => setMode(value as Mode)}>
          <Tabs.List className={styles.tabs} aria-label="Доступ к аккаунту">
            {modes.map(value => <Tabs.Trigger key={value} ref={value === "login" ? loginTab : undefined} className={styles.tab} value={value}>
              {value === "login" ? <SignIn size={20} aria-hidden="true" /> : value === "register" ? <UserPlus size={20} aria-hidden="true" /> : value === "recovery" ? <EnvelopeSimple size={20} aria-hidden="true" /> : <Key size={20} aria-hidden="true" />}
              <span>{value === "login" ? "Вход" : value === "register" ? "Регистрация" : value === "recovery" ? "Восстановление" : "Новый пароль"}</span>
            </Tabs.Trigger>)}
          </Tabs.List>
          <div className={styles.panels}>{modes.map(value => <Tabs.Content key={value} forceMount value={value} className={styles.panel} inert={mode !== value} aria-hidden={mode !== value} tabIndex={-1}>
            <AccessForm mode={value} active={mode === value} goLogin={goLogin} goRecovery={goRecovery} googleEnabled={googleEnabled} />
          </Tabs.Content>)}</div>
        </Tabs.Root>
      </section>
    </main>
  </div>;
}
