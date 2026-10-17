import { formatClockTime, formatSpeed, formatWatchTime } from '@/format';
import type { Settings } from '@/settings';
import type { ChapterScope, ScopeTimes, VideoScope } from '@/time-model';
import type { SidebarMount, Theme } from '@/youtube/adapter';
import { createChapterScope } from './chapter-scope';
import { createMenu } from './menu';
import { createSettingsMenu } from './settings-menu';
import { createSpeedTable } from './speed-table';
import styles from './panel.css?inline';

export interface PanelOptions {
  locale: string;
  /** The viewer's settings when the Panel appears. Its details start expanded if they say so. */
  settings: Settings;
  /** Called with the speed the viewer asks for. */
  setSpeed(speed: number): void;
  /**
   * Called with a setting the viewer changes in the ⋮ menu, or by expanding or collapsing
   * the details, which turns "Panel starts expanded" on or off.
   */
  changeSetting<K extends keyof Settings>(key: K, value: Settings[K]): void;
}

export interface Panel {
  /** The element to place in YouTube's page. */
  element: HTMLElement;
  /** Shows the Video scope: its times, a quiet ad-break or live state, or nothing. */
  showVideo(scope: VideoScope, now: Date): void;
  /** Shows the Chapter scope, or nothing when the video has no chapters Chrono can read. */
  showChapter(scope: ChapterScope | undefined, now: Date): void;
  /** Switches to Chrono's colours for YouTube's theme. */
  setTheme(theme: Theme): void;
  /** Adjusts spacing for where the Panel sits in YouTube's layout. */
  setPlacement(placement: SidebarMount['placement']): void;
  /** Shows YouTube's speed, or hides the speed controls while it can't be reached. */
  showSpeed(speed: number | undefined): void;
  /**
   * Applies the viewer's settings when they change: the details expand or collapse at once,
   * and the next show call uses the rest.
   */
  setSettings(settings: Settings): void;
}

/** How far − and + change speed, as YouTube's Shift+< and Shift+> do. */
const SPEED_STEP = 0.25;

/**
 * Chrono's Panel. It lives in a shadow root so YouTube's styles and Chrono's styles
 * can't affect each other.
 */
export function createPanel({ locale, settings, setSpeed, changeSetting }: PanelOptions): Panel {
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
  const chapterView = createChapterScope(locale, setSpeed);
  details.append(videoTable.element, chapterView.element);

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
    settings = { ...settings, panelStartsExpanded: !settings.panelStartsExpanded };
    render();
    changeSetting('panelStartsExpanded', settings.panelStartsExpanded);
  });

  const title = create('span', 'title');
  title.textContent = browser.i18n.getMessage('extShortName');
  const menu = createMenu('menu', browser.i18n.getMessage('moreActions'));
  const settingsMenu = createSettingsMenu(changeSetting);
  menu.popup.append(...settingsMenu.elements);
  const header = create('div', 'header');
  header.append(title, menu.button, menu.popup);

  const panel = create('div', 'panel');
  panel.append(header, row, details);
  element.attachShadow({ mode: 'open' }).append(style, panel);

  /** The Video scope's latest times, for the details to show when they're expanded. */
  let videoTimes: { times: ScopeTimes; now: Date } | undefined;
  /** The Chapter scope's latest times, likewise. */
  let chapter: { scope: ChapterScope; now: Date } | undefined;

  function render() {
    toggle.setAttribute('aria-expanded', String(settings.panelStartsExpanded));
    details.hidden = !settings.panelStartsExpanded;
    settingsMenu.show(settings);
    renderDetails();
  }

  // Collapsed details stay empty, so Chrono doesn't keep updating what nobody can see.
  function renderDetails() {
    const rows = settings.panelStartsExpanded && videoTimes ? videoTimes.times.speedTable : [];
    videoTable.show(rows, videoTimes?.now ?? new Date(), settings.clockFormat);
    const shownChapter = settings.panelStartsExpanded && settings.showChapterScope ? chapter : undefined;
    chapterView.show(shownChapter?.scope, shownChapter?.now ?? new Date(), settings.clockFormat);
  }
  render();

  return {
    element,
    showVideo(scope, now) {
      // During an ad or on live content the speed table has nothing to show either.
      videoTimes = scope.kind === 'times' ? { times: scope.times, now } : undefined;
      renderDetails();
      if (scope.kind !== 'times') {
        remaining.textContent = STATE_TEXT[scope.kind]();
        finish.textContent = '';
        return;
      }
      const { times } = scope;
      const left = formatWatchTime(times.remaining);
      remaining.textContent = browser.i18n.getMessage('remaining', [left, speedText(times.speed)]);
      finish.textContent = browser.i18n.getMessage('finishTime', formatClockTime(times.finishTime, now, locale, settings.clockFormat));
    },
    showChapter(scope, now) {
      chapter = scope && { scope, now };
      renderDetails();
    },
    showSpeed(speed) {
      speedControls.hidden = speed === undefined;
      videoTable.setEnabled(speed !== undefined);
      chapterView.setEnabled(speed !== undefined);
      if (speed === undefined) return;
      currentSpeed = speed;
      speedLabel.textContent = speedText(speed);
    },
    setSettings(value) {
      settings = value;
      render();
    },
    setTheme(theme) {
      element.dataset.theme = theme;
    },
    setPlacement(placement) {
      element.dataset.placement = placement;
    },
  };
}

/** What the Video scope says when it has no times to show. */
const STATE_TEXT: Record<Exclude<VideoScope['kind'], 'times'>, () => string> = {
  'ad-break': () => browser.i18n.getMessage('pausedForAd'),
  live: () => browser.i18n.getMessage('live'),
  unknown: () => '',
};

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
