// Locale-aware formatting of times and speeds. Words around them come from messages.json.

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

/**
 * A clock time in the locale's style, e.g. "3:45 PM" or "15:45". When it falls on
 * another day than `now`, the day is named too: "Sun 12:20 AM".
 */
export function formatClockTime(time: Date, now: Date, locale: string): string {
  const sameDay = time.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(locale, {
    weekday: sameDay ? undefined : 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(time);
}
