import { formatClockTime } from '@/format';
import type { ClockFormat } from '@/settings';
import type { VideoScope } from '@/time-model';
import styles from './player-badge.css?inline';

export interface PlayerBadge {
  /** The element to place in the player's time display. */
  element: HTMLElement;
  /**
   * Shows the Video scope's finish time, or hides the badge while the scope has none: during
   * an ad break, on live content, and while the video's times aren't known.
   */
  show(scope: VideoScope, now: Date, clockFormat: ClockFormat): void;
}

/**
 * Chrono's Player badge, "· ends 3:45 PM", for the player's own time display. It lives in a
 * shadow root so YouTube's player styles and Chrono's can't affect each other. It inherits
 * the time display's font and colour, so it reads as part of it.
 */
export function createPlayerBadge(locale: string): PlayerBadge {
  const element = document.createElement('span');
  const style = document.createElement('style');
  style.textContent = styles;
  const text = document.createElement('span');
  text.className = 'text';
  element.attachShadow({ mode: 'open' }).append(style, text);
  element.hidden = true;

  return {
    element,
    show(scope, now, clockFormat) {
      const label =
        scope.kind === 'times'
          ? browser.i18n.getMessage(
              'playerBadgeFinishTime',
              formatClockTime(scope.times.finishTime, now, locale, clockFormat),
            )
          : '';
      element.hidden = !label;
      // The player is busy while a video plays, so the badge changes only when its text does.
      if (text.textContent !== label) text.textContent = label;
    },
  };
}
