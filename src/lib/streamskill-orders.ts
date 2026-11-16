import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, notInArray, sql } from "drizzle-orm";
import { balanceAdjustment, launchOrder, paymentCredit, pricingSettings, user } from "@/db/schema";
import { getDb } from "./db";
import { finishedProviderStatuses, followerControl, nextFollowerEstimate, nextTimedOrderClock } from "./launch-orders";
import { changeStreamSkillFollowers, commandStreamSkillPurchase, createStreamSkillPurchase, readStreamSkillPurchase, readStreamSkillPurchases } from "./streamskill";

const released = ["rejected", "refunded"] as const;
const followerStartDelayMs = 5_000;
const followerStartGraceMs = 120_000;
export const spendableBalance = (userId: string | ReturnType<typeof sql>) => sql<string>`
  (select coalesce(sum(${paymentCredit.amountCents}), 0) from ${paymentCredit} where ${paymentCredit.userId} = ${userId})
  +
  (select coalesce(sum(${balanceAdjustment.deltaCents}), 0) from ${balanceAdjustment} where ${balanceAdjustment.userId} = ${userId})
  -
  (select coalesce(sum(${launchOrder.amountCents}), 0) from ${launchOrder}
    where ${launchOrder.userId} = ${userId} and ${notInArray(launchOrder.providerStatus, [...released])})
`;

