// The YouTube side of Seam 1: a saved YouTube page loaded into happy-dom, with a video
// element that behaves like a real one under Vitest's fake clock. Also what YouTube and the
// browser do around the page: YouTube's navigation without a reload, and the tab's
// visibility.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';
import { settle } from './chrono';

/** The browser hides or shows the tab, as when the viewer switches tabs. */
export function setTabVisibility(state: DocumentVisibilityState): void {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(state === 'hidden');
  document.dispatchEvent(new Event('visibilitychange'));
}

export interface SavedPage {
  /** The page's main video, driven the way YouTube's player drives it. */
  readonly video: FakeVideo;
  /** YouTube's player, whose speed API is faked unless the page opened without one. */
  readonly player: FakePlayer;
  /** YouTube's sidebar column on a watch page. */
  readonly sidebar: Element;
  /** YouTube's related videos, which sit in the sidebar or below the video. */
  readonly related: Element;
  /**
   * Lays the watch page out as YouTube does for the window's width: the video and sidebar
   * side by side, or (in a narrow window) one column with the sidebar's contents below
   * the video.
   */
  setLayout(layout: 'two-columns' | 'one-column'): void;
  /** Switches YouTube's theme, as its Appearance menu does. */
  setTheme(theme: 'light' | 'dark'): void;
  /**
   * Takes an element out of the page, as if YouTube hadn't rendered it yet.
   * Returns a function that puts it back where it was.
   */
  withhold(element: Element): () => void;
  /**
   * Moves YouTube's player, video and all, into the miniplayer or back into the watch
   * page. In Oct 2026 Chrome did this when the viewer left a playing video (Firefox
   * emptied the video instead), and again when the viewer expanded the miniplayer.
   */
  movePlayer(to: 'miniplayer' | 'watch-page'): void;
  /** YouTube replaces its video element with a new one, which becomes `video`. */
  replaceVideo(): FakeVideo;
  /** YouTube's player's ads module, which it adds once the player first prepares for ads. */
  readonly ads: Element;
  /** YouTube's player's time display, which it flags on live content. */
  readonly timeDisplay: Element;
  /**
   * YouTube starts an ad break: it flags its player and renders the ad's overlay. The ad
   * plays in the same video element, which the test loads with the ad.
   */
  startAdBreak(): void;
  /** YouTube ends the ad break. It hides the ad's overlay rather than removing it. */
  endAdBreak(): void;
  /**
   * Lays a playlist page out as YouTube's styles do for the window's width: its header in
   * a column beside the list, or (in a narrow window) above it. YouTube renders both
   * headers and its styles hide one. The browser fires `resize` as the window crosses
   * YouTube's breakpoint. Saved playlist pages open laid out wide.
   */
  setPlaylistLayout(layout: 'wide' | 'narrow'): void;
  /**
   * YouTube loads more entries into a playlist page's list, as it does when the viewer
   * scrolls to its end: the next `count` (or all the rest) of the entries saved in
   * `tests/pages/<name>.html`. After the last load, YouTube removes the list's continuation.
   */
  loadMoreEntries(name: string, options?: { count?: number; last?: boolean }): void;
}

export interface PageOptions {
  /** Whether YouTube's player exposes the speed API Chrono knows. Defaults to true. */
  playerApi?: boolean;
}

/** Loads `tests/pages/<name>.html` as the current document, at `url`. */
export function openSavedPage(name: string, url: string, options: PageOptions = {}): SavedPage {
  history.replaceState(null, '', url);
  return renderSavedPage(name, options);
}

/**
 * Replaces the whole page with `tests/pages/<name>.html` and keeps the address, as if
 * YouTube had rendered the page from scratch.
 */
