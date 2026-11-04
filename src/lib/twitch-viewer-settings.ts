import { z } from "zod";

export const twitchViewerGeos = ["auto", "us", "br", "ru", "mx", "tr", "de", "gb", "it", "ca", "ua", "by", "pt", "ar", "es", "ae", "pl", "fr", "ch", "kz", "ge", "eg", "sa"] as const;
export const twitchViewerModes = ["smooth_only", "smooth_floating", "manual"] as const;
export const twitchChartEndActions = ["max_work", "repeat", "shutdown"] as const;
const integer = (min: number, max: number) => z.number().int().min(min).max(max);
export const twitchViewerSettings = z.strictObject({
  channel: z.string().regex(/^[a-z0-9_]{1,25}$/i).optional(),
  threads: integer(1, 500_000).optional(),
  stream_views: integer(1, 10).optional(),
  uniq_viewers: integer(1, 10).optional(),
  raid: z.boolean().optional(),
  raid_time: integer(5, 60).optional(),
  connect_time: integer(1, 60).optional(),
  online_mode: z.enum(twitchViewerModes).optional(),
  geo: z.enum(twitchViewerGeos).optional(),
  geo_percent: integer(0, 100).optional(),
  chatlist: integer(0, 100).optional(),
  preferred_account_group: z.literal(0).optional(),
  manual_chart: z.record(z.string().regex(/^(0|[1-9][0-9]{0,2})$/), integer(0, 500_000)).optional(),
  manual_chart_randomization: integer(0, 100).optional(),
  manual_chart_end_action: z.enum(twitchChartEndActions).optional(),
  manual_chart_end_param: integer(0, 60).optional(),
});
export type TwitchViewerSettings = z.infer<typeof twitchViewerSettings>;
export const viewerChatInterval = { min: 6, max: 600 } as const;
export const viewerChatSettings = z.strictObject({
  interval: integer(viewerChatInterval.min, viewerChatInterval.max).optional(),
  mode: z.union([z.literal(0), z.literal(1)]).optional(),
  phrases: z.array(z.string().trim().min(1).max(500)).max(100).optional(),
}).refine(value => Object.keys(value).length > 0);
export type ViewerChatSettings = z.infer<typeof viewerChatSettings>;

export function isTwitchViewerPackage(service: string) {
  return /^twitch-viewers-(hour|day|week|month)$/.test(service);
}

export function viewerSettingsError(settings: TwitchViewerSettings, purchased: number) {
  if (!Object.keys(settings).length) return "Укажите хотя бы одну настройку.";
  const viewers = settings.threads ?? purchased;
  if (viewers > purchased) return "Количество зрителей превышает лимит заказа.";
  if (settings.connect_time !== undefined && settings.connect_time > Math.min(60, viewers)) {
    return "Время подключения не должно превышать количество зрителей или 60 минут.";
  }
  if (settings.online_mode === "manual") {
    const chart = settings.manual_chart;
    const minutes = Object.keys(chart ?? {}).map(Number);
    const duration = Math.max(...minutes);
    if (!chart || minutes.length < 2 || chart["0"] === undefined || duration < 10 || duration > 180 ||
      Object.values(chart).some(count => count > viewers)) {
      return "Укажите хотя бы две точки графика, начиная с минуты 0. Последняя точка — на 10–180-й минуте. Не превышайте лимит зрителей.";
    }
    if (settings.manual_chart_randomization === undefined || settings.manual_chart_end_action === undefined ||
      settings.manual_chart_end_param === undefined ||
      (settings.manual_chart_end_action === "repeat" && settings.manual_chart_end_param > duration)) {
      return "Укажите разброс и действие после графика. Пауза перед повтором не может быть длиннее графика.";
    }
  } else if (settings.manual_chart !== undefined || settings.manual_chart_randomization !== undefined ||
    settings.manual_chart_end_action !== undefined || settings.manual_chart_end_param !== undefined) {
    return "Выберите свой график, чтобы изменить его настройки.";
  }
  return null;
}
