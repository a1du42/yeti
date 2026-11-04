"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { CaretLeft, CaretRight, CheckCircle, CircleNotch, DotsThree, Lock, LockOpen, MagnifyingGlass, PencilSimple, Trash, Wallet, WarningCircle, X } from "@phosphor-icons/react";
import { startTransition, useActionState, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { focusPopupOnOpen, IconTooltip } from "@/components/ui";
import { formatUsd, usdCents } from "@/lib/money";
import { adjustBalance, readAdjustment, searchUsers, type Account, type AccountAction, type AccountChange, type AccountRow, type AdjustmentState, type UserFilters, type UserSearchState } from "./actions";
import { AccountForm, accountActionLabel } from "./account-form";
import styles from "./admin.module.css";

const emptyFilters: UserFilters = { name: "", email: "", id: "" };
const filterFields = [
  { key: "name", label: "Имя", max: 128 },
  { key: "email", label: "Email", max: 254 },
  { key: "id", label: "ID пользователя", max: 128 },
] as const;

export function BalanceAdmin({ initial }: { initial: UserSearchState }) {
  const [state, search, searching] = useActionState(searchUsers, initial);
  const [previous, setPrevious] = useState(initial.page);
  const [filters, setFilters] = useState(initial.page?.filters ?? emptyFilters);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [changes, setChanges] = useState<Record<string, Extract<AccountChange, { account: unknown }>["account"]>>({});
  const [receipt, setReceipt] = useState<{ text: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const page = state.page ?? previous;
  const rows = page?.rows ?? [];

  useEffect(() => {
    if (state.page) { setPrevious(state.page); setFilters(state.page.filters); setBalances({}); setChanges({}); }
  }, [state.page]);
  useEffect(() => {
    if (!receipt) return;
    const timeout = window.setTimeout(() => setReceipt(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [receipt]);

  const onSaved = useCallback((account: Account) => {
    setBalances(values => ({ ...values, [account.id]: account.balanceCents }));
    setReceipt({ text: "Баланс обновлён" });
  }, []);

  function onManaged(change: AccountChange) {
    const labels = { edit: "Профиль изменён", block: "Пользователь заблокирован", unblock: "Пользователь разблокирован", delete: "Пользователь удалён" };
    setReceipt({ text: labels[change.action] });
    if (change.action !== "delete") setChanges(values => ({ ...values, [change.account.id]: change.account }));
    if (change.action === "delete" || (change.action === "edit" && page?.filters.name)) {
      heading.current?.focus({ preventScroll: true });
      const form = new FormData();
      for (const [key, value] of Object.entries(page?.filters ?? emptyFilters)) form.set(key, value);
      startTransition(() => search(form));
    }
  }

  return <section className={styles.panel} aria-labelledby="directory-heading" aria-busy={searching}>
    <div className={styles.sectionHeading}>
      <h2 id="directory-heading" ref={heading} tabIndex={-1}>Список пользователей</h2>
      <p className={styles.secondary}>Заполните любое поле. Если указано несколько полей, должны совпасть все.</p>
    </div>
    <form action={search} className={styles.filters} autoComplete="off">
      {filterFields.map(({ key, label, max }) => <div className="field" key={key}>
        <label htmlFor={`filter-${key}`}>{label}</label>
        <input id={`filter-${key}`} name={key} maxLength={max} value={filters[key]} readOnly={searching}
          onChange={event => setFilters(values => ({ ...values, [key]: event.target.value }))} />
      </div>)}
      <div className={styles.filterButtons}>
        <IconTooltip label="Найти пользователей" toggleOnClick={false}>
          <button className={`button button-primary ${styles.iconButton}`} disabled={searching} aria-label="Найти пользователей">
            {searching ? <CircleNotch size={20} aria-hidden="true" /> : <MagnifyingGlass size={20} aria-hidden="true" />}
          </button>
        </IconTooltip>
        <IconTooltip label="Сбросить фильтры" toggleOnClick={false}>
          <button className={`button ${styles.iconButton}`} disabled={searching || !Object.values(filters).some(Boolean) && !Object.values(page?.filters ?? {}).some(Boolean)}
            aria-label="Сбросить фильтры" name="clear" value="1"><X size={20} aria-hidden="true" /></button>
        </IconTooltip>
      </div>
    </form>
    {state.error && <p className={`error status-line ${styles.feedback}`} role="alert"><WarningCircle size={20} aria-hidden="true" />
      <span>{state.error}{previous && " Ниже — результат предыдущей загрузки."}</span>
    </p>}
    <p className={`sr-only`} role="status">{searching ? "Ищем пользователей…" : page ? `Строк на странице: ${rows.length}.` : ""}</p>
    {rows.length ? <table className={styles.table}>
      <caption className="sr-only">Пользователи и доступные балансы</caption>
      <thead><tr><th scope="col">Имя</th><th scope="col" className={styles.emailColumn}>Email</th><th scope="col" className={styles.idColumn}>ID</th>
        <th scope="col" className={styles.number}>Баланс</th><th scope="col" className={styles.actions}>Действия</th></tr></thead>
      <tbody>{rows.map(row => {
        const account = { ...row, ...changes[row.id] };
        return <tr key={account.id}>
        <th scope="row"><span>{account.name}</span><span className={`${styles.secondary} ${styles.inlineEmail}`}>{account.email}</span>
          {account.blocked && <span className={styles.blocked}><Lock size={16} aria-hidden="true" />Заблокирован</span>}
        </th>
        <td className={styles.emailColumn}>{account.email}</td>
        <td className={`${styles.idColumn} ${styles.secondary}`}>{account.id}</td>
        <td className={styles.number}>{formatUsd(balances[account.id] ?? account.balanceCents)}</td>
        <td className={styles.actions}><AccountDialog account={account} onSaved={onSaved} onManaged={onManaged} disabled={searching} /></td>
      </tr>; })}</tbody>
    </table> : page && <div className={styles.empty}>
      <MagnifyingGlass size={24} aria-hidden="true" />
      <p>{Object.values(page.filters).some(Boolean) ? "Совпадений нет. Измените или сбросьте фильтры." : "На этой странице нет пользователей."}</p>
    </div>}
    {page && (page.hasNext || page.hasPrevious) && rows.length > 0 && <div className={styles.pagination}>
      <span className={styles.secondary}>Показано: {rows.length}</span>
      <form action={search}>
        {Object.entries(page.filters).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
        <input type="hidden" name="cursor" value={rows[0].id} />
        <IconTooltip label="Предыдущая страница" toggleOnClick={false}>
          <button className={`button ${styles.iconButton}`} name="move" value="previous" disabled={!page.hasPrevious || searching}
            aria-label="Предыдущая страница"><CaretLeft size={20} aria-hidden="true" /></button>
        </IconTooltip>
      </form>
      <form action={search}>
        {Object.entries(page.filters).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
        <input type="hidden" name="cursor" value={rows.at(-1)?.id} />
        <IconTooltip label="Следующая страница" toggleOnClick={false}>
          <button className={`button ${styles.iconButton}`} name="move" value="next" disabled={!page.hasNext || searching}
            aria-label="Следующая страница"><CaretRight size={20} aria-hidden="true" /></button>
        </IconTooltip>
      </form>
    </div>}
    <div role="status">{receipt && <p className={styles.toast}><CheckCircle size={20} aria-hidden="true" />{receipt.text}</p>}</div>
  </section>;
}

type Loaded = Extract<AdjustmentState, { requestKey: string }>;

type AccountView = "actions" | "balance" | AccountAction;

function AccountDialog({ account, onSaved, onManaged, disabled }: {
  account: AccountRow;
  onSaved: (account: Account) => void;
  onManaged: (change: AccountChange) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [changed, setChanged] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [success, setSuccess] = useState<Account | null>(null);
  const [view, setView] = useState<AccountView>("actions");
  const title = useRef<HTMLHeadingElement>(null);
  const previousView = useRef(view);
  const change = useRef<AccountChange | null>(null);
  useLayoutEffect(() => {
    if (open && previousView.current !== view) title.current?.focus({ preventScroll: true });
    previousView.current = view;
  }, [open, view]);
  const onChange = useCallback((dirty: boolean) => {
    setChanged(dirty);
    if (!dirty) setConfirmClose(false);
  }, []);
  const reportSaved = useCallback((result: Account) => { setSuccess(result); onSaved(result); }, [onSaved]);
  const reportManaged = useCallback((result: AccountChange) => {
    change.current = result;
    setOpen(false);
  }, []);

  function close() {
    if (pending) return;
    if (changed && !confirmClose) { setConfirmClose(true); return; }
    setOpen(false);
  }

  function openView(next: AccountView) {
    if (pending) return;
    setView(next);
    setChanged(false);
    setConfirmClose(false);
  }

  const accessView = account.blocked ? "unblock" : "block";
  const AccessIcon = account.blocked ? LockOpen : Lock;
  return <Dialog.Root open={open} onOpenChange={next => {
    if (next) {
      change.current = null;
      previousView.current = "actions";
      setView("actions");
      setConfirmClose(false);
      setChanged(false);
      setSuccess(null);
      setOpen(true);
    }
    else close();
  }}>
    <IconTooltip label="Действия пользователя" toggleOnClick={false}>
      <Dialog.Trigger className={`button ${styles.iconButton}`} disabled={disabled}
        aria-label={`Действия пользователя: ${account.name}, ${account.email}`}><DotsThree size={22} aria-hidden="true" /></Dialog.Trigger>
    </IconTooltip>
    <Dialog.Portal>
      <Dialog.Overlay className={styles.overlay} />
      <Dialog.Content className={styles.dialog} tabIndex={-1} data-popup-focus onOpenAutoFocus={focusPopupOnOpen}
        onCloseAutoFocus={event => {
          const result = change.current;
          if (!result) return;
          change.current = null;
          if (result.action === "delete") event.preventDefault();
          onManaged(result);
        }}
        onInteractOutside={event => event.preventDefault()}>
        <div className={styles.dialogHeader}>
          <Dialog.Title ref={title} tabIndex={-1} data-popup-focus>
            {view === "actions" ? "Действия пользователя" : view === "balance" ? "Изменить баланс" : accountActionLabel[view]}
          </Dialog.Title>
          <Dialog.Close className={`button ${styles.iconButton}`} disabled={pending} aria-label="Закрыть диалог"><X size={20} aria-hidden="true" /></Dialog.Close>
        </div>
        <Dialog.Description className={styles.accountDetails}>
          <strong>{account.name}</strong><span>{account.email}</span><span className={styles.secondary}>ID: {account.id}</span>
        </Dialog.Description>
        {confirmClose && <p className={`error status-line`} role="alert"><WarningCircle size={20} aria-hidden="true" />
          Повторите действие, чтобы выйти без сохранения, или сохраните изменения.</p>}
        {open && view === "actions" && <div className={styles.accountActions}>
          <button className="button" onClick={() => openView("edit")}><PencilSimple size={20} aria-hidden="true" />Изменить профиль</button>
          <button className="button" onClick={() => openView("balance")}><Wallet size={20} aria-hidden="true" />Изменить баланс</button>
          {!account.protectedAccount && <>
            <button className="button" onClick={() => openView(accessView)}><AccessIcon size={20} aria-hidden="true" />{accountActionLabel[accessView]}</button>
            <button className={`button ${styles.dangerText}`} onClick={() => openView("delete")}><Trash size={20} aria-hidden="true" />Удалить пользователя</button>
          </>}
        </div>}
        {open && view === "balance" && <AdjustmentLoader id={account.id} onPending={setPending} onChange={onChange} onSaved={reportSaved} />}
        {open && view !== "actions" && view !== "balance" && <AccountForm key={view}
          intent={view} account={account} onPending={setPending} onChange={onChange} onSaved={reportManaged} />}
        {open && view !== "actions" && <div>
          <button className="button" disabled={pending} onClick={() => {
            if (changed && !confirmClose) { setConfirmClose(true); return; }
            openView("actions");
          }}>К действиям</button>
        </div>}
        <div role="status" className="sr-only">{success && `Баланс обновлён: ${formatUsd(success.balanceCents)}.`}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

type AdjustmentProps = {
  onPending: (pending: boolean) => void;
  onChange: (dirty: boolean) => void;
  onSaved: (account: Account) => void;
};

function AdjustmentLoader({ id, ...props }: { id: string } & AdjustmentProps) {
  const [attempt, retry] = useState(0);
  const [result, setResult] = useState<Awaited<ReturnType<typeof readAdjustment>> | null>(null);
  useEffect(() => {
    let current = true;
    void readAdjustment(id).then(value => { if (current) setResult(value); })
      .catch(() => { if (current) setResult({ error: "Не удалось загрузить баланс. Повторите попытку." }); });
    return () => { current = false; };
  }, [id, attempt]);

  if (!result) return <p className="status-line" role="status"><CircleNotch size={20} aria-hidden="true" />Загружаем баланс…</p>;
  if ("error" in result) return <div className={styles.form}>
    <p className="error status-line" role="alert"><WarningCircle size={20} aria-hidden="true" />{result.error}</p>
    <div><button className="button" onClick={() => { setResult(null); retry(value => value + 1); }}>Повторить</button></div>
  </div>;
  return <Adjustment initial={result} {...props} />;
}

function Adjustment({ initial, onPending, onChange, onSaved }: { initial: Loaded } & AdjustmentProps) {
  const [state, submit, pending] = useActionState(adjustBalance, null);
  const [confirmed, setConfirmed] = useState(initial);
  const [direction, setDirection] = useState("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const error = state && "error" in state ? state : null;
  const account = state?.account ?? confirmed.account;
  const requestKey = state && "requestKey" in state ? state.requestKey : confirmed.requestKey;
  const cents = /^\d{1,8}(?:[.,]\d{1,2})?$/.test(amount.trim()) ? usdCents(amount.trim().replace(",", ".")) : null;
  const delta = cents && cents <= 2_147_483_647 ? (direction === "credit" ? cents : -cents) : null;
  const amountError = error?.field === "amount" ? error.error : amount && delta === null
    ? "Введите сумму от 0,01 до 21 474 836,47 USD, до двух знаков после запятой." : undefined;
  const insufficient = delta !== null && delta < 0 && -delta > account.balanceCents;
  const editable = !pending && !error?.uncertain;

  useEffect(() => { onPending(pending); }, [onPending, pending]);
  useEffect(() => {
    if (!state) return;
    if ("requestKey" in state) {
      setConfirmed(state);
      setAmount("");
      setReason("");
      onChange(false);
      onSaved(state.account);
    } else if (state.account) {
      const latest = state.account;
      setConfirmed(previous => ({ ...previous, account: latest }));
    }
  }, [state, onChange, onSaved]);

  return <>
    <form action={submit} className={styles.form} aria-busy={pending}
      onChange={() => onChange(true)}>
      <input type="hidden" name="userId" value={account.id} />
      <input type="hidden" name="requestKey" value={requestKey} />
      <input type="hidden" name="expected" value={account.balanceCents} />
      <div className={styles.adjustmentFields}>
        <div className="field">
          <label htmlFor="adjust-direction">Операция</label>
          {!editable && <input type="hidden" name="direction" value={direction} />}
          <select id="adjust-direction" name={editable ? "direction" : undefined} value={direction} disabled={!editable}
            onChange={event => setDirection(event.target.value)}>
            <option value="credit">Прибавить</option><option value="debit">Списать</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="adjust-amount">Сумма, USD</label>
          <input id="adjust-amount" name="amount" inputMode="decimal" required maxLength={11} readOnly={!editable}
            value={amount} onChange={event => setAmount(event.target.value)}
            aria-invalid={!!amountError || undefined} aria-describedby={amountError ? "amount-error" : undefined} />
          {amountError && <p id="amount-error" className="error" role="alert">{amountError}</p>}
        </div>
      </div>
      <div className="field">
        <label htmlFor="adjust-reason">Причина корректировки</label>
        <textarea id="adjust-reason" name="reason" required maxLength={300} rows={2} readOnly={!editable}
          value={reason} onChange={event => setReason(event.target.value)}
          aria-invalid={error?.field === "reason" || undefined} aria-describedby={error?.field === "reason" ? "reason-error" : undefined} />
        {error?.field === "reason" && <p id="reason-error" className="error" role="alert">{error.error}</p>}
      </div>
      <dl className={styles.preview}>
        <div><dt>Доступный баланс</dt><dd>{formatUsd(account.balanceCents)}</dd></div>
        <div><dt>После корректировки</dt><dd>{delta === null || insufficient ? "—" : formatUsd(account.balanceCents + delta)}</dd></div>
      </dl>
      {insufficient && <p className="error" role="alert">На доступном балансе недостаточно средств.</p>}
      {error && !error.field && <p className="error" role="alert">{error.error}</p>}
      <div><button className="button button-primary" disabled={pending || delta === null || !reason.trim() || insufficient}>
        {pending ? "Сохраняем…" : error?.uncertain ? "Повторить отправку" : direction === "credit" ? "Прибавить к балансу" : "Списать с баланса"}
      </button></div>
    </form>
    <details className={styles.history}>
      <summary>Последние корректировки</summary>
      {account.history.length ? <table className={`${styles.table} ${styles.historyTable}`}>
        <caption className="sr-only">Последние корректировки баланса</caption>
        <thead><tr><th scope="col">Дата и причина</th><th scope="col" className={styles.number}>Сумма</th></tr></thead>
        <tbody>{account.history.map(entry => <tr key={entry.id}>
          <td><time className={styles.secondary} dateTime={entry.createdAt.toISOString()}>
            {entry.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
          </time><p>{entry.reason}</p></td>
          <td className={styles.number}>{entry.deltaCents > 0 ? "+" : "−"}{formatUsd(Math.abs(entry.deltaCents))}</td>
        </tr>)}</tbody>
      </table> : <p className={styles.secondary}>Корректировок пока нет.</p>}
    </details>
  </>;
}