export function renderSavedPage(name: string, { playerApi = true }: PageOptions = {}): SavedPage {
  const saved = parseSavedPage(name);
  document.documentElement.remove();
  document.appendChild(document.importNode(saved.documentElement, true));
  if (document.querySelector(PLAYLIST_PAGE)) setPlaylistLayout('wide');

  // Pages other than watch pages have no watch page, or only a hidden one.
  const player = document.querySelector('ytd-watch-flexy #movie_player');
  const playerHome = player?.parentElement;
  const sidebar = document.querySelector('ytd-watch-flexy #secondary-inner');
  const videoElement = player?.querySelector('video');
  let video = videoElement && new FakeVideo(videoElement);
  const fakePlayer = player && new FakePlayer(player, () => fromWatchPage(video), playerApi);
  /** How many of each saved page's entries YouTube has loaded into a playlist page so far. */
  const entriesLoaded = new Map<string, number>();
  /** A part of the watch page, or an error for a saved page without one. */
  const fromWatchPage = <T>(part: T | null | undefined): T => {
    if (!part) throw new Error(`Saved page ${name} has no watch page`);
    return part;
  };
  return {
    get video() {
      return fromWatchPage(video);
    },
    get player() {
      return fromWatchPage(fakePlayer);
    },
    get sidebar() {
      return fromWatchPage(sidebar);
    },
    get related() {
      return required('ytd-watch-flexy #related');
    },
    setLayout,
    setTheme(theme) {
      document.documentElement.toggleAttribute('dark', theme === 'dark');
    },
    withhold(element) {
      const parent = element.parentNode!;
      const next = element.nextSibling;
      element.remove();
      return () => parent.insertBefore(element, next);
    },
    movePlayer(to) {
      (to === 'miniplayer' ? required('ytd-miniplayer') : fromWatchPage(playerHome)).append(fromWatchPage(player));
    },
    get ads() {
      return required('ytd-watch-flexy #movie_player .video-ads');
    },
    get timeDisplay() {
      return required('ytd-watch-flexy #movie_player .ytp-time-display');
    },
    startAdBreak() {
      const playerElement = fromWatchPage(player);
      let ads = playerElement.querySelector('.video-ads');
      if (!ads) {
        ads = document.createElement('div');
        ads.className = 'video-ads ytp-ad-module';
        playerElement.append(ads);
      }
      ads.innerHTML = AD_OVERLAY;
      playerElement.classList.add('ad-showing', 'ad-interrupting');
    },
    endAdBreak() {
      const playerElement = fromWatchPage(player);
      playerElement.classList.remove('ad-showing', 'ad-interrupting');
      for (const overlay of playerElement.querySelectorAll<HTMLElement>('.video-ads > *')) overlay.style.display = 'none';
    },
    replaceVideo() {
      const replaced = fromWatchPage(video).element;
      const element = document.createElement('video');
      for (const { name, value } of replaced.attributes) element.setAttribute(name, value);
      replaced.replaceWith(element);
      video = new FakeVideo(element);
      return video;
    },
    setPlaylistLayout,
    loadMoreEntries(fragment, { count, last = false } = {}) {
      // The list's continuation, in either design. A lockup list wraps it, as each entry.
      const continuation =
        document.querySelector(`${PLAYLIST_PAGE} ytd-playlist-video-list-renderer > #contents > ytd-continuation-item-renderer`) ??
        required(`${PLAYLIST_PAGE} yt-item-section-renderer > #contents > * > yt-continuation-item-view-model`).parentElement!;
      const saved = [...parseSavedPage(fragment).body.children].map((element) => document.importNode(element, true));
      // After a lockup list's entries, the saved page has the section YouTube loads below it.
      const sections = saved.filter((element) => element.localName === 'yt-item-section-renderer');
      const from = entriesLoaded.get(fragment) ?? 0;
      const to = count === undefined ? undefined : from + count;
      const entries = saved.filter((element) => !sections.includes(element)).slice(from, to);
      entriesLoaded.set(fragment, from + entries.length);
      continuation.before(...entries);
      if (!last) return;
      const listSection = continuation.closest('yt-item-section-renderer');
      continuation.remove();
      if (listSection && sections.length > 0) {
        listSection.after(...sections);
        // YouTube has loaded the section its section list's continuation was for.
        listSection.parentElement!.querySelector(':scope > yt-continuation-item-view-model')?.remove();
      }
    },
  };
}

