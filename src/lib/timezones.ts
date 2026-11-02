const cities: Record<string, string> = {
  UTC: "Всемирное время", "Europe/Moscow": "Москва", "Europe/Minsk": "Минск",
  "Europe/Kyiv": "Киев", "Europe/Kiev": "Киев", "Europe/London": "Лондон",
  "Europe/Berlin": "Берлин", "Europe/Paris": "Париж", "Europe/Istanbul": "Стамбул",
  "Europe/Kaliningrad": "Калининград", "Europe/Samara": "Самара",
  "Asia/Yekaterinburg": "Екатеринбург", "Asia/Novosibirsk": "Новосибирск",
  "Asia/Krasnoyarsk": "Красноярск", "Asia/Irkutsk": "Иркутск", "Asia/Yakutsk": "Якутск",
  "Asia/Vladivostok": "Владивосток", "Asia/Kamchatka": "Петропавловск-Камчатский",
  "Asia/Almaty": "Алматы", "Asia/Tashkent": "Ташкент", "Asia/Dubai": "Дубай",
  "Asia/Tbilisi": "Тбилиси", "Asia/Yerevan": "Ереван", "Asia/Baku": "Баку",
  "Asia/Bishkek": "Бишкек", "Asia/Tokyo": "Токио", "Asia/Kathmandu": "Катманду",
  "Asia/Katmandu": "Катманду", "America/New_York": "Нью-Йорк", "America/Chicago": "Чикаго",
  "America/Los_Angeles": "Лос-Анджелес", "America/Toronto": "Торонто",
};

export function timezoneLabel(zone: string, date = new Date()): string {
  try {
    const part = (style: "longGeneric" | "longOffset") => new Intl.DateTimeFormat("ru-RU", { timeZone: zone, timeZoneName: style }).formatToParts(date).find(item => item.type === "timeZoneName")?.value;
    const name = cities[zone] || part("longGeneric") || zone;
    const offset = part("longOffset")?.replace(/GMT|UTC/, "UTC");
    return `${name} · ${offset || "смещение недоступно"}`;
  } catch { return `${cities[zone] || zone} · смещение недоступно`; }
}

export function timezoneOptions(extra = "") {
  let zones = Object.keys(cities);
  try { zones = ["UTC", ...Intl.supportedValuesOf("timeZone")]; } catch { /* Локальный список для старых браузеров. */ }
  if (extra) zones.push(extra);
  const options = [...new Set(zones)].map(value => ({ value, label: timezoneLabel(value) }));
  const counts = new Map<string, number>();
  for (const option of options) counts.set(option.label, (counts.get(option.label) || 0) + 1);
  return options.map(option => ({ ...option, label: (counts.get(option.label) || 0) > 1 ? `${option.label} (${option.value})` : option.label })).sort((a, b) => a.label.localeCompare(b.label, "ru"));
}
