import "server-only";
import { z } from "zod";
import { launchCatalog, launchQuantityMax, liveOrderQuantityMax, type CatalogEntry, type CatalogServiceId } from "./launch-catalog";
import { getServerEnv } from "./env";
import { isFollowerInterval, providerStatuses } from "./launch-orders";
import type { TwitchViewerSettings, ViewerChatSettings } from "./twitch-viewer-settings";

// Map only catalog entries supported by YETI. Presence in /tarifs alone does
// not mean a provider tariff is available (e.g. YouTube, internal operations).
const tariffIds: Partial<Record<CatalogServiceId, number>> = {
  "twitch-viewers-hour": 216, "twitch-viewers-day": 217, "twitch-viewers-week": 218, "twitch-viewers-month": 219,
  "twitch-chat-hour": 244, "twitch-chat-day": 246, "twitch-chat-week": 247, "twitch-chat-month": 248,
  "twitch-followers": 220, "twitch-views-video": 221, "twitch-views-clip": 215,
  "kick-viewers-hour": 224, "kick-viewers-day": 225, "kick-viewers-week": 226, "kick-viewers-month": 227,
  "kick-chat-hour": 245, "kick-chat-day": 249, "kick-chat-week": 250, "kick-chat-month": 251,
  "kick-followers": 229, "kick-views-video": 240, "kick-views-clip": 230,
};

const limits = z.object({ min: z.number().int().positive(), max: z.number().int().max(launchQuantityMax) })
  .refine(range => range.min <= range.max);
const payload = z.array(z.object({ id: z.number().int(), hourly: z.boolean(), count: z.unknown() })).max(500);
const demoCatalog = launchCatalog.filter(item => !item.unavailable);
const baseUrl = "https://api.streamskill.pro/v1";
const purchasePayload = z.object({
  id: z.number().int().positive(),
  tarif: z.number().int().positive(),
  price: z.number().nonnegative(),
  currency: z.enum(["usd", "rub"]),
  status: z.enum(providerStatuses),
  progress: z.object({
    completed: z.number().int().nonnegative(),
    total: z.number().int().positive(),
  }).refine(value => value.completed <= value.total).optional().catch(undefined),
});
type Purchase = z.infer<typeof purchasePayload>;

function providerRequest(key: string, path: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  return fetch(baseUrl + path, {
    headers: {
      Authorization: `Bearer ${key}`, Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5_000),
  });
}

export async function createStreamSkillPurchase(input: {
  service: CatalogEntry; target: string; quantity: number; hours: number | null; reference: string; interval?: number;
}): Promise<{ result: "created"; purchase: Purchase } | { result: "rejected" | "unknown" }> {
  const key = getServerEnv().STREAMSKILL_API_KEY;
  const id = tariffIds[input.service.id];
  if (!key || !id || input.service.unavailable || !Number.isInteger(input.quantity) ||
    (input.interval !== undefined && (input.service.id !== "twitch-followers" || !isFollowerInterval(input.interval))) ||
    input.quantity < input.service.min || input.quantity > Math.min(input.service.max, liveOrderQuantityMax) ||
    (input.service.duration === "hourly" ? input.hours === null || !Number.isInteger(input.hours) ||
      input.hours < 1 || input.hours > 24 : input.hours !== null)) return { result: "rejected" };
  try {
    const response = await providerRequest(key, "/purchases/create", {
      tarif: { id, quantity: input.quantity, ...(input.hours === null ? {} : { duration: input.hours }) },
      channel: input.target, comment: input.reference,
      ...(input.interval === undefined ? {} : { interval: input.interval }),
      ...(input.service.pause ? { start: true } : {}),
    });
    if ([401, 422].includes(response.status)) return { result: "rejected" };
    if (!response.ok) return { result: "unknown" };
    const purchase = purchasePayload.parse(await response.json());
    return purchase.tarif === id ? { result: "created", purchase } : { result: "unknown" };
  } catch {
    // The provider may have accepted the order before the response was lost.
    return { result: "unknown" };
  }
}

