import { formatClockTime, formatSpeed, formatWatchTime } from '@/format';
import type { ScopeTimes } from '@/time-model';
import styles from './panel.css?inline';

export interface Panel {
  /** The element to place in YouTube's page. */
  element: HTMLElement;
  /** Shows the Video scope's times, or nothing while they aren't known. */
  showVideo(times: ScopeTimes | undefined, now: Date): void;
  /** Shows YouTube's speed, or hides the speed controls while it can't be reached. */
  showSpeed(speed: number | undefined): void;
}

/** How far − and + change speed, as YouTube's Shift+< and Shift+> do. */
const SPEED_STEP = 0.25;

/**
 * Chrono's Panel. It lives in a shadow root so YouTube's styles and Chrono's styles
 * can't affect each other. `setSpeed` is called with the speed the viewer asks for.
 */
export function createPanel(locale: string, setSpeed: (speed: number) => void): Panel {
  const element = document.createElement('section');
  element.setAttribute('aria-label', browser.i18n.getMessage('extShortName'));
  const style = document.createElement('style');
  style.textContent = styles;
  const remaining = create('span', 'remaining');
  const finish = create('span', 'finish');
  let currentSpeed = 1;
  const speedText = (speed: number) => browser.i18n.getMessage('speed', formatSpeed(speed, locale));
  const speedLabel = create('span', 'speed');
  // − and + are symbols, not words; their accessible names are translated.
  const slower = speedButton('−', 'slower', () => setSpeed(currentSpeed - SPEED_STEP));
  const faster = speedButton('+', 'faster', () => setSpeed(currentSpeed + SPEED_STEP));
  const speedControls = create('div', 'speed-controls');
  speedControls.append(slower, speedLabel, faster);
  const row = create('div', 'row');
  row.append(remaining, finish, speedControls);
  element.attachShadow({ mode: 'open' }).append(style, row);

  return {
    element,
    showVideo(times, now) {
      if (!times) {
        remaining.textContent = '';
        finish.textContent = '';
        return;
      }
      const left = formatWatchTime(times.remaining);
      remaining.textContent = browser.i18n.getMessage('remaining', [left, speedText(times.speed)]);
      finish.textContent = browser.i18n.getMessage('finishTime', formatClockTime(times.finishTime, now, locale));
    },
    showSpeed(speed) {
      speedControls.hidden = speed === undefined;
      if (speed === undefined) return;
      currentSpeed = speed;
      speedLabel.textContent = speedText(speed);
    },
  };
}

function create(tag: string, className: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  return element;
}

function speedButton(text: string, label: 'slower' | 'faster', onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.setAttribute('aria-label', browser.i18n.getMessage(label));
  button.addEventListener('click', onClick);
  return button;
}
