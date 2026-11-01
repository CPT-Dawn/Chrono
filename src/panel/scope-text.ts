// How every scope words its times, so the Video, Chapter and Playlist scopes and their
// speed tables all say them the same way.
import { formatClockTime, formatSpeed, formatWatchTime } from '@/format';
import type { ClockFormat } from '@/settings';
import type { TimesAtSpeed } from '@/time-model';

/** A speed as the Panel writes it, e.g. "1.5×". */
export function speedText(speed: number, locale: string): string {
  return browser.i18n.getMessage('speed', formatSpeed(speed, locale));
}

/**
 * A scope's remaining and finish time, e.g. "12:30 left" and "Ends 3:45 PM". With
 * `withSpeed`, the finish line also names the speed both assume: "Ends 3:45 PM · at 1.5×".
 */
export function timesText(
  { remaining, finishTime, speed }: TimesAtSpeed,
  now: Date,
  locale: string,
  clockFormat: ClockFormat,
  withSpeed = false,
): { remaining: string; finish: string } {
  const clock = formatClockTime(finishTime, now, locale, clockFormat);
  return {
    remaining: browser.i18n.getMessage('remaining', formatWatchTime(remaining)),
    finish: withSpeed
      ? browser.i18n.getMessage('finishTimeAtSpeed', [clock, speedText(speed, locale)])
      : browser.i18n.getMessage('finishTime', clock),
  };
}
