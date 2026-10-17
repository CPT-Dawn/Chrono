// The YouTube page adapter: the only module that reads YouTube's page. When YouTube
// changes its markup, this is the one place to fix.
//
// Readers never throw. Each returns a value, or an "unrecognised" result whose label
// names what Chrono couldn't find.

export type Reading<T> = { recognised: true; value: T } | { recognised: false; failed: FailureLabel };

export type FailureLabel = 'video' | 'sidebar' | 'speed' | 'ads' | 'live' | 'badge';

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

/**
 * Calls `onAnnounced` each time YouTube's watch page announces its player, until `signal`
 * aborts. The player may have arrived in the watch page with no video event to tell: on
 * a fresh page load YouTube starts its player, API and video and all, outside the watch
 * page, and moves it in a few seconds later. In Oct 2026 (player 0229cd64) YouTube fired
 * yt-player-updated on its ytd-player just after that move, and early in every
 * navigation without a reload. It bubbles up to the document.
 */
export function watchPlayerAnnounced(doc: Document, onAnnounced: () => void, signal: AbortSignal): void {
  doc.addEventListener('yt-player-updated', () => onAnnounced(), { signal });
}

// YouTube's player marks an ad break on its own element, and renders the ad's overlay
// into its ads module. Both were so in player 0229cd64 (Oct 2026).
const AD_BREAK = 'ad-showing';
const ADS_MODULE = ':scope .video-ads.ytp-ad-module';

/**
 * Whether YouTube's player is playing an ad, in the watch page's own video element. An ad
 * break counts only when the player's ads module has rendered the ad: a player flagged as
 * in an ad break without one is markup Chrono doesn't know, and isn't trusted to pause.
 */
export function readAdBreak(doc: Document): Reading<boolean> {
  const player = doc.querySelector(PLAYER);
  if (!player) return unrecognised('ads');
  if (!player.classList.contains(AD_BREAK)) return recognised(false);
  const ads = player.querySelector(ADS_MODULE);
  return ads && ads.childElementCount > 0 ? recognised(true) : unrecognised('ads');
}

// The player's time display is flagged on live streams, rewindable or not, and on
// premieres and streams that haven't started yet.
const TIME_DISPLAY = ':scope .ytp-time-display';
const LIVE = 'ytp-live';

/** Whether the watch page's video is live, or is a premiere or stream still to start. */
export function readLive(doc: Document): Reading<boolean> {
  const timeDisplay = doc.querySelector(PLAYER)?.querySelector(TIME_DISPLAY);
  return timeDisplay ? recognised(timeDisplay.classList.contains(LIVE)) : unrecognised('live');
}

// The time display's own times, "0:03 / 10:34", as YouTube's player 0229cd64 built them in
// Oct 2026. Both of its players put them in a contents element, inside a wrapper that also
// holds the live badge. The redesigned (Delhi) player flags itself. It flags the wrapper as
// Delhi too, but only on videos, not on live streams, so that flag says nothing about the
// player.
const DELHI = 'ytp-delhi-modern';
const TIME_WRAPPER = ':scope > .ytp-time-wrapper';
const TIME_CONTENTS = ':scope > .ytp-time-contents';
const TIMES = [':scope > .ytp-time-current', ':scope > .ytp-time-separator', ':scope > .ytp-time-duration'];

/** Which of YouTube's two players the watch page has: the legacy one or the redesigned (Delhi) one. */
export type PlayerVariant = 'legacy' | 'delhi';

export interface TimeDisplayMount {
  variant: PlayerVariant;
  /**
   * The time display's duration, "10:34", which the Player badge goes right after. In both
   * players everything else in the wrapper starts a new line, and the Delhi player's
   * rounded background goes round the wrapper, so only here does the badge read on the
   * same line as YouTube's times.
   */
  duration: Element;
}

/**
 * Where the Player badge goes in the player's time display. It is recognised only when
 * the time display is laid out exactly as one of YouTube's two players lays it out, so the
 * badge never goes anywhere that could break YouTube's display.
 */
export function readTimeDisplayMount(doc: Document): Reading<TimeDisplayMount> {
  const player = doc.querySelector(PLAYER);
  const wrapper = player?.querySelector(TIME_DISPLAY)?.querySelector(TIME_WRAPPER);
  const contents = wrapper?.querySelector(TIME_CONTENTS);
  const [current, separator, duration] = TIMES.map((part) => contents?.querySelector(part));
  if (!player || !wrapper || !current || !separator || !duration) return unrecognised('badge');
  return recognised({ variant: player.classList.contains(DELHI) ? 'delhi' : 'legacy', duration });
}

/**
 * Calls `onChange` whenever YouTube's player may have started or ended an ad break or a
 * live stream, until `signal` aborts. It watches only the parts that say so, because the
 * rest of the player changes many times a second while a video plays.
 */
export function watchPlayerState(doc: Document, onChange: () => void, signal: AbortSignal): void {
  const player = doc.querySelector(PLAYER);
  if (!player) return;
  const observer = new MutationObserver(() => {
    // YouTube adds its ads module, and may render a new time display, after the player.
    watchParts();
    onChange();
  });
  const watchParts = () => {
    const ads = player.querySelector(ADS_MODULE);
    if (ads) observer.observe(ads, { childList: true });
    const timeDisplay = player.querySelector(TIME_DISPLAY);
    if (timeDisplay) observer.observe(timeDisplay, { attributes: true, attributeFilter: ['class'] });
  };
  // The player's own flags, and the ads module coming and going among its children.
  observer.observe(player, { attributes: true, attributeFilter: ['class'], childList: true });
  watchParts();
  signal.addEventListener('abort', () => observer.disconnect());
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
