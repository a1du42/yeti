import type { Platform, StreamInfo, StreamTarget } from "./stream-link";

type ServiceCategory = "viewers" | "chat" | "followers" | "views" | "likes" | "prime";
type Price =
  | { unit: number } // USD × 10 000 за единицу или единицу в час.
  | { tiers: readonly (readonly [max: number, cents: number])[] };

export type CatalogService = {
  platform: Platform;
  category: ServiceCategory;
  target: StreamTarget["kind"];
  title: string;
  min: number;
  max: number;
  duration: "hourly" | number | null;
  price: Price | null;
  unavailable?: string;
  pause?: boolean;
  region?: boolean;
};

export const launchHoursMax = 24;
export const launchQuantityMax = 1_000_000;
export const liveOrderQuantityMax = 10_000;
export const demoLaunchMinutes = 5;

function timed(platform: Platform, category: "viewers" | "chat", duration: "hourly" | 24 | 168 | 720, min: number, max: number, rate: number | Price): CatalogService {
  const period = duration === "hourly" ? "на час" : duration === 24
    ? (platform === "twitch" && category === "viewers" ? "на сутки" : "на день")
    : duration === 168 ? "на неделю" : "на месяц";
  return {
    platform, category, duration, min, max, target: "stream", price: typeof rate === "number" ? { unit: rate } : rate,
    title: `${category === "viewers" ? "Зрители" : "ИИ-чат"} ${period}`,
    pause: duration === "hourly", region: category === "viewers",
  };
}

function count(platform: Platform, category: "followers" | "views" | "likes", target: "channel" | "video" | "clip", min: number, max: number, unit: number): CatalogService {
  const title = category === "followers" ? (platform === "youtube" ? "Подписчики канала" : "Фолловеры канала")
    : category === "likes" ? "Лайки видео" : target === "clip" ? "Просмотры клипа" : "Просмотры видео";
  return { platform, category, target, title, min, max, duration: null, price: { unit } };
}

const tiers = (...values: (readonly [number, number])[]): Price => ({ tiers: values });
const youtube = (service: CatalogService): CatalogService => ({
  ...service, unavailable: "Временно недоступно", pause: false, region: false,
});

const catalog = {
  "twitch-viewers-test": {
    platform: "twitch", category: "viewers", target: "stream", title: "Тест: 20 зрителей на час",
    min: 20, max: 20, duration: 1, price: { unit: 0 },
  },
  "twitch-viewers-hour": timed("twitch", "viewers", "hourly", 5, 1_000, 44),
  "twitch-viewers-day": timed("twitch", "viewers", 24, 5, 1_000, 400),
  "twitch-viewers-week": timed("twitch", "viewers", 168, 5, 1_000, 1_400),
  "twitch-viewers-month": timed("twitch", "viewers", 720, 5, 1_000, 4_200),
  "twitch-chat-hour": timed("twitch", "chat", "hourly", 5, 300, 1_200),
  "twitch-chat-day": timed("twitch", "chat", 24, 5, 300, tiers([20, 1_200], [100, 2_300], [200, 4_500], [300, 5_000])),
  "twitch-chat-week": timed("twitch", "chat", 168, 5, 300, tiers([20, 5_500], [100, 11_000], [200, 21_000], [300, 30_000])),
  "twitch-chat-month": timed("twitch", "chat", 720, 5, 300, tiers([20, 25_000], [100, 30_000], [200, 35_000], [300, 46_000])),
  "twitch-followers": count("twitch", "followers", "channel", 10, 500_000, 10),
  "twitch-views-video": count("twitch", "views", "video", 10, 500_000, 4),
  "twitch-views-clip": count("twitch", "views", "clip", 10, 500_000, 4),
  "twitch-prime": {
    platform: "twitch", category: "prime", target: "channel", title: "Prime-подписки",
    min: 0, max: 0, duration: null, price: null, unavailable: "Нет тарифа для запуска",
  },
  "kick-viewers-hour": timed("kick", "viewers", "hourly", 5, 5_000, 50),
  "kick-viewers-day": timed("kick", "viewers", 24, 5, 5_000, 600),
  "kick-viewers-week": timed("kick", "viewers", 168, 5, 5_000, 2_300),
  "kick-viewers-month": timed("kick", "viewers", 720, 5, 5_000, 4_600),
  "kick-chat-hour": timed("kick", "chat", "hourly", 5, 100, tiers([20, 150], [49, 200], [69, 300], [100, 400])),
  "kick-chat-day": timed("kick", "chat", 24, 5, 100, tiers([20, 1_300], [100, 2_500])),
  "kick-chat-week": timed("kick", "chat", 168, 5, 100, tiers([20, 8_500], [100, 16_000])),
  "kick-chat-month": timed("kick", "chat", 720, 5, 100, tiers([20, 32_000], [100, 47_000])),
  "kick-followers": count("kick", "followers", "channel", 10, 10_000, 50),
  "kick-views-video": count("kick", "views", "video", 10, 50_000, 1),
  "kick-views-clip": count("kick", "views", "clip", 10, 50_000, 1),
  "youtube-viewers-hour": youtube(timed("youtube", "viewers", "hourly", 100, 500_000, 300)),
  "youtube-followers": youtube(count("youtube", "followers", "channel", 100, 100_000, 200)),
  "youtube-views": youtube(count("youtube", "views", "video", 100, 1_000_000, 330)),
  "youtube-likes": youtube(count("youtube", "likes", "video", 100, 10_000, 250)),
} satisfies Record<string, CatalogService>;

