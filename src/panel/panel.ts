import { formatClockTime, formatSpeed, formatWatchTime } from '@/format';
import type { ScopeTimes } from '@/time-model';
import type { SidebarMount, Theme } from '@/youtube/adapter';
import { createMenu } from './menu';
import { createSpeedTable } from './speed-table';
import styles from './panel.css?inline';

export interface PanelOptions {
  locale: string;
  /** Whether the details start expanded. */
  expanded: boolean;
  /** Called when the viewer expands or collapses the details. */
  onExpandedChange(expanded: boolean): void;
  /** Called with the speed the viewer asks for. */
  setSpeed(speed: number): void;
}

export interface Panel {
  /** The element to place in YouTube's page. */
  element: HTMLElement;
  /** Shows the Video scope's times, or nothing while they aren't known. */
  showVideo(times: ScopeTimes | undefined, now: Date): void;
  /** Switches to Chrono's colours for YouTube's theme. */
  setTheme(theme: Theme): void;
  /** Adjusts spacing for where the Panel sits in YouTube's layout. */
  setPlacement(placement: SidebarMount['placement']): void;
  /** Shows YouTube's speed, or hides the speed controls while it can't be reached. */
  showSpeed(speed: number | undefined): void;
}

/** How far − and + change speed, as YouTube's Shift+< and Shift+> do. */
const SPEED_STEP = 0.25;

/**
 * Chrono's Panel. It lives in a shadow root so YouTube's styles and Chrono's styles
 * can't affect each other.
 */
export function createPanel({ locale, expanded, onExpandedChange, setSpeed }: PanelOptions): Panel {
  const element = document.createElement('section');
  element.setAttribute('aria-label', browser.i18n.getMessage('extShortName'));
  const style = document.createElement('style');
  style.textContent = styles;

  const remaining = create('span', 'remaining');
  const finish = create('span', 'finish');
  const times = create('div', 'times');
  times.append(remaining, finish);

  let currentSpeed = 1;
  const speedText = (speed: number) => browser.i18n.getMessage('speed', formatSpeed(speed, locale));
  const speedLabel = create('span', 'speed');
  // − and + are symbols, not words; their accessible names are translated.
  const slower = speedButton('−', 'slower', () => setSpeed(currentSpeed - SPEED_STEP));
  const faster = speedButton('+', 'faster', () => setSpeed(currentSpeed + SPEED_STEP));
  const speedControls = create('div', 'speed-controls');
  speedControls.append(slower, speedLabel, faster);

  const details = create('div', 'details');
  details.id = 'details';
  details.setAttribute('role', 'region');
  details.setAttribute('aria-label', browser.i18n.getMessage('details'));
  const videoTable = createSpeedTable(locale, setSpeed);
  details.append(videoTable.element);

  const toggle = create('button', 'icon-button toggle') as HTMLButtonElement;
  toggle.type = 'button';
  toggle.setAttribute('aria-label', browser.i18n.getMessage('details'));
  toggle.setAttribute('aria-controls', details.id);
  toggle.innerHTML = CHEVRON;

  // The whole row expands and collapses, like YouTube's description box. The toggle
  // button is what keyboards and screen readers use.
  const row = create('div', 'row');
  row.append(times, speedControls, toggle);
  row.addEventListener('click', () => {
    expanded = !expanded;
    render();
    onExpandedChange(expanded);
  });

  const title = create('span', 'title');
  title.textContent = browser.i18n.getMessage('extShortName');
  const menu = createMenu('menu', browser.i18n.getMessage('moreActions'));
  const header = create('div', 'header');
  header.append(title, menu.button, menu.popup);

  const panel = create('div', 'panel');
  panel.append(header, row, details);
  element.attachShadow({ mode: 'open' }).append(style, panel);

  /** The Video scope's latest times, for the details to show when they're expanded. */
  let video: { times: ScopeTimes; now: Date } | undefined;

  function render() {
    toggle.setAttribute('aria-expanded', String(expanded));
    details.hidden = !expanded;
    renderDetails();
  }

  // Collapsed details stay empty, so Chrono doesn't keep updating what nobody can see.
  function renderDetails() {
    videoTable.show(expanded && video ? video.times.speedTable : [], video?.now ?? new Date());
  }
  render();

  return {
    element,
    showVideo(times, now) {
      video = times && { times, now };
      renderDetails();
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
      videoTable.setEnabled(speed !== undefined);
      if (speed === undefined) return;
      currentSpeed = speed;
      speedLabel.textContent = speedText(speed);
    },
    setTheme(theme) {
      element.dataset.theme = theme;
    },
    setPlacement(placement) {
      element.dataset.placement = placement;
    },
  };
}

const CHEVRON =
  '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">' +
  '<path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
  '</svg>';

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
  button.className = 'icon-button';
  button.addEventListener('click', (event) => {
    // The rest of the row expands and collapses the details.
    event.stopPropagation();
    onClick();
  });
  return button;
}
