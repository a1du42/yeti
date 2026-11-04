import type { Platform, StreamTarget } from "./stream-link";
import type { TwitchViewerSettings, ViewerChatSettings } from "./twitch-viewer-settings";
import { getCatalogService, type CatalogServiceId } from "./launch-catalog";

export type LaunchService = "viewers" | "views" | "followers" | CatalogServiceId;
export const launchStatuses = ["active", "completed"] as const;
export type LaunchStatus = (typeof launchStatuses)[number];
export const providerStatuses = ["created", "awaiting", "working", "stopped", "completed", "failed", "deleted", "refunded"] as const;
export type ProviderStatus = typeof providerStatuses[number] | "submitting" | "unknown" | "rejected";
export type FollowerEstimate = { count: number; since: number | null };

export function estimatedFollowerCount(estimate: FollowerEstimate, interval: number, now: number) {
  return estimate.count + (estimate.since === null ? 0 : Math.max(0, now - estimate.since) / (interval * 1000));
}

export function nextFollowerEstimate(
  order: { service: LaunchService; quantity: number; followerIntervalSeconds: number | null; followerEstimate: FollowerEstimate | null },
  status: ProviderStatus | null,
  now: number,
  interval = order.followerIntervalSeconds,
  progress?: { completed: number; total: number },
): FollowerEstimate | null {
  if (order.service !== "twitch-followers") return null;
  const previous = order.followerEstimate;
  const running = status === "working" && interval !== null;
  if (progress?.total === order.quantity) {
    return { count: progress.completed, since: running ? now : null };
  }
  if (!previous && !running) return null;
  if (previous && (previous.since !== null) === running && interval === order.followerIntervalSeconds) return previous;
  const count = previous && order.followerIntervalSeconds !== null
    ? Math.min(order.quantity, estimatedFollowerCount(previous, order.followerIntervalSeconds, now)) : previous?.count ?? 0;
  return { count, since: running ? now : null };
}
export const finishedProviderStatuses: ProviderStatus[] = ["completed", "failed", "deleted", "refunded", "rejected"];
export const followerInterval = { min: 10, max: 43_200, step: 5 } as const;
export const followerControl = (status: ProviderStatus | null) =>
  status === "created" || status === "stopped" ? "start"
    : status === "awaiting" || status === "working" ? "stop" : null;

export function nextTimedOrderClock(
  order: { hours: number | null; providerStatus: ProviderStatus | null; pausedAt: Date | null; endsAt: Date },
  status: ProviderStatus,
  now: number,
) {
  if (!order.hours) return {};
  if ((status === "stopped" || status === "awaiting") && order.providerStatus === "working" && !order.pausedAt) {
    return { pausedAt: new Date(now) };
  }
  if (status === "working" && order.pausedAt) {
    return { pausedAt: null, endsAt: new Date(order.endsAt.getTime() + Math.max(0, now - order.pausedAt.getTime())) };
  }
  return {};
}
export const isFollowerInterval = (value: number) =>
  value >= followerInterval.min && value <= followerInterval.max &&
  (value - followerInterval.min) % followerInterval.step === 0;
export function clampFollowerInterval(value: string) {
  return value !== "" && Number.isFinite(Number(value))
    ? String(Math.max(followerInterval.min, Math.min(followerInterval.max, Number(value)))) : value;
}
export const launchRegions = ["auto", "europe", "asia", "north-america"] as const;
export type LaunchRegion = (typeof launchRegions)[number];
export const launchRegionNames: Record<LaunchRegion, string> = {
  auto: "Автоматически", europe: "Европа", asia: "Азия", "north-america": "Северная Америка",
};
export const canPauseDemoLaunch = (service: LaunchService) => service === "viewers" || getCatalogService(service)?.pause === true;
export const canChangeDemoRegion = (service: LaunchService) => service === "viewers" || getCatalogService(service)?.region === true;
export type LaunchChange = { paused: boolean } | { region: LaunchRegion } |
  { followerAction: "start" | "stop" } | { interval: number; floating: boolean } |
  { viewerAction: "start" | "stop" } | { viewers: TwitchViewerSettings } |
  { viewerChat: ViewerChatSettings } | { viewerChatAction: "start" | "stop" };

export function launchServiceName(service: LaunchService, platform: Platform, kind: StreamTarget["kind"]) {
  const entry = getCatalogService(service);
  if (entry) return kind === "shorts" && entry.category === "views" ? "Просмотры шортса"
    : kind === "shorts" && entry.category === "likes" ? "Лайки шортса" : entry.title;
  if (service === "viewers") return "Зрители трансляции";
  if (service === "views") return kind === "shorts" ? "Просмотры шортса" : "Просмотры видео";
  return platform === "youtube" ? "Подписчики канала" : "Фолловеры канала";
}

export type LaunchOrder = {
  id: string;
  service: LaunchService;
  platform: Platform;
  kind: StreamTarget["kind"];
  url: string;
  title: string | null;
  thumbnail: string | null;
  quantity: number;
  followerIntervalSeconds: number | null;
  followerFloatingInterval: boolean | null;
  followerEstimate: FollowerEstimate | null;
  hours: number | null;
  amountCents: number;
  providerStatus: ProviderStatus | null;
  createdAt: string;
  endsAt: string;
  pausedAt: string | null;
  region: LaunchRegion;
};
