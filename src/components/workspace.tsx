"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import * as Tabs from "@radix-ui/react-tabs";
import {
  ArrowLeft, CaretUpDown, CheckCircle, Flask, Gear, Globe,
  List, SignOut, SquaresFour, UserCircle, Wallet, WarningCircle, X,
} from "@phosphor-icons/react";
import { authClient } from "@/lib/auth-client";
import { NAME_MAX, nameError as validateName } from "@/lib/validation";
import { timezoneLabel, timezoneOptions as getTimezoneOptions } from "@/lib/timezones";
import { IconTooltip, Logo, ThemeChoices } from "@/components/ui";
import { GoogleAccess } from "@/components/google-access";
import styles from "./workspace.module.css";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  timezone: string;
  createdAt: string;
};

type View = "one" | "two" | "settings" | "payment";
const views: View[] = ["one", "two", "settings", "payment"];
const labels: Record<View, string> = {
  one: "Тестовая 1", two: "Тестовая 2", settings: "Настройки", payment: "Оплата",
};
function readView(value: string | null): View {
  return views.includes(value as View) ? value as View : "one";
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => [...part][0]).join("").toLocaleUpperCase("ru");
}

function formatCreatedAt(value: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat("ru", {
      dateStyle: "long", timeStyle: "short", timeZone: timezone,
    }).format(new Date(value));
  } catch { return "Не удалось отобразить дату"; }
}

