// The YouTube page adapter: the only module that reads YouTube's page. When YouTube
// changes its markup, this is the one place to fix.
//
// Readers never throw. Each returns a value, or an "unrecognised" result whose label
// names what Chrono couldn't find.

export type Reading<T> = { recognised: true; value: T } | { recognised: false; failed: FailureLabel };

export type FailureLabel = 'video' | 'sidebar' | 'speed';

const recognised = <T>(value: T): Reading<T> => ({ recognised: true, value });
const unrecognised = <T>(failed: FailureLabel): Reading<T> => ({ recognised: false, failed });

export type Page = { kind: 'watch'; videoId: string } | { kind: 'unsupported' };

/**
 * What kind of YouTube page the address points at, and on a watch page, which video.
 * YouTube shows its watch page at /watch?v=<id>, and at /live/<id> for live streams and
 * their recordings.
 */
export function readPage(location: Location): Page {
  const videoId =
    location.pathname === '/watch'
      ? new URLSearchParams(location.search).get('v')
      : /^\/live\/([\w-]+)$/.exec(location.pathname)?.[1];
  return videoId ? { kind: 'watch', videoId } : { kind: 'unsupported' };
}

// Queries are scoped to the watch page's own element, because YouTube keeps other
// players (hover previews, the miniplayer) and duplicate ids elsewhere in the page.
const WATCH_PAGE = 'ytd-watch-flexy';

/** The watch page's main video element. */
export function readActiveVideo(doc: Document): Reading<HTMLVideoElement> {
  const video = doc.querySelector<HTMLVideoElement>(`${WATCH_PAGE} #movie_player video.html5-main-video`);
  return video ? recognised(video) : unrecognised('video');
}

// YouTube's sidebar column holds these blocks above its related videos. In a narrow
// window YouTube hides the column and moves the blocks below the video, in another order.
const SIDEBAR_COLUMN = `${WATCH_PAGE}[is-two-columns_] #secondary #secondary-inner`;
const BELOW_VIDEO = `${WATCH_PAGE}:not([is-two-columns_]) #primary #below`;
const SIDEBAR_BLOCKS = ':scope > :is(#panels, #playlist)';

export interface SidebarMount {
  /** Where the sidebar's contents are: its column, or (in a narrow window) below the video. */
  container: Element;
  /**
   * The first of the sidebar's blocks, which the Panel goes above. Null when YouTube
   * hasn't rendered any of them, and the Panel goes at the top of the container.
   */
  firstBlock: Element | null;
  placement: 'sidebar' | 'below-video';
}

/** Where the Panel goes: above the sidebar's blocks, wherever YouTube's layout has put them. */
export function readSidebarMount(doc: Document): Reading<SidebarMount> {
  const column = doc.querySelector(SIDEBAR_COLUMN);
  if (column) {
    return recognised({ container: column, firstBlock: column.querySelector(SIDEBAR_BLOCKS), placement: 'sidebar' });
  }
  // Below the video, the blocks are the only sign of where YouTube put the sidebar.
  const below = doc.querySelector(BELOW_VIDEO);
  const firstBlock = below?.querySelector(SIDEBAR_BLOCKS);
  if (below && firstBlock) return recognised({ container: below, firstBlock, placement: 'below-video' });
  return unrecognised('sidebar');
}

/**
 * Calls `onChange` with the new mount whenever YouTube switches between its two-column
 * and one-column layouts, until `signal` aborts. YouTube moves the sidebar's blocks in
 * the same task as the switch, so they are already in their new place.
 */
export function watchSidebarMount(
  doc: Document,
  onChange: (mount: Reading<SidebarMount>) => void,
  signal: AbortSignal,
): void {
  const watchPage = doc.querySelector(WATCH_PAGE);
  if (!watchPage) return;
  const observer = new MutationObserver(() => onChange(readSidebarMount(doc)));
  observer.observe(watchPage, { attributes: true, attributeFilter: ['is-two-columns_'] });
  signal.addEventListener('abort', () => observer.disconnect());
}

export type Theme = 'light' | 'dark';

/** YouTube's colour theme. YouTube flags dark with an attribute on `<html>`; light is its absence. */
export function readTheme(doc: Document): Theme {
  return doc.documentElement.hasAttribute('dark') ? 'dark' : 'light';
}

/** Calls `onChange` with the new theme whenever YouTube switches it, until `signal` aborts. */
export function watchTheme(doc: Document, onChange: (theme: Theme) => void, signal: AbortSignal): void {
  const observer = new MutationObserver(() => onChange(readTheme(doc)));
  observer.observe(doc.documentElement, { attributes: true, attributeFilter: ['dark'] });
  signal.addEventListener('abort', () => observer.disconnect());
}

// YouTube's player speed API. YouTube adds it to the player element from the page's own
// scripts, so only a script running in the page's context can see it.

interface PlayerSpeedApi {
  getPlaybackRate(): number;
  setPlaybackRate(speed: number): void;
}

const PLAYER = `${WATCH_PAGE} #movie_player`;

function readPlayerSpeedApi(doc: Document): Reading<PlayerSpeedApi> {
  const player = doc.querySelector(PLAYER) as Partial<PlayerSpeedApi> | null;
  const hasApi = typeof player?.getPlaybackRate === 'function' && typeof player.setPlaybackRate === 'function';
  return hasApi ? recognised(player as PlayerSpeedApi) : unrecognised('speed');
}

/** YouTube's player speed. Works only from the page's own context. */
export function readPlayerSpeed(doc: Document): Reading<number> {
  const api = readPlayerSpeedApi(doc);
  if (!api.recognised) return api;
  try {
    const speed = api.value.getPlaybackRate();
    return Number.isFinite(speed) ? recognised(speed) : unrecognised('speed');
  } catch {
    return unrecognised('speed');
  }
}

/**
 * Sets YouTube's player speed, so YouTube's menu shows it too. Returns whether the player
 * took it. Works only from the page's own context.
 */
export function setPlayerSpeed(doc: Document, speed: number): boolean {
  const api = readPlayerSpeedApi(doc);
  if (!api.recognised) return false;
  try {
    api.value.setPlaybackRate(speed);
    return true;
  } catch {
    return false;
  }
}

/**
 * Calls `onChange` whenever the player's speed may have changed or its API may have
 * become available. YouTube applies every speed change to its video, whichever control
 * made it, and starts its player before the video loads or plays. Listening on the
 * document catches the video even after YouTube swaps it for another.
 */
export function watchPlayerSpeed(doc: Document, onChange: () => void, signal: AbortSignal): void {
  const listener = (event: Event) => {
    if (event.target instanceof Element && event.target.closest(PLAYER)) onChange();
  };
  for (const type of ['ratechange', 'loadedmetadata', 'playing']) {
    doc.addEventListener(type, listener, { capture: true, signal });
  }
}

export interface NavigationHandlers {
  started(): void;
  finished(): void;
}

/**
 * Tells `handlers` each time YouTube starts and finishes navigating without a reload,
 * until `signal` aborts. YouTube fires these events on its app element, and they bubble
 * up. In between it changes the address, which fires no event at all.
 */
export function watchNavigation(doc: Document, handlers: NavigationHandlers, signal: AbortSignal): void {
  doc.addEventListener('yt-navigate-start', () => handlers.started(), { signal });
  doc.addEventListener('yt-navigate-finish', () => handlers.finished(), { signal });
}

/**
 * Which media YouTube's player has loaded into `video`. YouTube gives every video it
 * loads a new blob: source, even when it reuses the element.
 */
export function readMediaSource(video: HTMLVideoElement): string {
  return video.src;
}
