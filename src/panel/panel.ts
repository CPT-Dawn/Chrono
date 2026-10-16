import { formatClockTime, formatSpeed, formatWatchTime } from '@/format';
import type { ScopeTimes } from '@/time-model';
import styles from './panel.css?inline';

export interface Panel {
  /** The element to place in YouTube's page. */
  element: HTMLElement;
  /** Shows the Video scope's times, or nothing while they aren't known. */
  showVideo(times: ScopeTimes | undefined, now: Date): void;
}

/**
 * Chrono's Panel. It lives in a shadow root so YouTube's styles and Chrono's styles
 * can't affect each other.
 */
export function createPanel(locale: string): Panel {
  const element = document.createElement('section');
  element.setAttribute('aria-label', browser.i18n.getMessage('extShortName'));
  const style = document.createElement('style');
  style.textContent = styles;
  const remaining = create('span', 'remaining');
  const finish = create('span', 'finish');
  const row = create('div', 'row');
  row.append(remaining, finish);
  element.attachShadow({ mode: 'open' }).append(style, row);

  return {
    element,
    showVideo(times, now) {
      if (!times) {
        remaining.textContent = '';
        finish.textContent = '';
        return;
      }
      const speed = browser.i18n.getMessage('speed', formatSpeed(times.speed, locale));
      remaining.textContent = browser.i18n.getMessage('remaining', [formatWatchTime(times.remaining), speed]);
      finish.textContent = browser.i18n.getMessage('finishTime', formatClockTime(times.finishTime, now, locale));
    },
  };
}

function create(tag: string, className: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  return element;
}