export function Workspace({ user, providers, googleEnabled, yandexEnabled }: { user: CurrentUser; providers: string[]; googleEnabled: boolean; yandexEnabled: boolean }) {
  const [pointerFocus, setPointerFocus] = useState(false);
  const session = authClient.useSession();
  const router = useRouter();
  const params = useSearchParams();
  const urlView = readView(params.get("tab"));
  const [view, setView] = useState<View>(urlView);
  const [profile, setProfile] = useState(user);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState<"sidebar" | "header" | "bottom" | null>(null);
  const [name, setName] = useState(user.name);
  const [timezone, setTimezone] = useState(user.timezone);
  const [nameError, setNameError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [logoutError, setLogoutError] = useState("");
  const [pending, setPending] = useState<"save" | "logout" | null>(null);
  const [toast, setToast] = useState("");
  const [zones, setZones] = useState<ReturnType<typeof getTimezoneOptions>>([]);
  const [localeReady, setLocaleReady] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const focusAfterNavigation = useRef(false);
  const skipMenuFocusRestore = useRef(false);
  const isAccount = view === "settings" || view === "payment";

  useEffect(() => { setProfile(user); }, [user]);
  useEffect(() => {
    setZones(getTimezoneOptions(profile.timezone));
    setLocaleReady(true);
  }, [profile.timezone]);
  useEffect(() => {
    if (!session.isPending && !session.data && !session.error) window.location.replace("/app/auth");
  }, [session.isPending, session.data, session.error]);
  useEffect(() => {
    if (view !== urlView) {
      focusAfterNavigation.current = true;
      setView(urlView);
    }
  }, [urlView]);
  useEffect(() => {
    document.title = `${labels[view]} — YETI STREAM`;
    if (focusAfterNavigation.current) {
      heading.current?.focus({ preventScroll: true });
      focusAfterNavigation.current = false;
    }
  }, [view]);
  useEffect(() => () => requestRef.current?.abort(), []);

  function navigate(next: View, focusContent = true) {
    focusAfterNavigation.current = focusContent;
    if (menuOpen) skipMenuFocusRestore.current = true;
    setView(next);
    setMenuOpen(null);
    setDrawerOpen(false);
    window.history.pushState(null, "", `/app?tab=${next}`);
    if (next === view && focusContent) heading.current?.focus({ preventScroll: true });
  }

  function handleLink(event: MouseEvent<HTMLAnchorElement>, next: View) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(next);
  }

  function handleMenuKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]"));
    const index = elements.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? elements.length - 1
      : event.key === "ArrowDown" ? (index + 1) % elements.length
      : (index - 1 + elements.length) % elements.length;
    event.preventDefault();
    elements[next]?.focus();
  }

  async function logout() {
    if (pending) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setPending("logout");
    setLogoutError("");
    try {
      const result = await authClient.signOut({ fetchOptions: { signal: controller.signal } });
      if (controller.signal.aborted) return;
      if (result.error) {
        setLogoutError("Не удалось выйти. Повторите попытку.");
        return;
      }
      window.location.replace("/app/auth");
    } catch {
      if (!controller.signal.aborted) setLogoutError("Не удалось связаться с сервером. Повторите выход.");
    } finally {
      if (!controller.signal.aborted) setPending(null);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const cleanName = name.trim();
    const validationError = validateName(name);
    if (validationError) {
      setNameError(validationError);
      nameInput.current?.focus();
      return;
    }
    setNameError("");
    setSaveError("");
    setToast("");
    setPending("save");
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const result = await authClient.updateUser({
        name: cleanName, timezone, fetchOptions: { signal: controller.signal },
      });
      if (controller.signal.aborted) return;
      if (result.error) {
        setSaveError(result.error.status === 401
          ? "Сессия завершилась. Войдите снова, чтобы сохранить изменения."
          : "Не удалось сохранить изменения. Проверьте данные и повторите попытку.");
        return;
      }
      setProfile((previous) => ({ ...previous, name: cleanName, timezone }));
      setName(cleanName);
      setToast("Изменения сохранены");
      router.refresh();
    } catch {
      if (!controller.signal.aborted) setSaveError("Ответ не получен. Обновите страницу, чтобы проверить сохранение.");
    } finally {
      if (!controller.signal.aborted) setPending(null);
    }
  }

  function resetSettings() {
    setName(profile.name);
    setTimezone(profile.timezone);
    setNameError("");
    setSaveError("");
  }

  const navigation = (onNavigate?: () => void) => (
    <nav className={styles.sectionNav} aria-label="Разделы приложения">
      {(["one", "two"] as const).map((item) => {
        const Icon = item === "one" ? SquaresFour : Flask;
        return <Link href={`/app?tab=${item}`} key={item} className={styles.navLink}
          aria-current={view === item ? "page" : undefined}
          onClick={(event) => { handleLink(event, item); onNavigate?.(); }}>
          <Icon size={20} weight="regular" aria-hidden="true" /><span>{labels[item]}</span>
        </Link>;
      })}
    </nav>
  );

  function accountMenu(position: "sidebar" | "header" | "bottom") {
    const isBottom = position === "bottom";
    return <Popover.Root open={menuOpen === position} onOpenChange={(open) => setMenuOpen(open ? position : null)}>
      <Popover.Trigger asChild>
        <button className={`${styles.accountTrigger} ${isBottom ? styles.moreTrigger : ""}`}
          aria-label={isBottom ? "Ещё: меню аккаунта" : `Меню аккаунта: ${profile.name}`}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault(); setMenuOpen(position);
            }
          }}>
          {isBottom ? <><List size={22} weight="regular" aria-hidden="true" /><span>Ещё</span></>
            : <><span className={styles.avatar} aria-hidden="true">{initials(profile.name)}</span>
              <span className={styles.triggerText}><strong>{profile.name}</strong><span>{profile.email}</span></span>
              <CaretUpDown size={18} weight="regular" aria-hidden="true" className={styles.triggerCaret} /></>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content aria-label="Аккаунт" className={styles.accountPopup} side={position === "header" ? "bottom" : "top"}
          align={position === "sidebar" ? "start" : "end"} sideOffset={8} collisionPadding={16}
          onKeyDown={handleMenuKeys}
          onFocusOutside={() => setMenuOpen(null)}
          onCloseAutoFocus={(event) => {
            if (skipMenuFocusRestore.current) {
              event.preventDefault();
              skipMenuFocusRestore.current = false;
            }
          }}>
          <div className={styles.popupIdentity}>
            <span className={styles.avatar} aria-hidden="true">{initials(profile.name)}</span>
            <div><strong>{profile.name}</strong><span>{profile.email}</span></div>
          </div>
          <div className={styles.themeRow}><ThemeChoices /></div>
          <nav className={styles.accountLinks} aria-label="Аккаунт">
            <Link href="/app?tab=settings" onClick={(event) => handleLink(event, "settings")}>
              <Gear size={20} weight="regular" aria-hidden="true" /><span>Настройки</span>
            </Link>
            <Link href="/app?tab=payment" onClick={(event) => handleLink(event, "payment")}>
              <Wallet size={20} weight="regular" aria-hidden="true" /><span>Оплата</span>
            </Link>
          </nav>
          <div className={styles.popupDivider} />
          <button className={styles.logout} onClick={logout} disabled={pending !== null} aria-busy={pending === "logout"}>
            <SignOut size={20} weight="regular" aria-hidden="true" /><span>{pending === "logout" ? "Выходим…" : "Выйти"}</span>
          </button>
          {logoutError && <p className={styles.errorMessage} role="alert"><WarningCircle size={20} aria-hidden="true" />{logoutError}</p>}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>;
  }

  return <div className={styles.shell} data-pointer={pointerFocus} onPointerDownCapture={() => setPointerFocus(true)} onKeyDownCapture={() => setPointerFocus(false)}>
    <a className={styles.skipLink} href="#workspace-main">К содержимому</a>
    <aside className={styles.sidebar} aria-label="Боковая панель">
      <Link href="/app" className={styles.brand} aria-label="YETI STREAM — личный кабинет"><Logo /></Link>
      <div className={styles.navCaption}>Рабочее пространство</div>
      {navigation()}
      <div className={styles.sidebarAccount}>{accountMenu("sidebar")}</div>
    </aside>

    <header className={styles.header}>
      <div className={styles.headerBrand}>
        <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
          <Dialog.Trigger asChild><button className={styles.menuButton} aria-label="Открыть меню разделов">
            <List size={24} weight="regular" aria-hidden="true" /><span>Меню</span>
          </button></Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className={styles.drawerOverlay} />
            <Dialog.Content className={styles.drawer} aria-describedby={undefined}>
              <div className={styles.drawerHeading}>
                <Dialog.Title>Разделы</Dialog.Title>
                <Dialog.Close asChild><button className={styles.iconButton} aria-label="Закрыть меню"><X size={22} aria-hidden="true" /></button></Dialog.Close>
              </div>
              {navigation(() => setDrawerOpen(false))}
              <div className={styles.drawerAccount}>
                <strong>{profile.name}</strong><span>{profile.email}</span>
                <Link href="/app?tab=settings" onClick={(event) => handleLink(event, "settings")}><Gear size={20} aria-hidden="true" />Настройки</Link>
                <Link href="/app?tab=payment" onClick={(event) => handleLink(event, "payment")}><Wallet size={20} aria-hidden="true" />Оплата</Link>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <Link href="/app" className={styles.mobileLogo} aria-label="YETI STREAM — личный кабинет"><Logo /></Link>
        <span className={styles.headerCaption}>Личный кабинет</span>
      </div>
      <div className={styles.headerAccount}>{accountMenu("header")}</div>
      <span className={styles.desktopHeaderStatus}><CheckCircle size={18} weight="regular" aria-hidden="true" />Вход выполнен</span>
    </header>

    <main className={styles.main} id="workspace-main" tabIndex={-1}>
      <div className={styles.pageIntro}>
        <div className={styles.eyebrow}>YETI STREAM</div>
        <h1 tabIndex={-1} ref={heading}>{isAccount ? "Аккаунт" : "Личный кабинет"}</h1>
        <p>{isAccount ? "Данные профиля и доступные действия." : `Здравствуйте, ${profile.name}. Выберите вкладку, чтобы посмотреть содержимое.`}</p>
      </div>

      <div className={styles.groups}>
        <section className={styles.group} data-visible={!isAccount} inert={isAccount} aria-hidden={isAccount}>
          <Tabs.Root value={view === "two" ? "two" : "one"} onValueChange={(next) => navigate(next as View, false)}>
            <Tabs.List className={styles.tabList} aria-label="Тестовые разделы">
              <Tabs.Trigger className={styles.tab} value="one"><SquaresFour size={20} weight="regular" aria-hidden="true" /><span>Тестовая 1</span></Tabs.Trigger>
              <Tabs.Trigger className={styles.tab} value="two"><Flask size={20} weight="regular" aria-hidden="true" /><span>Тестовая 2</span></Tabs.Trigger>
            </Tabs.List>
            <div className={styles.panels}>
              <Tabs.Content className={styles.panel} value="one" forceMount inert={view !== "one"} aria-hidden={view !== "one"}>
                <div className={styles.panelHeading}><UserCircle size={26} weight="regular" aria-hidden="true" /><h2>Ваш профиль</h2></div>
                <p className={styles.muted}>Сведения аккаунта, с которым выполнен вход.</p>
                <dl className={styles.profileData}>
                  <div><dt>Имя</dt><dd>{profile.name}</dd></div>
                  <div><dt>Электронная почта</dt><dd>{profile.email}</dd></div>
                  <div><dt>Подтверждение почты</dt><dd><span className={profile.emailVerified ? styles.successStatus : styles.neutralStatus}>
                    {profile.emailVerified ? <CheckCircle size={18} weight="regular" aria-hidden="true" /> : <WarningCircle size={18} weight="regular" aria-hidden="true" />}
                    {profile.emailVerified ? "Адрес подтверждён" : "Адрес не подтверждён"}
                  </span></dd></div>
                  <div><dt>Часовой пояс</dt><dd>{localeReady ? timezoneLabel(profile.timezone) : "Уточняем название часового пояса…"}</dd></div>
                  <div><dt>Аккаунт создан</dt><dd>{localeReady ? formatCreatedAt(profile.createdAt, profile.timezone) : "Загружаем дату…"}</dd></div>
                </dl>
                <Link href="/app?tab=settings" className={styles.secondaryButton} onClick={(event) => handleLink(event, "settings")}>
                  <Gear size={20} weight="regular" aria-hidden="true" />Открыть настройки
                </Link>
              </Tabs.Content>
              <Tabs.Content className={styles.panel} value="two" forceMount inert={view !== "two"} aria-hidden={view !== "two"}>
                <div className={styles.emptyState}>
                  <Flask size={40} weight="regular" aria-hidden="true" className={styles.emptyIcon} />
                  <h2>Вторая тестовая вкладка</h2>
                  <p>Здесь пока нет данных. Вкладка помогает проверить навигацию, оформление и работу кабинета на разных экранах.</p>
                  <Link href="/app?tab=one" className={styles.secondaryButton} onClick={(event) => handleLink(event, "one")}>
                    <ArrowLeft size={20} weight="regular" aria-hidden="true" />К профилю
                  </Link>
                </div>
              </Tabs.Content>
            </div>
          </Tabs.Root>
        </section>

        <section className={styles.group} data-visible={isAccount} inert={!isAccount} aria-hidden={!isAccount}>
          <Tabs.Root value={view === "payment" ? "payment" : "settings"} onValueChange={(next) => navigate(next as View, false)}>
            <Tabs.List className={styles.tabList} aria-label="Разделы аккаунта">
              <Tabs.Trigger className={styles.tab} value="settings"><Gear size={20} weight="regular" aria-hidden="true" /><span>Настройки</span></Tabs.Trigger>
              <Tabs.Trigger className={styles.tab} value="payment"><Wallet size={20} weight="regular" aria-hidden="true" /><span>Оплата</span></Tabs.Trigger>
            </Tabs.List>
            <div className={styles.panels}>
              <Tabs.Content className={styles.panel} value="settings" forceMount inert={view !== "settings"} aria-hidden={view !== "settings"}>
                <div className={styles.panelHeading}><Gear size={26} weight="regular" aria-hidden="true" /><h2>Настройки профиля</h2></div>
                <form onSubmit={saveSettings} noValidate className={styles.settingsForm} aria-busy={pending === "save"}>
                  <div className={styles.field}>
                    <label htmlFor="profile-name">Имя <span className={styles.optionalHint}>(обязательно)</span></label>
                    <input id="profile-name" name="name" autoComplete="name" value={name} ref={nameInput} required
                      aria-invalid={Boolean(nameError)} aria-describedby={`profile-name-hint${nameError ? " profile-name-error" : ""}`}
                      onChange={(event) => { setName(event.target.value); if (nameError) setNameError(validateName(event.target.value) || ""); }}
                      onBlur={() => setNameError(validateName(name) || "")} />
                    <p className={styles.fieldHint} id="profile-name-hint">До {NAME_MAX} символов.</p>
                    {nameError && <p className={styles.fieldError} id="profile-name-error">{nameError}</p>}
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="profile-email">Электронная почта</label>
                    <input id="profile-email" name="email" type="email" value={profile.email} autoComplete="email" readOnly aria-describedby="profile-email-hint" />
                    <p className={styles.fieldHint} id="profile-email-hint">Только чтение. Изменение адреса здесь недоступно.</p>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="profile-timezone">Часовой пояс <span className={styles.optionalHint}>(обязательно)</span></label>
                    <select id="profile-timezone" name="timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} required aria-describedby="profile-timezone-hint">
                      {!timezone && <option value="">Выберите часовой пояс</option>}
                      {zones.length ? zones.map(({ value, label }) => <option value={value} key={value}>{label}</option>)
                        : <option value={profile.timezone}>Уточняем название часового пояса…</option>}
                    </select>
                    <p className={styles.fieldHint} id="profile-timezone-hint"><Globe size={16} weight="regular" aria-hidden="true" />{localeReady ? timezoneLabel(timezone) : "Уточняем название часового пояса…"}</p>
                  </div>
                  {saveError && <div className={styles.errorMessage} role="alert"><WarningCircle size={20} weight="regular" aria-hidden="true" /><div>{saveError}<br /><Link href="/app/auth">Перейти ко входу</Link></div></div>}
                  <div className={styles.formActions}>
                    <button type="submit" className={styles.primaryButton} disabled={pending !== null}>{pending === "save" ? "Сохраняем…" : "Сохранить"}</button>
                    <button type="button" className={styles.secondaryButton} onClick={resetSettings} disabled={pending !== null}>Отмена</button>
                  </div>
                </form>
                <section className={styles.accessMethods} aria-labelledby="access-methods">
                  <h3 id="access-methods">Способы входа</h3>
                  <p className={styles.muted}>Подключённые способы открывают один аккаунт. Можно подключить сервис с другой почтой. Почта профиля сохранится.</p>
                  {params.get("oauthError") === "1" && <p className={styles.errorMessage} role="alert"><WarningCircle size={20} aria-hidden="true" />Не удалось подключить сервис. Повторите попытку. Если аккаунт сервиса уже подключён к другому аккаунту YETI STREAM, выберите другой.</p>}
                  <div className={styles.accessMethod}><strong>Email и пароль</strong><span className={providers.includes("credential") ? styles.successStatus : styles.neutralStatus}>{providers.includes("credential") ? <CheckCircle size={20} aria-hidden="true" /> : <SignOut size={20} aria-hidden="true" />}{providers.includes("credential") ? "Подключён" : "Пароль не задан"}</span>
                    {!providers.includes("credential") && <Link href="/app/auth" className={styles.secondaryButton}>Задать пароль через «Не помню пароль»</Link>}
                  </div>
                  {(googleEnabled || providers.includes("google")) && <div className={styles.accessMethod}><strong>Google</strong><span className={providers.includes("google") ? styles.successStatus : styles.neutralStatus}>{providers.includes("google") ? <CheckCircle size={20} aria-hidden="true" /> : <WarningCircle size={20} aria-hidden="true" />}{providers.includes("google") ? "Подключён" : "Не подключён"}</span>
                    {googleEnabled && !providers.includes("google") && <GoogleAccess linking active={view === "settings"} />}
                  </div>}
                  {(yandexEnabled || providers.includes("yandex")) && <div className={styles.accessMethod}><strong>Яндекс ID</strong><span className={providers.includes("yandex") ? styles.successStatus : styles.neutralStatus}>{providers.includes("yandex") ? <CheckCircle size={20} aria-hidden="true" /> : <WarningCircle size={20} aria-hidden="true" />}{providers.includes("yandex") ? "Подключён" : "Не подключён"}</span>
                    {yandexEnabled && !providers.includes("yandex") && <GoogleAccess provider="yandex" linking active={view === "settings"} />}
                  </div>}
                </section>
              </Tabs.Content>
              <Tabs.Content className={styles.panel} value="payment" forceMount inert={view !== "payment"} aria-hidden={view !== "payment"}>
                <div className={styles.emptyState}>
                  <Wallet size={40} weight="regular" aria-hidden="true" className={styles.emptyIcon} />
                  <h2>Оплата пока недоступна</h2>
                  <p>Пополнение и история операций появятся после подключения оплаты. Сейчас платёжные действия недоступны.</p>
                  <Link href="/app?tab=settings" className={styles.secondaryButton} onClick={(event) => handleLink(event, "settings")}>
                    <Gear size={20} weight="regular" aria-hidden="true" />Открыть настройки
                  </Link>
                </div>
              </Tabs.Content>
            </div>
          </Tabs.Root>
        </section>
      </div>
    </main>

    <nav className={styles.bottomNav} aria-label="Основные разделы">
      <Link href="/app?tab=one" aria-current={view === "one" ? "page" : undefined} onClick={(event) => handleLink(event, "one")}>
        <SquaresFour size={22} weight="regular" aria-hidden="true" /><span>Тестовая 1</span>
      </Link>
      <Link href="/app?tab=two" aria-current={view === "two" ? "page" : undefined} onClick={(event) => handleLink(event, "two")}>
        <Flask size={22} weight="regular" aria-hidden="true" /><span>Тестовая 2</span>
      </Link>
      {accountMenu("bottom")}
    </nav>

    <div className={styles.toastRegion} role="status" aria-live="polite" aria-atomic="true">
      {toast && <div className={styles.toast}>
        <CheckCircle size={22} weight="regular" aria-hidden="true" /><span>{toast}</span>
        <IconTooltip label="Закрыть уведомление"><button className={styles.iconButton} aria-label="Закрыть уведомление" onClick={() => setToast("")}><X size={20} weight="regular" aria-hidden="true" /></button></IconTooltip>
      </div>}
    </div>
  </div>;
}
