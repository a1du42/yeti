"use server";

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { balanceAdjustment, launchOrder, payment, pricingSettings, session as authSession, user, userAdminEvent, verification } from "@/db/schema";
import { adminSession } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { usdCents } from "@/lib/money";
import { readPricing } from "@/lib/pricing";
import { spendableBalance } from "@/lib/streamskill-orders";
import { isTimezone, nameError } from "@/lib/validation";

async function accountBalance(userId: string) {
  return getDb().transaction(async tx => {
    const [account] = await tx.select({
      id: user.id,
      name: user.name,
      email: user.email,
      balanceCents: spendableBalance(userId).mapWith(Number),
    }).from(user).where(eq(user.id, userId));
    if (!account) return null;
    const history = await tx.select({ id: balanceAdjustment.id, deltaCents: balanceAdjustment.deltaCents,
      reason: balanceAdjustment.reason, createdAt: balanceAdjustment.createdAt }).from(balanceAdjustment)
      .where(eq(balanceAdjustment.userId, userId))
      .orderBy(desc(balanceAdjustment.createdAt), desc(balanceAdjustment.id)).limit(20);
    return { ...account, history };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export type Account = NonNullable<Awaited<ReturnType<typeof accountBalance>>>;
const directoryFields = { id: user.id, name: user.name, email: user.email, timezone: user.timezone, blocked: user.blocked, updatedAt: user.updatedAt };
type DirectoryProfile = Pick<typeof user.$inferSelect, keyof typeof directoryFields>;
export type AccountRow = DirectoryProfile & { balanceCents: number; protectedAccount: boolean };
export type UserFilters = { name: string; email: string; id: string };
export type UserPage = { rows: AccountRow[]; filters: UserFilters; hasNext: boolean; hasPrevious: boolean };
export type UserSearchState = { page?: UserPage; error?: string };
export type AdjustmentState =
  | { error: string; field?: "amount" | "reason"; account?: Account; uncertain?: boolean }
  | { account: Account; requestKey: string }
  | null;

const filtersSchema = z.object({ name: z.string().trim().max(128), email: z.string().trim().max(254), id: z.string().trim().max(128) });
const idSchema = z.string().min(1).max(128);
const noAccess = "Нет доступа. Войдите в аккаунт администратора.";
const userPageSize = 25;
const contains = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;

export async function searchUsers(_state: UserSearchState, data: FormData | undefined): Promise<UserSearchState> {
  const actor = await adminSession();
  if (!actor) return { error: noAccess };
  const fields = data?.get("clear") === "1" ? undefined : data;
  const filters = filtersSchema.safeParse({ name: fields?.get("name") ?? "", email: fields?.get("email") ?? "", id: fields?.get("id") ?? "" });
  const move = z.enum(["first", "previous", "next"]).safeParse(data?.get("move") ?? "first");
  const cursor = idSchema.safeParse(data?.get("cursor"));
  if (!filters.success || !move.success || (move.data !== "first" && !cursor.success)) return { error: "Проверьте поля поиска." };
  const { name, email, id } = filters.data;
  const previous = move.data === "previous";
  try {
    const db = getDb();
    const matched = db.select(directoryFields).from(user).where(and(
      name ? sql`${user.name} ilike ${contains(name)}` : undefined,
      email ? sql`${user.email} ilike ${contains(email)}` : undefined,
      id ? eq(user.id, id) : undefined,
      move.data !== "first" && cursor.success ? (previous ? lt(user.id, cursor.data) : gt(user.id, cursor.data)) : undefined,
    )).orderBy(previous ? desc(user.id) : asc(user.id)).limit(userPageSize + 1).as("matched_users");
    const found = await db.select({ id: matched.id, name: matched.name, email: matched.email,
      timezone: matched.timezone, blocked: matched.blocked, updatedAt: matched.updatedAt,
      balanceCents: spendableBalance(sql`"matched_users"."id"`).mapWith(Number),
    }).from(matched).orderBy(previous ? desc(matched.id) : asc(matched.id));
    const more = found.length > userPageSize;
    const rows = found.slice(0, userPageSize).map(row => ({
      ...row, protectedAccount: row.id === actor.user.id || row.email.toLowerCase() === getServerEnv().ADMIN_EMAIL?.toLowerCase(),
    }));
    if (previous) rows.reverse();
    return { page: { rows, filters: filters.data, hasNext: previous || more, hasPrevious: previous ? more : move.data === "next" } };
  } catch {
    return { error: "Не удалось загрузить пользователей. Повторите поиск." };
  }
}

export async function readAdjustment(userId: string): Promise<NonNullable<AdjustmentState>> {
  if (!(await adminSession())) return { error: noAccess };
  if (!idSchema.safeParse(userId).success) return { error: "Пользователь не найден." };
  try {
    const account = await accountBalance(userId);
    return account ? { account, requestKey: randomUUID() } : { error: "Пользователь не найден." };
  } catch {
    return { error: "Не удалось загрузить баланс. Повторите попытку." };
  }
}

async function mutationSession() {
  const session = await adminSession();
  return session && (await headers()).get("origin") === new URL(getServerEnv().BETTER_AUTH_URL).origin ? session : null;
}

const accountAction = z.enum(["edit", "block", "unblock", "delete"]);
export type AccountAction = z.infer<typeof accountAction>;
export type AccountChange = { action: Exclude<AccountAction, "delete">; account: DirectoryProfile }
  | { action: "delete"; id: string };
export type AccountMutation = { error: string; field?: "name" | "timezone"; latest?: DirectoryProfile }
  | { change: AccountChange } | null;

export async function manageAccount(_state: AccountMutation, data: FormData): Promise<AccountMutation> {
  const actor = await mutationSession();
  if (!actor) return { error: noAccess };
  const action = accountAction.safeParse(data.get("intent"));
  const id = idSchema.safeParse(data.get("userId"));
  const version = z.iso.datetime().safeParse(data.get("version"));
  if (!action.success || !id.success || !version.success) return { error: "Откройте действия пользователя заново." };
  const intent = action.data;
  const userId = id.data;
  const name = data.get("name");
  const timezone = data.get("timezone");
  let edit: { name: string; timezone: string } | undefined;
  if (intent === "edit") {
    if (typeof name !== "string") return { error: "Введите имя.", field: "name" };
    const error = nameError(name);
    if (error) return { error, field: "name" };
    if (typeof timezone !== "string" || (timezone !== "" && !isTimezone(timezone))) {
      return { error: "Выберите часовой пояс из списка.", field: "timezone" };
    }
    edit = { name: name.trim(), timezone };
  }

  try {
    return await getDb().transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
      const [target] = await tx.select(directoryFields).from(user).where(eq(user.id, userId)).for("update");
      if (!target) {
        if (intent === "delete") {
          const [done] = await tx.select({ id: userAdminEvent.id }).from(userAdminEvent).where(and(
            eq(userAdminEvent.userId, userId), eq(userAdminEvent.adminId, actor.user.id), eq(userAdminEvent.action, "delete"),
          )).limit(1);
          if (done) return { change: { action: "delete", id: userId } };
        }
        return { error: "Пользователь не найден." };
      }
      if (intent !== "edit" && (target.id === actor.user.id || target.email.toLowerCase() === getServerEnv().ADMIN_EMAIL?.toLowerCase())) {
        return { error: "Нельзя изменить доступ аккаунта администратора." };
      }
      if (intent === "edit" && edit?.name === target.name && edit.timezone === target.timezone) {
        return { change: { action: intent, account: target } };
      }
      if ((intent === "block" || intent === "unblock") && target.blocked === (intent === "block")) {
        return { change: { action: intent, account: target } };
      }
      if (target.updatedAt.toISOString() !== version.data) {
        return { error: "Профиль уже изменился. Проверьте актуальные данные и повторите действие.", latest: target };
      }
      const event = { id: randomUUID(), userId, adminId: actor.user.id, action: intent };
      if (intent === "delete") {
        const { rows: [history] } = await tx.execute<{ hasHistory: boolean }>(sql`
          select (exists (select 1 from ${payment} where ${payment.userId} = ${userId})
            or exists (select 1 from ${launchOrder} where ${launchOrder.userId} = ${userId})
            or exists (select 1 from ${balanceAdjustment} where ${balanceAdjustment.userId} = ${userId})) as "hasHistory"
        `);
        if (history.hasHistory) return { error: "У пользователя есть платежи, запуски или корректировки баланса. Чтобы закрыть доступ, заблокируйте аккаунт." };
        await tx.delete(verification).where(eq(verification.value, userId));
        await tx.delete(user).where(eq(user.id, userId));
        await tx.insert(userAdminEvent).values(event);
        return { change: { action: "delete", id: userId } };
      }
      const [updated] = await tx.update(user).set({
        ...(edit ?? { blocked: intent === "block" }),
        updatedAt: new Date(Math.max(Date.now(), target.updatedAt.getTime() + 1)),
      }).where(eq(user.id, userId)).returning(directoryFields);
      if (intent === "block") await tx.delete(authSession).where(eq(authSession.userId, userId));
      await tx.insert(userAdminEvent).values(event);
      return { change: { action: intent, account: updated } };
    });
  } catch {
    return { error: "Не удалось подтвердить действие. Повторите попытку." };
  }
}

export type PricingState = { settings?: Awaited<ReturnType<typeof readPricing>>; error?: string; invalid?: boolean; saved?: boolean };

export async function savePricing(_state: PricingState, data: FormData): Promise<PricingState> {
  const session = await mutationSession();
  if (!session) return { error: noAccess };
  const raw = data.get("factor");
  const match = typeof raw === "string" && /^(\d{0,3})(?:[.,](\d{1,2}))?$/.exec(raw.trim());
  const factor = match ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0")) : 0;
  if (factor < 1 || factor > 10_000) return { error: "Введите коэффициент от 0,01 до 100, до двух знаков после запятой.", invalid: true };
  const revision = z.string().regex(/^\d{1,10}$/).transform(Number).pipe(z.int().max(2_147_483_647)).safeParse(data.get("revision"));
  if (!revision.success) return { error: "Обновите страницу перед сохранением." };
  try {
    const [settings] = await getDb().update(pricingSettings).set({ factor, revision: sql`${pricingSettings.revision} + 1`, updatedBy: session.user.id, updatedAt: new Date() })
      .where(and(eq(pricingSettings.id, 1), eq(pricingSettings.revision, revision.data)))
      .returning({ factor: pricingSettings.factor, revision: pricingSettings.revision });
    if (settings) return { settings, saved: true };
    return { settings: await readPricing(), error: "Коэффициент уже изменился. Проверьте текущее значение и повторите сохранение." };
  } catch {
    return { error: "Не удалось подтвердить сохранение. Повторите попытку." };
  }
}

export async function adjustBalance(_state: AdjustmentState, data: FormData): Promise<AdjustmentState> {
  const session = await mutationSession();
  if (!session) return { error: noAccess };
  const requestKey = z.uuid().safeParse(data.get("requestKey"));
  const userId = idSchema.safeParse(data.get("userId"));
  const direction = z.enum(["credit", "debit"]).safeParse(data.get("direction"));
  const expected = z.string().regex(/^-?\d{1,16}$/).transform(Number).pipe(z.int()).safeParse(data.get("expected"));
  if (!requestKey.success || !userId.success || !direction.success || !expected.success) return { error: "Откройте изменение баланса заново." };

  const rawAmount = data.get("amount");
  const amountCents = typeof rawAmount === "string" && /^\d{1,8}(?:[.,]\d{1,2})?$/.test(rawAmount.trim())
    ? usdCents(rawAmount.trim().replace(",", ".")) : null;
  if (!amountCents || amountCents > 2_147_483_647) {
    return { error: "Введите сумму от 0,01 до 21 474 836,47 USD, до двух знаков после запятой.", field: "amount" };
  }
  const reason = z.string().trim().min(1).max(300).safeParse(data.get("reason"));
  if (!reason.success) return { error: "Укажите причину длиной до 300 символов.", field: "reason" };

  const values = {
    id: requestKey.data, userId: userId.data, adminId: session.user.id,
    deltaCents: direction.data === "credit" ? amountCents : -amountCents, reason: reason.data,
  };
  try {
    const error = await getDb().transaction(async tx => {
      // The same account lock serializes adjustments and order reservations.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${values.userId}))`);
      const [existing] = await tx.select().from(balanceAdjustment).where(eq(balanceAdjustment.id, values.id));
      if (existing) {
        return existing.userId === values.userId && existing.adminId === values.adminId
          && existing.deltaCents === values.deltaCents && existing.reason === values.reason
          ? null : "Эта корректировка уже сохранена с другими параметрами. Повторите поиск пользователя.";
      }
      const [target] = await tx.select({ cents: spendableBalance(values.userId).mapWith(Number) })
        .from(user).where(eq(user.id, values.userId));
      if (!target) return "Пользователь не найден.";
      if (target.cents !== expected.data) return "changed";
      if (values.deltaCents < 0 && target.cents < amountCents) return "На доступном балансе недостаточно средств.";
      await tx.insert(balanceAdjustment).values(values);
      return null;
    });
    if (error === "changed") {
      const account = await accountBalance(values.userId);
      return { error: "Баланс изменился. Проверьте новый остаток перед подтверждением.", account: account ?? undefined };
    }
    if (error) return { error };
    const account = await accountBalance(values.userId);
    if (account) return { account, requestKey: randomUUID() };
  } catch {
    // The request key stays in the form so an uncertain outcome can be retried.
  }
  return { error: "Не удалось подтвердить результат. Повторите отправку с теми же данными.", uncertain: true };
}
