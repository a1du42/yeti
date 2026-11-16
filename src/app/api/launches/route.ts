import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, lte, notInArray, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { launchOrder, rateLimit } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { canChangeDemoRegion, canPauseDemoLaunch, finishedProviderStatuses, followerControl, followerInterval, launchRegions, launchStatuses, nextFollowerEstimate, nextTimedOrderClock, type LaunchOrder } from "@/lib/launch-orders";
import { launchHoursMax, launchQuantityMax, launchQuote, matchesLaunchTarget, liveOrderQuantityMax } from "@/lib/launch-catalog";
import { changeStreamSkillFollowers, commandStreamSkillPurchase, readLaunchCatalog, readStreamSkillPurchase, streamSkillLiveEnabled } from "@/lib/streamskill";
import { readPricing } from "@/lib/pricing";
import { checkPendingFollowerStarts, refreshProviderOrders, reserveAndSendLaunch } from "@/lib/streamskill-orders";
import { readLaunchSource } from "@/lib/launch-source";
import { readLaunchThumbnail } from "@/lib/launch-recent";
import { isTwitchViewerPackage, twitchViewerSettings, viewerChatSettings, viewerSettingsError } from "@/lib/twitch-viewer-settings";
import { changeStreamSkillViewerChat, changeStreamSkillViewers, readStreamSkillViewerChat, readStreamSkillViewerSettings } from "@/lib/streamskill";

export const runtime = "nodejs";
const pageSize = 24;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (error: string, status: number) => json({ error }, status);
const intervalInput = z.number().int().min(followerInterval.min).max(followerInterval.max);
const launchInput = z.object({
  requestKey: z.uuid(),
  launchToken: z.string().min(1).max(12_288),
  service: z.string().min(1).max(48),
  quantity: z.number().int().min(1).max(launchQuantityMax),
  hours: z.number().int().min(1).max(launchHoursMax).nullable(),
  quotedCents: z.number().int().nonnegative().optional(),
  interval: intervalInput.optional(),
  floating: z.boolean().optional(),
}).strict();

async function verifiedUser(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  return session?.user.emailVerified ? session.user.id : null;
}

function serialize({ id, service, platform, kind, url, title, thumbnail, quantity, hours, amountCents, createdAt, endsAt, pausedAt, region, providerStatus, followerIntervalSeconds, followerFloatingInterval, followerEstimate, followerStartCheckAt }: typeof launchOrder.$inferSelect): LaunchOrder {
  return { id, service, platform, kind, url, title, thumbnail: readLaunchThumbnail(thumbnail), quantity, hours, amountCents, createdAt: createdAt.toISOString(), endsAt: endsAt.toISOString(), pausedAt: pausedAt?.toISOString() ?? null, region, providerStatus, followerIntervalSeconds, followerFloatingInterval, followerEstimate, followerPreparing: followerStartCheckAt !== null };
}

export async function GET(request: Request) {
  try {
    const userId = await verifiedUser(request);
    if (!userId) return fail("Сессия завершилась. Войдите снова.", 401);
    const db = getDb();
    const params = new URL(request.url).searchParams;
    const chatOrderId = params.get("chatOrder");
    const settingsOrderId = chatOrderId ?? params.get("viewerOrder");
    if (settingsOrderId !== null) {
      if (!z.uuid().safeParse(settingsOrderId).success) return fail("Некорректный запрос.", 400);
      const [order] = await db.select().from(launchOrder)
        .where(and(eq(launchOrder.id, settingsOrderId), eq(launchOrder.userId, userId))).limit(1);
      if (!order) return fail("Запуск не найден.", 404);
      if (!streamSkillLiveEnabled() || !order.providerId || !isTwitchViewerPackage(order.service) ||
        !followerControl(order.providerStatus)) {
        return chatOrderId === null ? fail("Настройки зрителей недоступны.", 409) : json({ started: null });
      }
      if (chatOrderId === null) return json({ viewers: await readStreamSkillViewerSettings(order.providerId) });
      if (order.providerStatus === "stopped") return json({ started: null });
      const chat = await readStreamSkillViewerChat(order.providerId);
      return json({
        started: chat?.started ?? null,
        messages: chat?.messages ?? null,
        interval: chat?.interval,
        mode: chat?.mode === "random" ? 0 : chat?.mode === "sequential" ? 1 : undefined,
      });
    }
    const cursorId = params.get("before");
    const status = z.enum(launchStatuses).nullable().safeParse(params.get("status"));
    if (!status.success) return fail("Не удалось открыть этот список запусков.", 400);
    if (cursorId && !z.uuid().safeParse(cursorId).success) return fail("Не удалось открыть эту страницу запусков.", 400);
    await Promise.all([
      refreshProviderOrders(userId),
      streamSkillLiveEnabled() ? checkPendingFollowerStarts(userId).catch(() => console.warn("streamskill_follower_check_failed")) : undefined,
    ]);
    const [cursor] = cursorId ? await db.select({ createdAt: launchOrder.createdAt }).from(launchOrder)
      .where(and(eq(launchOrder.userId, userId), eq(launchOrder.id, cursorId))).limit(1) : [];
    if (cursorId && !cursor) return fail("Не удалось открыть эту страницу запусков.", 400);
    const now = new Date();
    const statusFilter = status.data === "active" ? or(notInArray(launchOrder.providerStatus, finishedProviderStatuses),
      and(isNull(launchOrder.providerStatus), or(isNotNull(launchOrder.pausedAt), gt(launchOrder.endsAt, now))))
      : status.data === "completed" ? or(inArray(launchOrder.providerStatus, finishedProviderStatuses),
        and(isNull(launchOrder.providerStatus), isNull(launchOrder.pausedAt), lte(launchOrder.endsAt, now))) : undefined;
    const rows = await db.select().from(launchOrder)
      .where(and(eq(launchOrder.userId, userId), statusFilter, cursor && cursorId ? or(
        lt(launchOrder.createdAt, cursor.createdAt),
        and(eq(launchOrder.createdAt, cursor.createdAt), lt(launchOrder.id, cursorId)),
      ) : undefined))
      .orderBy(desc(launchOrder.createdAt), desc(launchOrder.id)).limit(pageSize + 1);
    const orders = rows.slice(0, pageSize).map(serialize);
    return json({ orders, next: rows.length > pageSize ? orders.at(-1)!.id : null, now: now.getTime() });
  } catch {
    console.error("launch_list_failed");
    return fail("Не удалось загрузить запуски. Повторите попытку.", 503);
  }
}

