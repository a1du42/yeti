"use client";

import { useActionState, useEffect, useState } from "react";
import { timezoneOptions } from "@/lib/timezones";
import { NAME_MAX } from "@/lib/validation";
import { manageAccount, type AccountAction, type AccountChange, type AccountRow } from "./actions";
import styles from "./admin.module.css";

export const accountActionLabel = {
  edit: "Изменить профиль",
  block: "Заблокировать пользователя",
  unblock: "Разблокировать пользователя",
  delete: "Удалить пользователя",
};

const consequences = {
  block: "Текущие сеансы завершатся. Пользователь сможет снова войти после разблокировки.",
  unblock: "Пользователь снова сможет войти в аккаунт.",
  delete: "Профиль, способы входа и недавние ссылки будут удалены. Действие необратимо. Аккаунт с платежами, запусками или корректировками баланса можно заблокировать.",
};

export function AccountForm({ intent, account, onPending, onChange, onSaved }: {
  intent: AccountAction;
  account: AccountRow;
  onPending: (pending: boolean) => void;
  onChange: (dirty: boolean) => void;
  onSaved: (change: AccountChange) => void;
}) {
  const [state, submit, pending] = useActionState(manageAccount, null);
  const [name, setName] = useState(account.name);
  const [timezone, setTimezone] = useState(account.timezone);
  const [current, setCurrent] = useState(account);
  const editing = intent === "edit";
  const [zones] = useState(() => editing ? timezoneOptions(account.timezone) : []);
  const error = state && "error" in state ? state : null;
  const latest = error?.latest ?? current;
  const dirty = name !== latest.name || timezone !== latest.timezone;

  useEffect(() => { onPending(pending); }, [pending, onPending]);
  useEffect(() => {
    if (state && "change" in state) onSaved(state.change);
    if (error?.latest) setCurrent(previous => ({ ...previous, ...error.latest }));
  }, [state, error, onSaved]);
  useEffect(() => { onChange(editing && dirty); }, [dirty, editing, onChange]);

  return <form action={submit} className={styles.form} aria-busy={pending}>
    <input type="hidden" name="intent" value={intent} />
    <input type="hidden" name="userId" value={account.id} />
    <input type="hidden" name="version" value={latest.updatedAt.toISOString()} />
    {editing ? <>
      <div className="field">
        <label htmlFor="admin-profile-name">Имя</label>
        <input id="admin-profile-name" name="name" value={name} required readOnly={pending} maxLength={NAME_MAX * 2}
          onChange={event => setName(event.target.value)}
          aria-invalid={error?.field === "name" || undefined} aria-describedby={error?.field === "name" ? "admin-name-error" : undefined} />
        {error?.field === "name" && <p className="error" id="admin-name-error" role="alert">{error.error}</p>}
      </div>
      <div className="field">
        <label htmlFor="admin-profile-zone">Часовой пояс</label>
        <select id="admin-profile-zone" name="timezone" value={timezone} disabled={pending}
          onChange={event => setTimezone(event.target.value)}
          aria-invalid={error?.field === "timezone" || undefined} aria-describedby={error?.field === "timezone" ? "admin-zone-error" : undefined}>
          <option value="">Не указан</option>
          {zones.map(zone => <option key={zone.value} value={zone.value}>{zone.label}</option>)}
        </select>
        {error?.field === "timezone" && <p className="error" id="admin-zone-error" role="alert">{error.error}</p>}
      </div>
    </> : <p>{consequences[intent]}</p>}
    {error && !error.field && <div role="alert" className={styles.form}>
      <p className="error">{error.error}</p>
      {error.latest && <p className={styles.secondary}>Текущее имя — {latest.name}. Часовой пояс — {latest.timezone || "не указан"}.</p>}
    </div>}
    <div>
      <button className={`button ${intent === "delete" ? styles.dangerButton : "button-primary"}`}
        disabled={pending || (editing && (!dirty || !name.trim()))}>
        {pending ? "Сохраняем…" : editing ? "Сохранить" : accountActionLabel[intent]}
      </button>
    </div>
  </form>;
}
