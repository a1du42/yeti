import { z } from "zod";

export const PASSWORD_MIN = 15;
export const PASSWORD_MAX = 128;
export const NAME_MAX = 120;

export function passwordError(value: string): string | undefined {
  const length = Array.from(value).length;
  if (length < PASSWORD_MIN) return `Введите пароль не короче ${PASSWORD_MIN} символов`;
  if (length > PASSWORD_MAX) return `Пароль должен содержать не больше ${PASSWORD_MAX} символов`;
}

export function nameError(value: string): string | undefined {
  if (!value.trim()) return "Введите имя";
  if (Array.from(value.trim()).length > NAME_MAX) return `Имя должно содержать не больше ${NAME_MAX} символов`;
}

export function emailError(value: string): string | undefined {
  if (!value.trim()) return "Введите email";
  if (!z.email().safeParse(value.trim()).success) return "Укажите email в формате name@example.com";
}

export function isTimezone(value: string): boolean {
  if (!value || value.length > 100) return false;
  // Intl also accepts fixed UTC offsets; store only named IANA zones.
  if (/^[+-]/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("ru-RU", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
