import { OUTWARD_LINKS, type OutwardLink } from '@/links';
import type { Settings } from '@/settings';
import type { ChapterScope, PlaylistScope, ScopeTimes, Target, VideoScope } from '@/time-model';
import type { SidebarMount, Theme } from '@/youtube/adapter';
import { createChapterScope } from './chapter-scope';
import { create } from './dom';
import { createActionItem, createMenu } from './menu';
import { createPlaylistScope } from './playlist-scope';
import { speedText as writeSpeed, timesText } from './scope-text';
import { createSettingsMenu } from './settings-menu';
import { createSpeedTable } from './speed-table';
import { createTarget } from './target';
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
  /** Called with the playlist entry number the viewer chooses to count the Playlist scope up to. */
  setPlaylistTargetEntry(entry: number): void;
  /** Called with the target the viewer sets on a scope, or undefined when they clear it. */
  setTarget(scope: TargetScope, target: Target | undefined): void;
  /** Called with the link the viewer follows from the ⋮ menu. */
  openLink(link: OutwardLink): void;
}

export interface Panel {
  /** The element to place in YouTube's page. */
  element: HTMLElement;
  /** Shows the Video scope: its times, a quiet ad-break or live state, or nothing. */
  showVideo(scope: VideoScope, now: Date): void;
  /** Shows the Chapter scope, or nothing when the video has no chapters Chrono can read. */
  showChapter(scope: ChapterScope | undefined, now: Date): void;
  /** Shows the Playlist scope, a notice in its place, or nothing. */
  showPlaylist(scope: PlaylistScope, now: Date): void;
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

/** The scopes the viewer can set a target on. */
export type TargetScope = 'video' | 'chapter' | 'playlist';

/** How far − and + change speed, as YouTube's Shift+< and Shift+> do. */
const SPEED_STEP = 0.25;

/**
 * Chrono's Panel. It lives in a shadow root so YouTube's styles and Chrono's styles
 * can't affect each other.
 */
export function createPanel({
  locale,
  settings,
  setSpeed,
  changeSetting,
  setPlaylistTargetEntry,
  setTarget,
  openLink,
}: PanelOptions): Panel {
  const element = document.createElement('section');
  element.setAttribute('aria-label', browser.i18n.getMessage('extShortName'));
  const style = document.createElement('style');
  style.textContent = styles;

  const remaining = create('span', 'remaining');
  const finish = create('span', 'finish');
  const times = create('div', 'times');
  times.append(remaining, finish);

  let currentSpeed = 1;
  const speedText = (speed: number) => writeSpeed(speed, locale);
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
  const videoTarget = createTarget('video', 'videoTarget', locale, (target) => setTarget('video', target), setSpeed);
  const videoTable = createSpeedTable(locale, setSpeed);
  const chapterView = createChapterScope(locale, setSpeed, (target) => setTarget('chapter', target));
  const playlistView = createPlaylistScope(locale, setSpeed, setPlaylistTargetEntry, (target) =>
    setTarget('playlist', target),
  );
  details.append(videoTarget.element, videoTable.element, chapterView.element, playlistView.element);

  const toggle = create('button', 'icon-button toggle');
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
  const separator = create('div', 'menu-separator');
  separator.setAttribute('role', 'separator');
  const links = OUTWARD_LINKS.map(({ link, label }) =>
    createActionItem(browser.i18n.getMessage(label), () => {
      menu.close();
      openLink(link);
    }),
  );
  menu.popup.append(...settingsMenu.elements, separator, ...links);
  const header = create('div', 'header');
  header.append(title, menu.button, menu.popup);

  const panel = create('div', 'panel');
  panel.append(header, row, details);
  element.attachShadow({ mode: 'open' }).append(style, panel);

  /** The Video scope's latest times, for the details to show when they're expanded. */
  let videoTimes: { times: ScopeTimes; now: Date } | undefined;
  /** The Chapter scope's latest times, likewise. */
  let chapter: { scope: ChapterScope; now: Date } | undefined;
  /** The Playlist scope's latest state, likewise. */
  let shownPlaylist: { scope: PlaylistScope; now: Date } = { scope: { kind: 'none' }, now: new Date() };

  function render() {
    toggle.setAttribute('aria-expanded', String(settings.panelStartsExpanded));
    details.hidden = !settings.panelStartsExpanded;
    settingsMenu.show(settings);
    renderDetails();
  }

  // Collapsed details stay empty, so Chrono doesn't keep updating what nobody can see.
  function renderDetails() {
    renderVideoDetails();
    renderPlaylist();
  }

  function renderVideoDetails() {
    const shownVideo = settings.panelStartsExpanded ? videoTimes : undefined;
    videoTarget.show(shownVideo?.times, shownVideo?.now ?? new Date(), settings.clockFormat);
    videoTable.show(shownVideo?.times.speedTable ?? [], shownVideo?.now ?? new Date(), settings.clockFormat);
    const shownChapter = settings.panelStartsExpanded && settings.showChapterScope ? chapter : undefined;
    chapterView.show(shownChapter?.scope, shownChapter?.now ?? new Date(), settings.clockFormat);
  }

  function renderPlaylist() {
    const showPlaylist = settings.panelStartsExpanded && settings.showPlaylistScope;
    playlistView.show(showPlaylist ? shownPlaylist.scope : { kind: 'none' }, shownPlaylist.now, settings.clockFormat);
  }
  render();

  return {
    element,
    showVideo(scope, now) {
      // During an ad or on live content the speed table has nothing to show either.
      videoTimes = scope.kind === 'times' ? { times: scope.times, now } : undefined;
      renderVideoDetails();
      if (scope.kind !== 'times') {
        remaining.textContent = STATE_TEXT[scope.kind]();
        finish.textContent = '';
        return;
      }
      const { times } = scope;
      const text = timesText(times, now, locale, settings.clockFormat);
      remaining.textContent = text.remaining;
      finish.textContent = text.finish;
    },
    showPlaylist(scope, now) {
      shownPlaylist = { scope, now };
      renderPlaylist();
    },
    showChapter(scope, now) {
      chapter = scope && { scope, now };
      renderVideoDetails();
    },
    showSpeed(speed) {
      speedControls.hidden = speed === undefined;
      videoTarget.setEnabled(speed !== undefined);
      videoTable.setEnabled(speed !== undefined);
      chapterView.setEnabled(speed !== undefined);
      playlistView.setEnabled(speed !== undefined);
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