function parseSavedPage(name: string): Document {
  const html = readFileSync(join(import.meta.dirname, `../pages/${name}.html`), 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}

const PLAYLIST_PAGE = 'ytd-browse[page-subtype="playlist"]';

// Where YouTube's playlist page header is in each layout, measured on youtube.com in Oct
// 2026: beside the list from about 1100px wide, above it in narrower windows.
const PLAYLIST_HEADERS = {
  wide: `${PLAYLIST_PAGE} > yt-page-header-renderer`,
  narrow: `${PLAYLIST_PAGE} > #header`,
};

function setPlaylistLayout(layout: 'wide' | 'narrow'): void {
  for (const [headerLayout, selector] of Object.entries(PLAYLIST_HEADERS)) {
    required<HTMLElement>(selector).style.display = headerLayout === layout ? '' : 'none';
  }
  window.dispatchEvent(new Event('resize'));
}

/** An ad's overlay, as YouTube's player script built it in Oct 2026 (player 0229cd64). */
const AD_OVERLAY =
  '<div class="ytp-ad-player-overlay-layout">' +
  '<div class="ytp-ad-player-overlay-layout__player-card-container"></div>' +
  '<div class="ytp-ad-player-overlay-layout__ad-info-container"></div>' +
  '<div class="ytp-ad-player-overlay-layout__skip-or-preview-container"></div>' +
  '</div>';

/**
 * YouTube starts following a link without a reload: it fires yt-navigate-start, then
 * changes the address. It renders the new page and loads its video after that.
 */
export async function startNavigation(url: string): Promise<void> {
  fireNavigationEvent('yt-navigate-start');
  await settle();
  history.pushState(null, '', url);
  await settle();
}

/** YouTube has rendered the page it navigated to, and fires yt-navigate-finish. */
export async function finishNavigation(): Promise<void> {
  fireNavigationEvent('yt-navigate-finish');
  await settle();
}

/** A whole navigation without a reload, during which YouTube changes nothing on the page. */
export async function navigate(url: string): Promise<void> {
  await startNavigation(url);
  await finishNavigation();
}

// YouTube fires its navigation events on its app element, and they bubble up.
function fireNavigationEvent(type: string): void {
  const app = document.querySelector('ytd-app') ?? document;
  app.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true }));
}

// What YouTube did on youtube.com in Oct 2026 when the window crossed its two-column
// breakpoint: it flipped the attribute and moved these blocks in the same task.
const SIDEBAR_BLOCKS = {
  'two-columns': ['#panels', '#chat-container', '#playlist', '#inline-panels'],
  'one-column': ['#playlist', '#panels', '#chat-container', '#inline-panels'],
};

function setLayout(layout: 'two-columns' | 'one-column'): void {
  const flexy = required('ytd-watch-flexy');
  const blocks = SIDEBAR_BLOCKS[layout].map((id) => required(`ytd-watch-flexy ${id}`));
  const related = required('ytd-watch-flexy #related');
  flexy.toggleAttribute('is-two-columns_', layout === 'two-columns');
  if (layout === 'one-column') {
    required('ytd-watch-flexy #below > #shopping-timely-shelf').after(...blocks);
    required('ytd-watch-flexy #below > .box').prepend(related);
  } else {
    required('ytd-watch-flexy #secondary-inner > #persistent-panel-container').before(...blocks);
    required('ytd-watch-flexy #secondary-inner').append(related);
  }
}

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Saved page has no ${selector}`);
  return element;
}

/** How often a playing video fires `timeupdate`, as in Chrome and Firefox. */
const TIMEUPDATE_MS = 250;

interface Listener {
  type: string;
  listener: EventListenerOrEventListenerObject;
  capture: boolean;
}

function usesCapture(options?: boolean | EventListenerOptions): boolean {
  return typeof options === 'boolean' ? options : Boolean(options?.capture);
}

let sourceCount = 0;

/** A source like the ones YouTube's player gives its video element, one per video it loads. */
function nextSource(): string {
  sourceCount += 1;
  return `blob:https://www.youtube.com/00000000-0000-4000-8000-${String(sourceCount).padStart(12, '0')}`;
}

/**
 * A video element whose length, position and speed the test controls. Setting them fires
 * the same events a browser fires, and while playing the position advances with the
 * (fake) clock.
 */
export class FakeVideo {
  #source = nextSource();
  #duration = NaN;
  #position = 0;
  #speed = 1;
  #paused = true;
  #ticker: ReturnType<typeof setInterval> | undefined;

  /** The element's event listeners, as the browser keeps them: one per type, listener and phase. */
  #listeners: Listener[] = [];

