import { CHEVRON, createIcon, LINK_ICONS, MARK, MINUS, PLUS } from '@/icons';
import { OUTWARD_LINKS, type OutwardLink } from '@/links';
import type { Settings } from '@/settings';
import type { ChapterScope, PlaylistScope, ScopeTimes, Target, VideoScope } from '@/time-model';
import type { SidebarMount, Theme } from '@/youtube/adapter';
import { createChapterScope } from './chapter-scope';
import { create, createProgress, EASE, isLaidOut, playMotion, prefersLessMotion } from './dom';
import { createActionItem, createMenu } from './menu';
import { createPlaylistScope } from './playlist-scope';
import { createRollingText } from './roll';
import { speedText } from './scope-text';
import { createSettingsMenu, separator } from './settings-menu';
import { createSpeedTable } from './speed-table';
import { createTarget, type TargetScope } from './target';
import { createTimes } from './times';
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

/** How far − and + change speed, as YouTube's Shift+< and Shift+> do. */
const SPEED_STEP = 0.25;

/** How long the details take to collapse, in milliseconds. panel.css times the same. */
const COLLAPSE = 200;

/** Whether the mark in the ⋮ menu's header has had its one sweep in this page session. */
let markSwept = false;

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

  // The row: the answer first, then the controls, as YouTube's description box leads with
  // its text. Its finish line runs under the controls, so narrow sidebars don't wrap it.
  const times = createTimes(locale);

  let currentSpeed = 1;
  const speedLabel = create('span', 'speed');
  const speedReadout = createRollingText(speedLabel);
  // − and + are icons, not words; their accessible names are translated.
  const slower = speedButton(MINUS, 'slower', () => setSpeed(currentSpeed - SPEED_STEP));
  const faster = speedButton(PLUS, 'faster', () => setSpeed(currentSpeed + SPEED_STEP));
  const speedControls = create('div', 'speed-controls');
  speedControls.append(slower, speedLabel, faster);

  const details = create('div', 'details');
  details.id = 'details';
  details.setAttribute('role', 'region');
  details.setAttribute('aria-label', browser.i18n.getMessage('details'));
  const detailsFrame = create('div', 'details-frame');
  detailsFrame.append(details);
  const videoTarget = createTarget('video', locale, (target) => setTarget('video', target), setSpeed);
  const videoTable = createSpeedTable(locale, setSpeed);
  const videoSection = create('div', 'scope');
  videoSection.dataset.scope = 'video';
  videoSection.append(videoTarget.element, videoTable.element);
  const chapterView = createChapterScope(locale, setSpeed, (target) => setTarget('chapter', target));
  const playlistView = createPlaylistScope(locale, setSpeed, setPlaylistTargetEntry, (target) =>
    setTarget('playlist', target),
  );
  details.append(videoSection, chapterView.element, playlistView.element);

  const toggle = create('button', 'icon-button toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-label', browser.i18n.getMessage('details'));
  toggle.setAttribute('aria-controls', details.id);
  toggle.append(createIcon(CHEVRON));

  const menu = createMenu('menu', browser.i18n.getMessage('moreActions'));
  menu.button.classList.add('menu-button');
  const header = create('div', 'menu-header');
  // The brand appears here once; the menu itself is named for what it holds.
  header.setAttribute('aria-hidden', 'true');
  const mark = createIcon(MARK);
  header.append(mark, browser.i18n.getMessage('extShortName'));
  const settingsMenu = createSettingsMenu(changeSetting);
  const links = OUTWARD_LINKS.map(({ link, label }) =>
    createActionItem(
      browser.i18n.getMessage(label),
      () => {
        menu.close();
        openLink(link);
      },
      LINK_ICONS[link],
    ),
  );
  menu.popup.append(header, separator(), ...settingsMenu.elements, separator(), ...links);
  menu.onOpen(() => {
    if (markSwept) return;
    markSwept = sweepMark(mark);
  });

  // The whole row expands and collapses, like YouTube's description box. The toggle
  // button is what keyboards and screen readers use.
  const progress = createProgress();
  const row = create('div', 'row');
  row.append(times.element, speedControls, toggle, menu.button, progress.element);
  row.addEventListener('click', () => {
    settings = { ...settings, panelStartsExpanded: !settings.panelStartsExpanded };
    render({ animate: true });
    changeSetting('panelStartsExpanded', settings.panelStartsExpanded);
  });

  const panel = create('div', 'panel');
  panel.append(row, detailsFrame, menu.popup);
  element.attachShadow({ mode: 'open' }).append(style, panel);
  // YouTube's page-wide shortcuts see a key pressed in the shadow root as pressed on the
  // Panel itself, not in a field, so typing "3" would seek and Space would pause. Keys
  // pressed in the Panel, its ⋮ menu included, are the Panel's alone; its own handlers have
  // run by the time they bubble here, Escape in the menu among them.
  for (const type of ['keydown', 'keypress', 'keyup']) {
    element.addEventListener(type, (event) => event.stopPropagation());
  }

  /** The Video scope's latest times, for the details to show when they're expanded. */
  let videoTimes: { times: ScopeTimes; now: Date } | undefined;
  /** The Chapter scope's latest times, likewise. */
  let chapter: { scope: ChapterScope; now: Date } | undefined;
  /** The Playlist scope's latest state, likewise. */
  let shownPlaylist: { scope: PlaylistScope; now: Date } = { scope: { kind: 'none' }, now: new Date() };
  /**
   * Whether the details show their scopes. They keep showing them while they collapse, and
   * are emptied once they have, so Chrono doesn't keep updating what nobody can see.
   */
  let detailsShown = false;
  let collapsing: ReturnType<typeof setTimeout> | undefined;

  function render({ animate = false } = {}) {
    const expanded = settings.panelStartsExpanded;
    toggle.setAttribute('aria-expanded', String(expanded));
    settingsMenu.show(settings);
    clearTimeout(collapsing);
    collapsing = undefined;
    const motion = animate && !prefersLessMotion();
    if (expanded) {
      const opening = motion && (detailsFrame.hidden || detailsFrame.dataset.open !== 'true');
      detailsFrame.hidden = false;
      detailsFrame.inert = false;
      details.removeAttribute('aria-hidden');
      detailsShown = true;
      renderDetails();
      if (opening) {
        // The frame grows from nothing to the details' height, and each scope fades and
        // rises in a moment after the one above it.
        detailsFrame.dataset.open = 'false';
        void detailsFrame.offsetHeight;
        const sections = [...details.children].filter((section) => !(section as HTMLElement).hidden);
        sections.forEach((section, i) => {
          playMotion(section, [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], {
            duration: 150,
            delay: 60 + i * 30,
            easing: EASE.decelerate,
          });
        });
      }
      detailsFrame.dataset.open = 'true';
    } else if (motion && !detailsFrame.hidden && isLaidOut(detailsFrame)) {
      // It shrinks away, out of reach while it does.
      detailsFrame.dataset.open = 'false';
      detailsFrame.inert = true;
      details.setAttribute('aria-hidden', 'true');
      collapsing = setTimeout(finishCollapsing, COLLAPSE);
    } else {
      finishCollapsing();
    }
  }

  function finishCollapsing() {
    collapsing = undefined;
    detailsFrame.dataset.open = 'false';
    detailsFrame.hidden = true;
    detailsFrame.inert = false;
    details.removeAttribute('aria-hidden');
    detailsShown = false;
    renderDetails();
  }

  function renderDetails() {
    renderVideoDetails();
    renderPlaylist();
  }

  function renderVideoDetails() {
    const shownVideo = detailsShown ? videoTimes : undefined;
    videoTarget.show(shownVideo?.times, shownVideo?.now ?? new Date(), settings.clockFormat);
    videoTable.show(shownVideo?.times.speedTable ?? [], shownVideo?.now ?? new Date(), settings.clockFormat);
    videoSection.hidden = !shownVideo;
    const shownChapter = detailsShown && settings.showChapterScope ? chapter : undefined;
    chapterView.show(shownChapter?.scope, shownChapter?.now ?? new Date(), settings.clockFormat);
  }

  function renderPlaylist() {
    const showPlaylist = detailsShown && settings.showPlaylistScope;
    playlistView.show(showPlaylist ? shownPlaylist.scope : { kind: 'none' }, shownPlaylist.now, settings.clockFormat);
  }
  render();

  return {
    element,
    showVideo(scope, now) {
      // During an ad or on live content the speed table has nothing to show either.
      videoTimes = scope.kind === 'times' ? { times: scope.times, now } : undefined;
      renderVideoDetails();
      // Live and ad breaks get their own look; with no times the progress bar has nothing to show.
      panel.dataset.state = scope.kind;
      progress.show(scope.kind === 'times' ? scope.times.progress : undefined);
      if (scope.kind === 'times') times.show(scope.times, now, settings.clockFormat, true);
      else times.showState(STATE_TEXT[scope.kind]());
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
      // A new speed rolls in: up when it's faster, down when it's slower.
      speedReadout.set(speedText(speed, locale), speed > currentSpeed ? 1 : -1);
      currentSpeed = speed;
    },
    setSettings(value) {
      settings = value;
      render({ animate: true });
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

function speedButton(icon: string, label: 'slower' | 'faster', onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.append(createIcon(icon));
  button.setAttribute('aria-label', browser.i18n.getMessage(label));
  button.className = 'icon-button';
  button.addEventListener('click', (event) => {
    // The rest of the row expands and collapses the details.
    event.stopPropagation();
    onClick();
  });
  return button;
}

/**
 * Chrono's one brand moment: the playhead travels once round the mark's ring, drawing it,
 * to where it rests. Returns whether it played.
 */
function sweepMark(mark: SVGSVGElement): boolean {
  const ring = mark.querySelector<SVGPathElement>('.mark-ring');
  const playhead = mark.querySelector<SVGCircleElement>('.mark-playhead');
  if (!ring || !playhead) return false;
  // The ring runs 300° clockwise from twelve; the playhead sits at its end.
  ring.setAttribute('pathLength', '1');
  ring.style.strokeDasharray = '1 1';
  playhead.style.transformOrigin = '12px 12px';
  const options = { duration: 900, easing: EASE.decelerate, delay: 100 };
  const drawn = playMotion(ring, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], options);
  const moved = playMotion(playhead, [{ transform: 'rotate(-300deg)' }, { transform: 'none' }], options);
  return drawn !== undefined || moved !== undefined;
}
