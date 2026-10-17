// How every scope words its times, so the Video, Chapter and Playlist scopes and their
// speed tables all say them the same way.
import { formatClockTime, formatSpeed, formatWatchTime } from '@/format';
import type { ClockFormat } from '@/settings';
import type { TimesAtSpeed } from '@/time-model';

/** A speed as the Panel writes it, e.g. "1.5×". */
export function speedText(speed: number, locale: string): string {
  return browser.i18n.getMessage('speed', formatSpeed(speed, locale));
}

/** A scope's remaining and finish time, e.g. "12:30 left at 1.5×" and "ends 3:45 PM". */
export function timesText(
  { remaining, finishTime, speed }: TimesAtSpeed,
  now: Date,
  locale: string,
  clockFormat: ClockFormat,
): { remaining: string; finish: string } {
  return {
    remaining: browser.i18n.getMessage('remaining', [formatWatchTime(remaining), speedText(speed, locale)]),
    finish: browser.i18n.getMessage('finishTime', formatClockTime(finishTime, now, locale, clockFormat)),
  };
}
