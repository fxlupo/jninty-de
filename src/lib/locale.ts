import { format, type FormatOptions } from "date-fns";
import { de } from "date-fns/locale";

export const APP_LOCALE = "de-DE";

export function formatDate(
  date: Date | number,
  pattern: string,
  options?: Omit<FormatOptions, "locale">,
): string {
  return format(date, pattern, { ...options, locale: de });
}

export function formatBrowserDate(
  value: string | number | Date,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(APP_LOCALE, options).format(date);
}

export function formatBrowserDateTime(
  value: string | number | Date,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(APP_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  }).format(date);
}