  constructor(readonly element: HTMLVideoElement) {
    const video = this;
    const addEventListener = element.addEventListener.bind(element);
    const removeEventListener = element.removeEventListener.bind(element);
    Object.defineProperties(element, {
      addEventListener: {
        configurable: true,
        value(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
          // A browser ignores a null listener.
          if (!listener) return;
          addEventListener(type, listener, options);
          const signal = typeof options === 'object' ? options.signal : undefined;
          if (signal?.aborted) return;
          const entry = { type, listener, capture: usesCapture(options) };
          if (video.#indexOf(entry) === -1) video.#listeners.push(entry);
          signal?.addEventListener('abort', () => video.#forget(entry));
        },
      },
      removeEventListener: {
        configurable: true,
        value(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
          if (!listener) return;
          removeEventListener(type, listener, options);
          video.#forget({ type, listener, capture: usesCapture(options) });
        },
      },
      src: { configurable: true, get: () => video.#source },
      duration: { configurable: true, get: () => video.#duration },
      paused: { configurable: true, get: () => video.#paused },
      currentTime: {
        configurable: true,
        get: () => video.#position,
        set(value: number) {
          video.#position = value;
          video.#fire('seeking', 'seeked', 'timeupdate');
        },
      },
      playbackRate: {
        configurable: true,
        get: () => video.#speed,
        set(value: number) {
          video.#speed = value;
          video.#fire('ratechange');
        },
      },
      play: { configurable: true, value: () => Promise.resolve(video.play()) },
      pause: { configurable: true, value: () => video.pause() },
    });
  }

  /**
   * YouTube starts loading another video into this element, as it does when it navigates
   * to the next video. As in a browser, the element gets a new source and pauses, and its
   * position and length reset until the new video's metadata loads.
   */
  startLoading(): void {
    clearInterval(this.#ticker);
    this.#paused = true;
    this.#source = nextSource();
    this.#position = 0;
    this.#duration = NaN;
    this.#fire('emptied', 'loadstart');
  }

  /** The video's metadata has loaded, so its length is known. */
  load({ duration }: { duration: number }): void {
    this.#duration = duration;
    this.#fire('loadedmetadata', 'durationchange');
  }

  seek(position: number): void {
    this.element.currentTime = position;
  }

  setSpeed(speed: number): void {
    this.element.playbackRate = speed;
  }

  play(): void {
    if (!this.#paused) return;
    this.#paused = false;
    this.#fire('play', 'playing');
    this.#ticker = setInterval(() => {
      this.#position = Math.min(this.#duration, this.#position + (TIMEUPDATE_MS / 1000) * this.#speed);
      this.#fire('timeupdate');
      if (this.#position >= this.#duration) {
        this.pause();
        this.#fire('ended');
      }
    }, TIMEUPDATE_MS);
  }

  pause(): void {
    if (this.#paused) return;
    this.#paused = true;
    clearInterval(this.#ticker);
    this.#fire('pause');
  }

  /**
   * How many event listeners the element has, as the browser's developer tools would list
   * them. The viewer can't see this; tests use it to check Chrono stops listening to a
   * video it no longer describes.
   */
  get listenerCount(): number {
    return this.#listeners.length;
  }

  #indexOf({ type, listener, capture }: Listener): number {
    return this.#listeners.findIndex((l) => l.type === type && l.listener === listener && l.capture === capture);
  }

  #forget(entry: Listener): void {
    const index = this.#indexOf(entry);
    if (index !== -1) this.#listeners.splice(index, 1);
  }

  #fire(...types: string[]): void {
    for (const type of types) this.element.dispatchEvent(new Event(type));
  }
}

/**
 * YouTube's player element and the part of its API that reads and sets speed. Like
 * YouTube's, it applies its speed to the video element.
 */
export class FakePlayer {
  #speed = 1;

  constructor(
    readonly element: Element,
    private readonly video: () => FakeVideo,
    api: boolean,
  ) {
    if (api) this.addApi();
  }

  /** YouTube's player script adds its API to the player element, as it does once it starts. */
  addApi(): void {
    Object.defineProperties(this.element, {
      getPlaybackRate: { configurable: true, value: () => this.#speed },
      setPlaybackRate: { configurable: true, value: (speed: number) => this.setSpeed(speed) },
    });
  }

  /** The speed YouTube's own speed menu shows. */
  get speed(): number {
    return this.#speed;
  }

  /** Changes speed the way YouTube's speed menu and its Shift+< / Shift+> shortcuts do. */
  setSpeed(speed: number): void {
    this.#speed = speed;
    this.video().setSpeed(speed);
  }
}