export type CatalogServiceId = keyof typeof catalog;
const serviceIds = Object.keys(catalog) as CatalogServiceId[];
export const launchCatalog = serviceIds.map(id => ({ id, ...catalog[id] }) as CatalogService & { id: CatalogServiceId });
export type CatalogEntry = (typeof launchCatalog)[number];

export function getCatalogService(id: string): CatalogEntry | undefined {
  return Object.hasOwn(catalog, id) ? { id: id as CatalogServiceId, ...catalog[id as CatalogServiceId] } : undefined;
}

export function matchesLaunchTarget(service: CatalogService, source: Pick<StreamInfo, "platform" | "kind" | "sourceKind">) {
  if (source.platform !== service.platform) return false;
  if (service.target === "channel") return source.sourceKind === "channel";
  return service.target === source.kind || (service.target === "video" && source.kind === "shorts");
}

export function showsLaunchService(service: CatalogEntry, source: Pick<StreamInfo, "platform" | "kind" | "sourceKind">) {
  return matchesLaunchTarget(service, source) || (
    service.platform === source.platform && service.platform !== "youtube" &&
    service.id !== "twitch-viewers-test" && service.target === "stream" &&
    source.kind === "channel" && source.sourceKind === "channel"
  );
}

export function launchQuote(service: CatalogService, quantity: number, hours: number | null, priceFactor = 100) {
  if (!service.price || !Number.isInteger(quantity) || quantity < service.min || quantity > service.max) return null;
  const duration = service.duration === "hourly" ? hours : service.duration;
  if (service.duration === "hourly" ? (hours === null || !Number.isInteger(hours) || hours < 1 || hours > launchHoursMax) : hours !== null) return null;
  const multiplier = service.duration === "hourly" ? hours! : 1;
  // Keep the base price in 1/10,000 USD; the factor is in hundredths.
  let base: number;
  if ("tiers" in service.price) {
    const tier = service.price.tiers.find(([max]) => quantity <= max);
    if (!tier) return null;
    base = tier[1] * 100 * multiplier;
  } else {
    base = service.price.unit * quantity * multiplier;
  }
  const scaled = base * priceFactor;
  const amountCents = scaled === 0 ? 0 : Math.max(1, Math.floor((scaled + 5_000) / 10_000));
  return { hours: duration, amountCents, minutes: duration === null ? demoLaunchMinutes : duration * 60 };
}

export function launchDurationLabel(hours: number) {
  return hours >= 24 && hours % 24 === 0 ? `${hours / 24} сут.` : `${hours} ч`;
}