export async function commandStreamSkillPurchase(id: number, action: "start" | "stop") {
  const key = getServerEnv().STREAMSKILL_API_KEY;
  if (!key || !Number.isSafeInteger(id) || id < 1) throw new Error("Invalid StreamSkill purchase reference");
  const response = await providerRequest(key, `/purchases/${id}/${action}`, undefined, "POST");
  if (response.ok) {
    const body: unknown = await response.json().catch(() => null);
    return z.object({ status: z.literal("ok") }).safeParse(body).success ? "accepted" : "unknown";
  }
  if ([401, 404, 405, 409, 422].includes(response.status)) return "rejected";
  return "unknown";
}

export function changeStreamSkillViewers(id: number, settings: TwitchViewerSettings) {
  return confirmStreamSkillAction(id, "edit-twitch-viewers", settings);
}

async function readStreamSkillExpandedPurchase(id: number, expand: "api" | "chatbot") {
  const key = getServerEnv().STREAMSKILL_API_KEY;
  if (!key || !Number.isSafeInteger(id) || id < 1) throw new Error("Invalid StreamSkill purchase reference");
  const response = await providerRequest(key, `/purchases/${id}?expand=${expand}`);
  if (!response.ok) throw new Error("StreamSkill purchase lookup failed");
  return response.json();
}

const providerViewerFields = {
  threads: "threads",
  stream_views: "streamViews",
  uniq_viewers: "uniqViewers",
  raid: "raid",
  raid_time: "raidTime",
  connect_time: "connectTime",
  online_mode: "onlineMode",
  geo: "geo",
  geo_percent: "geoPercent",
  manual_chart_randomization: "manualChartRandomization",
  manual_chart_end_action: "manualChartEndAction",
  manual_chart_end_param: "manualChartEndParam",
} satisfies Partial<Record<keyof TwitchViewerSettings, string>>;

export async function readStreamSkillViewerSettings(id: number) {
  const { api } = z.object({
    id: z.literal(id),
    api: z.record(z.string(), z.unknown()).optional().catch(undefined),
  }).parse(await readStreamSkillExpandedPurchase(id, "api"));
  const fields: Partial<Record<keyof TwitchViewerSettings, string>> = {};
  for (const [name, providerName] of Object.entries(providerViewerFields) as [keyof typeof providerViewerFields, string][]) {
    const value = api?.[providerName];
    if (typeof value === "string" || typeof value === "number") fields[name] = String(value);
    else if (name === "raid" && typeof value === "boolean") fields.raid = value ? "on" : "off";
  }
  const chart = z.record(z.string().regex(/^(0|[1-9][0-9]{0,2})$/), z.number().int().nonnegative())
    .safeParse(api?.manualChart);
  if (chart.success) fields.manual_chart = Object.entries(chart.data).map(([minute, count]) => `${minute}: ${count}`).join("\n");
  return fields;
}

export async function readStreamSkillViewerChat(id: number) {
  const snapshot = z.object({
    id: z.literal(id),
    chatbot: z.object({
      started: z.boolean(),
      interval: z.number().int().optional().catch(undefined),
      mode: z.enum(["random", "sequential"]).optional().catch(undefined),
      messages: z.array(z.string()).nullish().catch(undefined),
    }).nullish(),
  }).parse(await readStreamSkillExpandedPurchase(id, "chatbot"));
  return snapshot.chatbot ?? null;
}

export async function changeStreamSkillViewerChat(id: number, change: ViewerChatSettings | "start" | "stop") {
  const isCommand = typeof change === "string";
  const chat = await readStreamSkillViewerChat(id).catch(error => {
    if (!isCommand) throw error;
    return undefined;
  });
  if (chat === undefined) return "unconfirmed";
  if (!chat) return false;
  if (typeof change !== "string") return confirmStreamSkillAction(id, "edit-chatbot", change);
  const started = change === "start";
  if (chat.started === started) return true;
  const confirmed = await confirmStreamSkillAction(id, started ? "start-chatbots" : "stop-chatbots").catch(() => undefined);
  if (confirmed !== undefined) return confirmed;
  const current = await readStreamSkillViewerChat(id).catch(() => null);
  return current?.started === started ? true : "unconfirmed";
}

