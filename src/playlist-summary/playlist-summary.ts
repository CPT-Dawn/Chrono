import { formatCount, formatHoursMinutes } from '@/format';
import { speedText } from '@/panel/scope-text';
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

  return {
    element,
    show({ contentTime, atSpeed, unavailable, partial }) {
      const parts = [browser.i18n.getMessage('playlistSummaryTotal', formatHoursMinutes(contentTime, locale))];
      if (atSpeed) {
        const watchTime = formatHoursMinutes(atSpeed.watchTime, locale);
        parts.push(browser.i18n.getMessage('playlistSummaryAtSpeed', [watchTime, speedText(atSpeed.speed, locale)]));
      }
      if (unavailable > 0) {
        parts.push(browser.i18n.getMessage('playlistSummaryUnavailable', formatCount(unavailable, locale)));
      }
      if (partial) {
        const message = partial.first ? 'playlistSummaryPartial' : 'playlistSummaryCounted';
        parts.push(browser.i18n.getMessage(message, [formatCount(partial.counted, locale), formatCount(partial.of, locale)]));
      }
      const summaryText = parts.reduce((joined, part) => browser.i18n.getMessage('playlistSummaryJoin', [joined, part]));
      // YouTube's page watches for changes; an unchanged line changes nothing.
      if (text.textContent !== summaryText) text.textContent = summaryText;
    },
  };
}
