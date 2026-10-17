import { formatSpeed } from '@/format';
import type { PlaylistSummary } from '@/time-model';
import styles from './playlist-summary.css?inline';

export interface PlaylistSummaryLine {
  /** The element to place under the playlist's stats. */
  element: HTMLElement;
  show(summary: PlaylistSummary): void;
}

/**
 * The Playlist summary: one line in the style of YouTube's own stats, e.g. "4h 12m total ·
 * 2h 48m at 1.5× · 3 unavailable". It lives in a shadow root so YouTube's styles and
 * Chrono's can't affect each other, and takes its colour from the stats it sits in.
 */
export function createPlaylistSummary(locale: string): PlaylistSummaryLine {
  const element = document.createElement('div');
  element.setAttribute('role', 'note');
  element.setAttribute('aria-label', browser.i18n.getMessage('playlistSummary'));
  const root = element.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = styles;
  const text = document.createElement('span');
  root.append(style, text);

  const count = (n: number) => new Intl.NumberFormat(locale).format(n);
  const length = (seconds: number) => formatHoursMinutes(seconds, count);

  return {
    element,
    show({ contentTime, atSpeed, unavailable, partial }) {
      const parts = [browser.i18n.getMessage('playlistSummaryTotal', length(contentTime))];
      if (atSpeed) {
        const speed = browser.i18n.getMessage('speed', formatSpeed(atSpeed.speed, locale));
        parts.push(browser.i18n.getMessage('playlistSummaryAtSpeed', [length(atSpeed.watchTime), speed]));
      }
      if (unavailable > 0) parts.push(browser.i18n.getMessage('playlistSummaryUnavailable', count(unavailable)));
      if (partial) {
        parts.push(browser.i18n.getMessage('playlistSummaryPartial', [count(partial.counted), count(partial.of)]));
      }
      const line = parts.reduce((joined, part) => browser.i18n.getMessage('playlistSummaryJoin', [joined, part]));
      // YouTube's page watches for changes; an unchanged line changes nothing.
      if (text.textContent !== line) text.textContent = line;
    },
  };
}

/**
 * A long stretch of time to the nearest minute, as YouTube writes a playlist's length:
 * "4h 12m", "4h", "48m". Anything under a minute but not nothing is "1m".
 */
function formatHoursMinutes(seconds: number, count: (n: number) => string): string {
  const totalMinutes = seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : 0;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return browser.i18n.getMessage('minutes', count(minutes));
  if (minutes === 0) return browser.i18n.getMessage('hours', count(hours));
  return browser.i18n.getMessage('hoursMinutes', [count(hours), count(minutes)]);
}
