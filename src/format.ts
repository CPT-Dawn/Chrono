// Locale-aware formatting of times and speeds. Words around them come from messages.json.

import type { ClockFormat } from '@/settings';

/** A watch time in YouTube's style: "12:30", "1:02:03". */
export function formatWatchTime(seconds: number): string {
  const total = Math.ceil(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** A speed's number, e.g. "1.5", with the locale's decimal separator. */
export function formatSpeed(speed: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(speed);
}

/** A count, e.g. "1,204", with the locale's digit grouping. */
export function formatCount(count: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(count);
}

/**
 * A clock time in the locale's style, e.g. "3:45 PM" or "15:45". `clockFormat` overrides
 * the locale's 12-hour or 24-hour convention. When the time falls on another day than
 * `now`, the day is named too: "Sun 12:20 AM".
 */
export function formatClockTime(time: Date, now: Date, locale: string, clockFormat: ClockFormat): string {
  const sameDay = time.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(locale, {
    weekday: sameDay ? undefined : 'short',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: HOUR_CYCLES[clockFormat],
  }).format(time);
}

/** Whether clock times are written with AM and PM, as `clockFormat` or else the locale says. */
export function usesTwelveHourClock(locale: string, clockFormat: ClockFormat): boolean {
  if (clockFormat !== 'auto') return clockFormat === '12h';
  const { hourCycle } = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions();
  return hourCycle === 'h11' || hourCycle === 'h12';
}

/** The locale's words for the morning and afternoon halves of a 12-hour clock: "AM" and "PM". */
export function dayPeriodNames(locale: string): [string, string] {
  const format = new Intl.DateTimeFormat(locale, { hour: 'numeric', hourCycle: 'h12' });
  const name = (hour: number) =>
    format.formatToParts(new Date(2026, 0, 1, hour)).find((part) => part.type === 'dayPeriod')?.value ?? '';
  return [name(1), name(13)];
}

/** What the locale writes between hours and minutes: ":" in "3:45", "." in Finnish "15.45". */
export function timeSeparator(locale: string): string {
  const parts = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).formatToParts(new Date(2026, 0, 1, 15, 45));
  const hour = parts.findIndex((part) => part.type === 'hour');
  return parts[hour + 1]?.type === 'literal' ? parts[hour + 1]!.value : ':';
}

const HOUR_CYCLES: Record<ClockFormat, Intl.DateTimeFormatOptions['hourCycle']> = {
  auto: undefined,
  '12h': 'h12',
  '24h': 'h23',
};