export async function reserveAndSendLaunch(
  values: typeof launchOrder.$inferInsert,
  purchase: Parameters<typeof createStreamSkillPurchase>[0],
  priceFactor: number,
  floating?: boolean,
) {
  const db = getDb();
  const request = and(eq(launchOrder.userId, values.userId), eq(launchOrder.requestKey, values.requestKey));
  const intent = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${values.userId}))`);
    const [owner] = await tx.select({ blocked: user.blocked }).from(user).where(eq(user.id, values.userId));
    if (!owner || owner.blocked) return { kind: "accessDenied" } as const;
    const [existing] = await tx.select().from(launchOrder).where(request);
    if (existing) return { kind: "existing", row: existing } as const;
    const [unresolved] = await tx.select().from(launchOrder).where(and(
      eq(launchOrder.userId, values.userId), eq(launchOrder.service, values.service), eq(launchOrder.url, values.url),
      eq(launchOrder.quantity, values.quantity), values.hours == null ? isNull(launchOrder.hours) : eq(launchOrder.hours, values.hours),
      inArray(launchOrder.providerStatus, ["submitting", "unknown"]),
    )).limit(1);
    if (unresolved) return { kind: "existing", row: unresolved } as const;
    // Serialize price changes against the reservation, not the provider request.
    const [pricing] = await tx.select({ factor: pricingSettings.factor }).from(pricingSettings)
      .where(eq(pricingSettings.id, 1)).for("share");
    if (pricing?.factor !== priceFactor) return { kind: "priceChanged" } as const;
    const { rows: [balance] } = await tx.execute<{ cents: string }>(sql`select ${spendableBalance(values.userId)} as cents`);
    if (Number(balance.cents) < values.amountCents) return { kind: "insufficient" } as const;
    const [row] = await tx.insert(launchOrder).values({ ...values, providerId: null, providerStatus: "submitting" }).returning();
    return { kind: "reserved", row } as const;
  });
  if (intent.kind !== "reserved") return intent;
  const outcome = await createStreamSkillPurchase(purchase);
  const state = outcome.result === "created"
    ? {
      providerId: outcome.purchase.id, providerStatus: outcome.purchase.status,
      ...nextTimedOrderClock({ ...intent.row, providerStatus: "submitting" }, outcome.purchase.status, Date.now()),
      followerStartCheckAt: purchase.service.id === "twitch-followers" && !finishedProviderStatuses.includes(outcome.purchase.status)
        ? new Date(Date.now() + followerStartDelayMs) : null,
      followerEstimate: nextFollowerEstimate(intent.row, null, Date.now(), undefined, outcome.purchase.progress),
    }
    : { providerStatus: outcome.result };
  const [row] = await db.update(launchOrder).set(state)
    .where(and(request, eq(launchOrder.providerStatus, "submitting"))).returning();
  if (row && outcome.result === "created" && purchase.service.id === "twitch-followers") {
    const { id } = outcome.purchase;
    const interval = purchase.interval;
    // Keep the confirmed purchase available for recovery even if a follow-up request fails.
    const updated = await db.transaction(async tx => {
      const [current] = await tx.select().from(launchOrder).where(request).for("update");
      if (!current?.followerStartCheckAt || !followerControl(current.providerStatus)) return current ?? row;
      if (floating && interval !== undefined && !await changeStreamSkillFollowers(id, { interval, floating }).catch(() => false)) {
        const [saved] = await tx.update(launchOrder).set({ followerStartCheckAt: null }).where(request).returning();
        return saved;
      }
      if (followerControl(current.providerStatus) === "start") {
        await commandStreamSkillPurchase(id, "start").catch(() => "unknown" as const);
      }
      const snapshot = await readStreamSkillPurchase(id).catch(() => null);
      const [saved] = await tx.update(launchOrder).set({
        followerFloatingInterval: floating,
        providerStatus: snapshot?.status ?? current.providerStatus,
        ...(snapshot && finishedProviderStatuses.includes(snapshot.status) ? { followerStartCheckAt: null } : {}),
        followerEstimate: snapshot
          ? nextFollowerEstimate(current, null, Date.now(), undefined, snapshot.progress)
          : current.followerEstimate,
      }).where(request).returning();
      return saved;
    }).catch(() => row);
    return { kind: "sent", row: updated } as const;
  }
  return { kind: "sent", row: row ?? intent.row } as const;
}

const refreshes = new Map<string, { until: number; task: Promise<void> }>();

export function refreshProviderOrders(userId: string) {
  const previous = refreshes.get(userId);
  if (previous && previous.until > Date.now()) return previous.task;
  if (refreshes.size >= 500) refreshes.delete(refreshes.keys().next().value!);
  const task = refreshOrders(userId).catch(() => { /* Keep the last confirmed state. */ });
  refreshes.set(userId, { until: Date.now() + 20_000, task });
  return task;
}

export async function checkPendingFollowerStarts(userId?: string) {
  const db = getDb();
  const due = and(lte(launchOrder.followerStartCheckAt, new Date()),
    userId ? eq(launchOrder.userId, userId) : undefined);
  const rows = await db.select({ id: launchOrder.id }).from(launchOrder).where(due)
    .orderBy(asc(launchOrder.followerStartCheckAt)).limit(4);
  const results = await Promise.allSettled(rows.map(({ id }) => db.transaction(async tx => {
    const orderKey = eq(launchOrder.id, id);
    const [order] = await tx.select().from(launchOrder).where(and(orderKey, due)).for("update", { skipLocked: true });
    if (!order?.followerStartCheckAt || !order.providerId) return;
    const [owner] = await tx.select({ blocked: user.blocked }).from(user).where(eq(user.id, order.userId));
    if (!owner || owner.blocked || Date.now() - order.followerStartCheckAt.getTime() > followerStartGraceMs) {
      await tx.update(launchOrder).set({
        followerStartCheckAt: null,
        followerEstimate: nextFollowerEstimate(order, order.providerStatus, Date.now()),
      }).where(orderKey);
      return;
    }
    let snapshot = await readStreamSkillPurchase(order.providerId);
    const retry = snapshot.status === "stopped";
    if (retry) {
      const outcome = await commandStreamSkillPurchase(order.providerId, "start").catch(() => "unknown" as const);
      if (outcome !== "accepted") console.warn("streamskill_follower_start_unconfirmed", { id, outcome });
      snapshot = await readStreamSkillPurchase(order.providerId).catch(() => snapshot);
    }
    const preparing = !retry && !finishedProviderStatuses.includes(snapshot.status);
    if (preparing && snapshot.status === order.providerStatus && !snapshot.progress) return;
    await tx.update(launchOrder).set({
      followerStartCheckAt: preparing ? order.followerStartCheckAt : null,
      providerStatus: snapshot.status,
      followerEstimate: nextFollowerEstimate(order, preparing ? null : snapshot.status, Date.now(), undefined, snapshot.progress),
    }).where(orderKey);
  })));
  if (results.some(result => result.status === "rejected")) console.warn("streamskill_follower_check_failed");
}

async function refreshOrders(userId: string) {
  const db = getDb();
  const rows = await db.select({
    id: launchOrder.providerId, service: launchOrder.service, quantity: launchOrder.quantity,
    providerStatus: launchOrder.providerStatus, followerIntervalSeconds: launchOrder.followerIntervalSeconds,
    followerEstimate: launchOrder.followerEstimate, followerStartCheckAt: launchOrder.followerStartCheckAt, hours: launchOrder.hours,
    pausedAt: launchOrder.pausedAt, endsAt: launchOrder.endsAt, createdAt: launchOrder.createdAt,
  }).from(launchOrder)
    .where(and(eq(launchOrder.userId, userId), isNotNull(launchOrder.providerId), notInArray(launchOrder.providerStatus, ["refunded"])))
    .orderBy(desc(launchOrder.createdAt)).limit(100);
  const items = await readStreamSkillPurchases(rows.flatMap(row => row.id === null ? [] : [row.id]));
  if (!items.length) return;
  const snapshots = new Map(rows.map(row => [row.id, row]));
  const now = Date.now();
  await db.transaction(async tx => {
    for (const purchase of items) {
      const previous = snapshots.get(purchase.id);
      if (!previous?.providerStatus) continue;
      const followerEstimate = nextFollowerEstimate(previous, previous.followerStartCheckAt ? null : purchase.status, now, undefined, purchase.progress);
      if (previous.providerStatus === purchase.status && previous.followerEstimate === followerEstimate) continue;
      // Discard a snapshot if a command or a settings edit changed the order while the lookup ran.
      await tx.update(launchOrder).set({ providerStatus: purchase.status, followerEstimate, ...nextTimedOrderClock(previous, purchase.status, now) })
        .where(and(eq(launchOrder.userId, userId), eq(launchOrder.providerId, purchase.id),
          eq(launchOrder.providerStatus, previous.providerStatus),
          eq(launchOrder.endsAt, previous.endsAt),
          previous.followerStartCheckAt ? eq(launchOrder.followerStartCheckAt, previous.followerStartCheckAt) : isNull(launchOrder.followerStartCheckAt),
          previous.pausedAt ? eq(launchOrder.pausedAt, previous.pausedAt) : isNull(launchOrder.pausedAt),
          sql`${launchOrder.followerIntervalSeconds} is not distinct from ${previous.followerIntervalSeconds}::integer`,
          sql`${launchOrder.followerEstimate} is not distinct from ${previous.followerEstimate && JSON.stringify(previous.followerEstimate)}::jsonb`,
        ));
    }
  });
}
