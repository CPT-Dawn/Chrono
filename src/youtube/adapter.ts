// The YouTube page adapter: the only module that reads YouTube's page. When YouTube
// changes its markup, this is the one place to fix.
//
// Readers never throw. Each returns a value, or an "unrecognised" result whose label
// names what Chrono couldn't find.

export type Reading<T> = { recognised: true; value: T } | { recognised: false; failed: FailureLabel };

export type FailureLabel = 'video' | 'sidebar' | 'speed' | 'ads' | 'live' | 'summary';

const recognised = <T>(value: T): Reading<T> => ({ recognised: true, value });
const unrecognised = <T>(failed: FailureLabel): Reading<T> => ({ recognised: false, failed });

export type Page = { kind: 'watch'; videoId: string } | { kind: 'playlist' } | { kind: 'unsupported' };

/**
 * What kind of YouTube page the address points at, and on a watch page, which video.
 * YouTube shows its watch page at /watch?v=<id>, and at /live/<id> for live streams and
 * their recordings. Playlist pages, Watch Later (list=WL) and Liked videos (list=LL)
 * among them, are at /playlist?list=<id>.
 */
export function readPage(location: Location): Page {
  if (location.pathname === '/playlist') {
    return new URLSearchParams(location.search).has('list') ? { kind: 'playlist' } : { kind: 'unsupported' };
  }
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

// Playlist pages. In Oct 2026 YouTube served two designs of the list, A/B tested per page
// load: ytd-playlist-video-renderer entries, or lockups. Both pages also carry two copies of
// the new header (one per layout) and the old, hidden header and sidebar, each with its own
// stats, so every query is scoped to the one part it means.
const PLAYLIST_PAGE = 'ytd-browse[page-subtype="playlist"]:not([hidden])';
/** The header's stats, in the copy beside the list (wide windows) and above it (narrow). */
const PLAYLIST_STATS =
  ':scope > :is(yt-page-header-renderer, #header) yt-page-header-view-model yt-content-metadata-view-model';
const PLAYLIST_STATS_PARTS = ':scope [role="group"] > span[role="text"]';
const LEGACY_LIST = ':scope ytd-playlist-video-list-renderer > #contents';
const LEGACY_ENTRY = ':scope > ytd-playlist-video-renderer';
const LEGACY_MORE = ':scope > ytd-continuation-item-renderer';
// The lockup design's section list also has a continuation at its end, which loads
// YouTube's recommendations below the list, and puts their lockups in a shelf.
const LOCKUP_LIST = ':scope yt-section-list-renderer yt-item-section-renderer > #contents';
const LOCKUP_ENTRY = ':scope > * > yt-lockup-view-model';
const LOCKUP_MORE = ':scope > * > yt-continuation-item-view-model';
/** The badges on an entry's thumbnail, one of which is its length. */
const ENTRY_BADGES = ':scope :is(ytd-thumbnail, yt-thumbnail-view-model) badge-shape';
const ENTRY_LINK = ':scope a[href*="/watch?"]';

export interface PlaylistPage {
  /** YouTube's stats under the playlist's title, e.g. "Playlist • 412 videos • 3,021 views". */
  stats: Element;
  /** How many entries the stats say the playlist has, counting any YouTube hides. */
  entryCount: number;
  /**
   * The content time of each entry YouTube has loaded into the list, in seconds, in order.
   * Undefined for an entry that shows no length, as YouTube shows a deleted or private video.
   */
  entryLengths: (number | undefined)[];
  /** Whether YouTube loads more entries when the viewer scrolls to the end of the list. */
  moreToLoad: boolean;
}

/**
 * A reader for playlist pages. It remembers each video's length, because YouTube takes the
 * length badge off a lockup while the pointer is over it. Use one while Chrono stays on
 * playlist pages, so what it remembers goes when Chrono leaves them.
 */
export function createPlaylistPageReader(): (doc: Document) => Reading<PlaylistPage> {
  const lengths = new Map<string, number>();

  const readLength = (entry: Element): number | undefined => {
    const href = entry.querySelector(ENTRY_LINK)?.getAttribute('href') ?? '';
    const videoId = new URLSearchParams(href.split('?')[1]).get('v');
    for (const badge of entry.querySelectorAll(ENTRY_BADGES)) {
      const length = parseLength(badge.textContent ?? '');
      if (length === undefined) continue;
      if (videoId) lengths.set(videoId, length);
      return length;
    }
    return videoId ? lengths.get(videoId) : undefined;
  };

  return (doc) => {
    const page = doc.querySelector(PLAYLIST_PAGE);
    const statsCopies = page ? [...page.querySelectorAll(PLAYLIST_STATS)] : [];
    // YouTube's styles show one copy of the header, depending on the window's width.
    const stats = statsCopies.find((copy) => copy.checkVisibility()) ?? statsCopies[0];
    const list = page && readPlaylistList(page);
    // An empty playlist's stats say so in words ("No videos"), so the first number in them
    // is something else. A list with nothing to load has nothing to count, whatever they say.
    const empty = list && list.entries.length === 0 && !list.moreToLoad;
    const entryCount = empty ? 0 : stats && readEntryCount(stats);
    if (!stats || entryCount === undefined || !list) return unrecognised('summary');
    const entryLengths = list.entries.map(readLength);
    // Stats that count fewer entries than the list has aren't the stats Chrono knows.
    if (entryCount < entryLengths.length) return unrecognised('summary');
    return recognised({ stats, entryCount, entryLengths, moreToLoad: list.moreToLoad });
  };
}

/** The playlist's list, in whichever design YouTube served. */
function readPlaylistList(page: Element): { entries: Element[]; moreToLoad: boolean } | undefined {
  const legacy = page.querySelector(LEGACY_LIST);
  const lists = [
    ...(legacy ? [{ list: legacy, entry: LEGACY_ENTRY, more: LEGACY_MORE }] : []),
    ...[...page.querySelectorAll(LOCKUP_LIST)].map((list) => ({ list, entry: LOCKUP_ENTRY, more: LOCKUP_MORE })),
  ].map(({ list, entry, more }) => ({
    entries: [...list.querySelectorAll(entry)],
    moreToLoad: list.querySelector(more) !== null,
  }));
  // Lockup sections other than the playlist's, such as YouTube's recommendations, hold none.
  return lists.find((list) => list.entries.length > 0 || list.moreToLoad) ?? lists[0];
}

/**
 * The entry count in the stats: the first part with a number in it, e.g. "412 videos" or
 * "1.234 Videos", whatever language YouTube is in. The channel isn't a part.
 */
function readEntryCount(stats: Element): number | undefined {
  for (const part of stats.querySelectorAll(PLAYLIST_STATS_PARTS)) {
    const number = /\d[\d.,'\s]*/.exec(part.textContent ?? '')?.[0];
    if (number) return Number(number.replace(/\D/g, ''));
  }
  return undefined;
}

/** A length as YouTube writes it on a thumbnail ("4:07", "1:02:03"), in seconds. */
function parseLength(text: string): number | undefined {
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return undefined;
  const [, hours = '0', minutes = '0', seconds = '0'] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

/**
 * Calls `onChange` whenever the playlist page may show something new, until `signal`
 * aborts: YouTube renders the page, loads more entries, or switches its header between
 * layouts. The switch is in YouTube's styles alone, so only the window's resizing tells.
 */
export function watchPlaylistPage(doc: Document, onChange: () => void, signal: AbortSignal): void {
  const observer = new MutationObserver(() => onChange());
  observer.observe(doc, { childList: true, subtree: true, characterData: true });
  doc.defaultView?.addEventListener('resize', () => onChange(), { signal });
  signal.addEventListener('abort', () => observer.disconnect());
}