async function readInput<T>(request: Request, schema: z.ZodType<T>) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16_384) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const result = schema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    return result.success ? result.data : null;
  } catch { return null; } finally { reader.releaseLock(); }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(getServerEnv().BETTER_AUTH_URL).origin) {
      return fail("Обновите страницу и повторите попытку.", 403);
    }
    const userId = await verifiedUser(request);
    if (!userId) return fail("Сессия завершилась. Войдите снова.", 401);
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return fail("Некорректный запрос.", 415);
    const input = await readInput(request, launchInput);
    if (!input) {
      return fail("Проверьте параметры запуска.", 400);
    }
    const db = getDb();
    const sameRequest = and(eq(launchOrder.userId, userId), eq(launchOrder.requestKey, input.requestKey));
    const [existing] = await db.select().from(launchOrder).where(sameRequest).limit(1);
    if (existing) return json({ order: serialize(existing), now: Date.now() });
    const [catalog, pricing] = await Promise.all([readLaunchCatalog(), readPricing()]);
    const service = catalog.find(entry => entry.id === input.service);
    if (!service) return fail("Эта услуга сейчас недоступна. Откройте каталог снова.", 422);
    const quote = launchQuote(service, input.quantity, input.hours, pricing.factor);
    if (!quote) return fail("Проверьте количество и длительность запуска.", 400);
    const live = streamSkillLiveEnabled();
    if (live && input.quantity > liveOrderQuantityMax) {
      return fail("Через YETI STREAM можно заказать до 10 000 за один раз.", 400);
    }
    if ((input.interval !== undefined || input.floating !== undefined) && (!live || service.id !== "twitch-followers")) {
      return fail("Для этой услуги настройка интервала недоступна.", 422);
    }
    if (input.floating !== undefined && input.interval === undefined) return fail("Укажите интервал между подписками.", 400);
    if ((live || input.quotedCents !== undefined) && input.quotedCents !== quote.amountCents) {
      return fail("Цена изменилась. Проверьте новую сумму перед запуском.", 409);
    }
    const source = await readLaunchSource(userId, input.launchToken);
    if (!source) return fail("Сведения о ссылке устарели. Откройте ссылку снова, чтобы запустить услугу.", 422);
    if (!matchesLaunchTarget(service, source)) return fail("Эта услуга не подходит для выбранной ссылки.", 422);
    const now = Date.now();
    const key = `launches:${userId}`;
    const [limit] = await db.insert(rateLimit).values({ id: key, key, count: 1, lastRequest: now })
      .onConflictDoUpdate({ target: rateLimit.key, set: {
        count: sql`case when ${rateLimit.lastRequest} < ${now - 60_000} then 1 else ${rateLimit.count} + 1 end`,
        lastRequest: sql`case when ${rateLimit.lastRequest} < ${now - 60_000} then ${now} else ${rateLimit.lastRequest} end`,
      } }).returning({ count: rateLimit.count });
    if (limit.count > 20) return fail("Слишком много запусков. Повторите через минуту.", 429);
    const values = {
      id: randomUUID(), userId, requestKey: input.requestKey,
      service: service.id, platform: source.platform, kind: source.kind, url: source.url, title: source.title,
      thumbnail: source.thumbnail,
      quantity: input.quantity, hours: quote.hours, amountCents: quote.amountCents,
      followerIntervalSeconds: input.interval,
      createdAt: new Date(now), endsAt: new Date(now + quote.minutes * 60_000),
    };
    if (live) {
      const result = await reserveAndSendLaunch(values, {
        service, quantity: input.quantity, hours: input.hours, reference: values.id,
        target: source.id,
        interval: input.interval,
      }, pricing.factor, input.floating);
      if (result.kind === "accessDenied") return fail("Сессия завершилась. Войдите снова.", 401);
      if (result.kind === "priceChanged") return fail("Цена изменилась. Проверьте новую сумму перед запуском.", 409);
      if (result.kind === "insufficient") return fail("Недостаточно средств на балансе YETI STREAM. Пополните баланс и повторите.", 402);
      return json({ order: serialize(result.row), now: Date.now() }, result.kind === "existing" ? 200 : 201);
    }
    const [created] = await db.insert(launchOrder).values(values).onConflictDoNothing({ target: [launchOrder.userId, launchOrder.requestKey] }).returning();
    const order = created ?? (await db.select().from(launchOrder).where(sameRequest).limit(1))[0];
    if (!order) throw new Error("Launch order not found");
    return json({ order: serialize(order), now: Date.now() }, created ? 201 : 200);
  } catch {
    console.error("launch_create_failed");
    return fail("Не удалось подтвердить запуск. Повторите попытку.", 503);
  }
}