async function confirmStreamSkillAction(
  id: number, action: "edit-twitch-viewers" | "edit-chatbot" | "start-chatbots" | "stop-chatbots", settings?: unknown,
) {
  const key = getServerEnv().STREAMSKILL_API_KEY;
  if (!key || !Number.isSafeInteger(id) || id < 1) throw new Error("Invalid StreamSkill purchase reference");
  const response = await providerRequest(key, `/purchases/${id}/${action}`, settings, "POST");
  if ([401, 404, 405, 409, 422].includes(response.status)) return false;
  if (!response.ok || !z.object({ status: z.literal("ok") }).safeParse(await response.json()).success) {
    throw new Error("StreamSkill did not confirm the change");
  }
  return true;
}

export async function changeStreamSkillFollowers(id: number, change: { interval: number; floating: boolean }) {
  const key = getServerEnv().STREAMSKILL_API_KEY;
  if (!key || !Number.isSafeInteger(id) || id < 1) throw new Error("Invalid StreamSkill purchase reference");
  const response = await providerRequest(key, `/purchases/${id}/edit-twitch-followers`, {
    interval: change.interval, floating_interval: change.floating,
  });
  if ([404, 405, 409, 422].includes(response.status)) return false;
  if (!response.ok || !z.object({ status: z.literal("ok") }).safeParse(await response.json()).success) {
    throw new Error("StreamSkill did not confirm the change");
  }
  return true;
}

export async function readStreamSkillPurchase(id: number): Promise<Purchase> {
  const key = getServerEnv().STREAMSKILL_API_KEY;
  if (!key || !Number.isSafeInteger(id) || id < 1) throw new Error("Invalid StreamSkill purchase reference");
  const response = await providerRequest(key, `/purchases/${id}`);
  if (!response.ok) throw new Error("StreamSkill purchase lookup failed");
  const purchase = purchasePayload.parse(await response.json());
  if (purchase.id !== id) throw new Error("Unexpected StreamSkill purchase reference");
  return purchase;
}

export async function readStreamSkillPurchases(ids: number[]): Promise<Purchase[]> {
  const key = getServerEnv().STREAMSKILL_API_KEY;
  if (!ids.length) return [];
  if (!key || ids.length > 100 || ids.some(id => !Number.isSafeInteger(id) || id < 1)) {
    throw new Error("Invalid StreamSkill purchase references");
  }
  const response = await providerRequest(key, `/purchases/bulk?ids=${ids.join(",")}`);
  if (!response.ok) throw new Error("StreamSkill purchase lookup failed");
  const payload = z.object({ items: z.array(purchasePayload).max(100) }).parse(await response.json());
  const requested = new Set(ids);
  return payload.items.filter(item => requested.has(item.id));
}
let cached: { expires: number; entries: CatalogEntry[] } | undefined;
let pending: Promise<CatalogEntry[]> | undefined;

export function streamSkillLiveEnabled() {
  return getServerEnv().STREAMSKILL_LIVE_ENABLED === "true";
}

export async function readLaunchCatalog(): Promise<CatalogEntry[]> {
  const key = getServerEnv().STREAMSKILL_API_KEY;
  if (!key) {
    if (streamSkillLiveEnabled()) throw new Error("StreamSkill key is required");
    return demoCatalog;
  }
  if (cached && Date.now() < cached.expires) return cached.entries;
  if (!pending) pending = readTariffs(key).finally(() => { pending = undefined; });
  return pending;
}

async function readTariffs(key: string) {
  const response = await providerRequest(key, "/tarifs");
  if (!response.ok) throw new Error("StreamSkill tariff request failed");
  const tariffs = new Map(payload.parse(await response.json()).map(item => [item.id, item]));
  const entries = demoCatalog.flatMap(item => {
    if (item.id === "twitch-viewers-test") return streamSkillLiveEnabled() ? [] : [item];
    const id = tariffIds[item.id];
    const tariff = id === undefined ? undefined : tariffs.get(id);
    if (!tariff || tariff.hourly !== (item.duration === "hourly")) return [];
    const bounds = limits.safeParse(tariff.count);
    if (!bounds.success) return [];
    const { min } = bounds.data;
    const ceiling = item.price && "tiers" in item.price ? item.price.tiers.at(-1)?.[0] : undefined;
    const max = Math.min(bounds.data.max, ceiling ?? launchQuantityMax);
    return min <= max ? [{ ...item, min, max }] : [];
  });
  cached = { entries, expires: Date.now() + 60_000 };
  return entries;
}
