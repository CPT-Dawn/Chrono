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

/** How long the old finish time takes to fade into the new one, in ms. */
const CROSSFADE = 150;
const EASE_STANDARD = 'cubic-bezier(0.2, 0, 0, 1)';

/**
 * Chrono's Player badge, " / ends 3:45 PM", for the player's own time display. It lives in
 * a shadow root so YouTube's player styles and Chrono's can't affect each other. It inherits
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
      // The player is busy while a video plays, so the badge changes only when its text does.
      if (text.textContent !== label) {
        const previous = element.hidden ? '' : (text.textContent ?? '');
        text.textContent = label;
        if (label) matchDurationColour(element);
        if (previous && label) crossfade(element, text, previous);
      }
      element.hidden = !label;
    },
  };
}

/**
 * Gives the `badge` the colour of the duration it follows. YouTube colours the duration a
 * little brighter than the element the badge inherits from, so inheriting alone would leave
 * the badge a shade dimmer than the time it continues.
 */
function matchDurationColour(badge: HTMLElement): void {
  const duration = badge.previousElementSibling;
  if (!duration) return;
  const { color } = getComputedStyle(duration);
  if (badge.style.color !== color) badge.style.color = color;
}

/**
 * Fades the badge's `previous` text out over its new text, which fades in, as the finish
 * time moves on a minute. Under reduced motion the text just changes.
 */
function crossfade(badge: HTMLElement, text: HTMLElement, previous: string): void {
  if (typeof badge.animate !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  badge.dataset.previous = previous;
  const timing = { duration: CROSSFADE, easing: EASE_STANDARD };
  text.animate({ opacity: [0, 1] }, timing);
  const fadeOut = badge.animate({ opacity: [1, 0] }, { ...timing, pseudoElement: '::before' });
  fadeOut.onfinish = fadeOut.oncancel = () => {
    if (badge.dataset.previous === previous) delete badge.dataset.previous;
  };
}
