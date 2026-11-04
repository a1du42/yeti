"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { DotsThree, List, SlidersHorizontal, Users, X } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { focusPopupOnOpen, Logo, ThemeChoices } from "@/components/ui";
import styles from "./admin.module.css";

const sections = [
  { key: "general", title: "Общие", href: "/admin", Icon: SlidersHorizontal },
  { key: "users", title: "Пользователи", href: "/admin?section=users", Icon: Users },
] as const;
type Section = (typeof sections)[number]["key"];

export function AdminShell({ section, children }: { section: Section; children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const [more, setMore] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const previous = useRef(section);
  useEffect(() => {
    if (previous.current === section) return;
    previous.current = section;
    setDrawer(false);
    heading.current?.focus();
  }, [section]);
  useEffect(() => {
    const tablet = matchMedia("(min-width: 768px) and (max-width: 1023px)");
    const mobile = matchMedia("(max-width: 767px)");
    const sync = () => {
      if (!tablet.matches) setDrawer(false);
      if (!mobile.matches) setMore(false);
    };
    tablet.addEventListener("change", sync);
    mobile.addEventListener("change", sync);
    return () => { tablet.removeEventListener("change", sync); mobile.removeEventListener("change", sync); };
  }, []);
  const links = sections.map(({ key, href, title, Icon }) => <Link key={key} href={href}
    aria-current={section === key ? "page" : undefined} onNavigate={() => setDrawer(false)}>
    <Icon size={20} aria-hidden="true" /><span>{title}</span>
  </Link>);
  const closeFallback = (event: Event, visible: string) => {
    if (!matchMedia(visible).matches) { event.preventDefault(); heading.current?.focus(); }
  };
  return <div className={styles.shell}>
    <a href="#admin-content" className="skip-link">Перейти к содержимому</a>
    <aside className={styles.sidebar}>
      <Logo />
      <nav className={styles.sectionNav} aria-label="Разделы управления">{links}</nav>
      <ThemeChoices />
    </aside>
    <div className={styles.compactHeader}>
      <Logo mark />
      <span>Управление</span>
      <Dialog.Root open={drawer} onOpenChange={setDrawer}>
        <Dialog.Trigger className={`button ${styles.menuTrigger}`}><List size={20} aria-hidden="true" />Меню</Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content className={`${styles.dialog} ${styles.drawer}`} tabIndex={-1} data-popup-focus aria-describedby={undefined}
            onOpenAutoFocus={focusPopupOnOpen} onCloseAutoFocus={event => closeFallback(event, "(min-width: 768px) and (max-width: 1023px)")}>
            <div className={styles.dialogHeader}>
              <Dialog.Title>Разделы управления</Dialog.Title>
              <Dialog.Close className={`button ${styles.iconButton}`} aria-label="Закрыть меню"><X size={20} aria-hidden="true" /></Dialog.Close>
            </div>
            <nav className={styles.sectionNav} aria-label="Разделы управления">{links}</nav>
            <ThemeChoices />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
    <main className={styles.page} id="admin-content" aria-labelledby="admin-heading">
      <header className={styles.header}>
        <p>Управление</p>
        <h1 ref={heading} id="admin-heading" tabIndex={-1}>{sections.find(item => item.key === section)?.title}</h1>
        <p>{section === "general" ? "Настройки, которые действуют на весь каталог." : "Поиск аккаунтов, доступные балансы и история корректировок."}</p>
      </header>
      {children}
    </main>
    <nav className={styles.bottomNav} aria-label="Разделы управления">
      {links}
      <Dialog.Root open={more} onOpenChange={setMore}>
        <Dialog.Trigger><DotsThree size={20} aria-hidden="true" /><span>Ещё</span></Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content className={styles.dialog} tabIndex={-1} data-popup-focus aria-describedby={undefined}
            onOpenAutoFocus={focusPopupOnOpen} onCloseAutoFocus={event => closeFallback(event, "(max-width: 767px)")}>
            <div className={styles.dialogHeader}>
              <Dialog.Title>Оформление</Dialog.Title>
              <Dialog.Close className={`button ${styles.iconButton}`} aria-label="Закрыть оформление"><X size={20} aria-hidden="true" /></Dialog.Close>
            </div>
            <ThemeChoices />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </nav>
  </div>;
}