const launchChange = z.union([
  z.strictObject({ id: z.uuid(), paused: z.boolean() }),
  z.strictObject({ id: z.uuid(), region: z.enum(launchRegions) }),
  z.strictObject({ id: z.uuid(), followerAction: z.enum(["start", "stop"]) }),
  z.strictObject({ id: z.uuid(), interval: intervalInput, floating: z.boolean() }),
  z.strictObject({ id: z.uuid(), viewerAction: z.enum(["start", "stop"]) }),
  z.strictObject({ id: z.uuid(), viewers: twitchViewerSettings }),
  z.strictObject({ id: z.uuid(), viewerChat: viewerChatSettings }),
  z.strictObject({ id: z.uuid(), viewerChatAction: z.enum(["start", "stop"]) }),
]);

export async function PATCH(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(getServerEnv().BETTER_AUTH_URL).origin) return fail("Обновите страницу и повторите попытку.", 403);
    const userId = await verifiedUser(request);
    if (!userId) return fail("Сессия завершилась. Войдите снова.", 401);
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return fail("Некорректный запрос.", 415);
    const input = await readInput(request, launchChange);
    if (!input) return fail("Проверьте выбранное действие.", 400);
    return await getDb().transaction(async tx => {
      const ownOrder = and(eq(launchOrder.id, input.id), eq(launchOrder.userId, userId));
      const [order] = await tx.select().from(launchOrder).where(ownOrder).for("update");
      const now = Date.now();
      if (!order) return fail("Запуск не найден.", 404);
      if ("viewers" in input || "viewerAction" in input || "viewerChat" in input || "viewerChatAction" in input) {
        const action = followerControl(order.providerStatus);
        if (!streamSkillLiveEnabled() || !isTwitchViewerPackage(order.service) || !order.providerId || !action ||
          ("viewerAction" in input && (order.service !== "twitch-viewers-hour" || input.viewerAction !== action))) {
          return fail("Действие недоступно для текущего статуса заказа. Обновите список запусков.", 409);
        }
        if ("viewerChat" in input || "viewerChatAction" in input) {
          if (order.providerStatus === "stopped") return fail("Запустите заказ, чтобы управлять чатом.", 409);
          const result = await changeStreamSkillViewerChat(order.providerId, "viewerChat" in input ? input.viewerChat : input.viewerChatAction);
          if (result === "unconfirmed") {
            return fail("Не удалось подтвердить состояние чата. Проверьте его перед повтором.", 503);
          }
          if (!result) {
            return fail("Настройки чата недоступны для этого заказа или не приняты. Проверьте параметры и статус.", 409);
          }
          return json({ order: serialize(order), now: Date.now() });
        }
        if ("viewerAction" in input) {
          const outcome = await commandStreamSkillPurchase(order.providerId, input.viewerAction).catch(() => "unknown" as const);
          const acknowledgedAt = Date.now();
          const snapshot = await readStreamSkillPurchase(order.providerId).catch(() => null);
          const stopped = input.viewerAction === "stop" && outcome === "accepted" &&
            (!snapshot || followerControl(snapshot.status) === "stop");
          // A successful stop freezes the timer even when the first read still shows the old status.
          const status = stopped ? "stopped" : snapshot?.status;
          if (status && status !== order.providerStatus) {
            const clockAt = input.viewerAction === "stop" && outcome === "accepted" ? acknowledgedAt : Date.now();
            const [updated] = await tx.update(launchOrder).set({
              providerStatus: status,
              ...nextTimedOrderClock(order, status, clockAt),
            }).where(ownOrder).returning();
            if (followerControl(status) !== action) return json({ order: serialize(updated), now: Date.now() });
          }
          return outcome === "rejected" ? fail("Команда недоступна. Проверьте статус заказа.", 409)
            : fail("Новый статус пока не подтверждён. Обновите список запусков перед повтором.", 503);
        }
        const error = viewerSettingsError(input.viewers, order.quantity);
        if (error) return fail(error, 422);
        if (!await changeStreamSkillViewers(order.providerId, input.viewers)) {
          return fail("Не удалось применить настройки. Проверьте параметры и статус заказа.", 409);
        }
        const { channel, stream_views, uniq_viewers } = input.viewers;
        const url = channel ? `https://www.twitch.tv/${channel.toLowerCase()}` : order.url;
        const [updated] = url === order.url ? [order] : await tx.update(launchOrder)
          .set({ url, title: null, thumbnail: null }).where(ownOrder).returning();
        if (stream_views !== undefined || uniq_viewers !== undefined) {
          const current = await readStreamSkillViewerSettings(order.providerId).catch(() => null);
          if (!current ||
            (stream_views !== undefined && Number(current.stream_views) !== stream_views) ||
            (uniq_viewers !== undefined && Number(current.uniq_viewers) !== uniq_viewers)) {
            return fail("Не удалось подтвердить сохранение множителей. Откройте настройки заново, чтобы проверить текущие значения.", 503);
          }
        }
        return json({ order: serialize(updated), now: Date.now() });
      }
      if ("followerAction" in input || "interval" in input) {
        const action = followerControl(order.providerStatus);
        if (!streamSkillLiveEnabled() || order.service !== "twitch-followers" || !order.providerId ||
          !action || ("followerAction" in input && input.followerAction !== action)) {
          return fail("Действие недоступно для текущего статуса заказа. Обновите список запусков.", 409);
        }
        if ("followerAction" in input) {
          await tx.update(launchOrder).set({ followerStartCheckAt: null }).where(ownOrder);
          const outcome = await commandStreamSkillPurchase(order.providerId, input.followerAction).catch(() => "unknown" as const);
          const purchase = await readStreamSkillPurchase(order.providerId).catch(() => null);
          if (purchase && (purchase.status !== order.providerStatus || purchase.progress?.total === order.quantity)) {
            const [updated] = await tx.update(launchOrder).set({
              providerStatus: purchase.status,
              followerEstimate: nextFollowerEstimate(order, purchase.status, Date.now(), undefined, purchase.progress),
            }).where(ownOrder).returning();
            if (followerControl(purchase.status) !== input.followerAction) {
              return json({ order: serialize(updated), now: Date.now() });
            }
          }
          if (outcome === "rejected") {
            return fail("Не удалось выполнить команду. Проверьте статус заказа в списке запусков.", 409);
          }
          return fail("Новый статус заказа пока не подтверждён. Обновите список запусков перед повтором.", 503);
        }
        if (!await changeStreamSkillFollowers(order.providerId, input)) {
          return fail("Не удалось применить изменение. Проверьте статус заказа в списке запусков.", 409);
        }
        const [updated] = await tx.update(launchOrder).set({
          followerIntervalSeconds: input.interval, followerFloatingInterval: input.floating,
          followerEstimate: nextFollowerEstimate(order, order.followerStartCheckAt ? null : order.providerStatus, Date.now(), input.interval),
        }).where(ownOrder).returning();
        return json({ order: serialize(updated), now: Date.now() });
      }
      if (order.providerStatus) return fail("Это действие пока недоступно для этого заказа.", 422);
      if ("region" in input ? !canChangeDemoRegion(order.service) : !canPauseDemoLaunch(order.service)) {
        return fail("Для этой услуги действие недоступно.", 422);
      }
      if (!order.pausedAt && order.endsAt.getTime() <= now) return fail("Запуск уже завершён.", 409);
      const change = "region" in input ? { region: input.region }
        : input.paused && !order.pausedAt ? { pausedAt: new Date(now) }
        : !input.paused && order.pausedAt ? { pausedAt: null, endsAt: new Date(now + order.endsAt.getTime() - order.pausedAt.getTime()) }
        : null;
      const [updated] = change ? await tx.update(launchOrder).set(change).where(ownOrder).returning() : [order];
      return json({ order: serialize(updated), now });
    });
  } catch {
    console.error("launch_change_failed");
    return fail("Не удалось сохранить изменение. Повторите попытку.", 503);
  }
}
