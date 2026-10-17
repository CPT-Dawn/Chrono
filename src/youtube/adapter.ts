// The YouTube page adapter: the only module that reads YouTube's page. When YouTube
// changes its markup, this is the one place to fix.
//
// Readers never throw. Each returns a value, or an "unrecognised" result whose label
// names what Chrono couldn't find.

export type Reading<T> = { recognised: true; value: T } | { recognised: false; failed: FailureLabel };

export type FailureLabel = 'video' | 'sidebar' | 'speed' | 'ads' | 'live' | 'playlist';

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

// Playlists. A watch page in a playlist has the playlist's id in its address, and lists the
// playlist's entries in a panel in the sidebar (or below the video, in a narrow window).
// Every query is scoped to that panel: YouTube keeps other lists of the same videos in the
// page, such as the playlist page the viewer came from, hidden but complete.

/** An entry in a playlist, as YouTube's playlist panel lists it. */
export interface PlaylistEntry {
  /** The number YouTube shows beside the entry. YouTube doesn't number entries it hides. */
  number: number;
  /** The entry's length in seconds of content time, or undefined when YouTube can't play it. */
  duration: number | undefined;
  /** Whether this is the entry YouTube is playing. */
  selected: boolean;
  /** The video the entry plays. */
  videoId: string | undefined;
}

export type Playlist =
  /** A Mix or radio playlist, which YouTube makes up as it plays and which has no end. */
  | { kind: 'mix'; id: string }
  | {
      kind: 'playlist';
      id: string;
      /** Whether the viewer has turned on the panel's Shuffle button. */
      shuffle: boolean;
      /** The entries YouTube has loaded into its panel so far, in order. */
      entries: PlaylistEntry[];
      /** How many entries the playlist has, including any not loaded and any unavailable. */
      total: number;
      /** How many unavailable entries YouTube left out of the panel, saying only how many. */
      hiddenUnavailable: number;
    };

const PLAYLIST_PANEL_TAG = 'ytd-playlist-panel-renderer';
const PLAYLIST_PANEL = `${WATCH_PAGE} ${PLAYLIST_PANEL_TAG}#playlist`;
const PLAYLIST_ENTRIES = ':scope #items > ytd-playlist-panel-video-renderer';
const PLAYLIST_HIDDEN_MESSAGE = ':scope #items > ytd-message-renderer';
/** "2 / 8": the playing entry's number and the playlist's length, in the panel's header. */
const PLAYLIST_POSITION = ':scope #publisher-container .index-message';
const PLAYLIST_ACTIONS = ':scope #playlist-action-menu';
const PLAYLIST_LOOP = ':scope ytd-playlist-loop-button-renderer';
const PLAYLIST_SHUFFLE = ':scope ytd-toggle-button-renderer button[aria-pressed]';
const ENTRY_NUMBER = ':scope #index';
const ENTRY_LINK = ':scope a#wc-endpoint';
const ENTRY_TIME_STATUS = ':scope ytd-thumbnail-overlay-time-status-renderer :is(badge-shape, #text)';
const ENTRY_UNPLAYABLE = ':scope #unplayableText:not([hidden])';

/**
 * The playlist the watch page is playing, or undefined when it isn't playing one. YouTube
 * marks Mixes and radio playlists by starting their id with RD.
 */
export function readPlaylist(doc: Document, location: Location): Reading<Playlist | undefined> {
  const id = new URLSearchParams(location.search).get('list');
  if (!id) return recognised(undefined);
  if (id.startsWith('RD')) return recognised({ kind: 'mix', id });

  const panel = doc.querySelector(PLAYLIST_PANEL);
  if (!panel) return unrecognised('playlist');
  const total = [...panel.querySelectorAll(PLAYLIST_POSITION)]
    .map((element) => /\d[\d\s.,]*\/\s*(\d[\d\s.,]*)/.exec(element.textContent ?? '')?.[1])
    .find((length) => length !== undefined);
  const entries = readPlaylistEntries(panel);
  const shuffle = readShuffle(panel);
  if (total === undefined || !entries || shuffle === undefined) return unrecognised('playlist');
  // "8 unavailable videos are hidden", in the viewer's language.
  const hidden = /\d[\d\s.,]*/.exec(panel.querySelector(PLAYLIST_HIDDEN_MESSAGE)?.textContent ?? '')?.[0];
  return recognised({
    kind: 'playlist',
    id,
    shuffle,
    entries,
    total: parseCount(total),
    hiddenUnavailable: hidden === undefined ? 0 : parseCount(hidden),
  });
}

/**
 * Whether the panel's Shuffle button is on, or undefined when the panel has the Loop
 * button that Shuffle sits beside but no Shuffle button Chrono knows. Some playlists, such
 * as courses, have neither, and can't be shuffled.
 */
function readShuffle(panel: Element): boolean | undefined {
  const actions = panel.querySelector(PLAYLIST_ACTIONS);
  const button = actions?.querySelector(PLAYLIST_SHUFFLE);
  if (button) return button.getAttribute('aria-pressed') === 'true';
  return actions?.querySelector(PLAYLIST_LOOP) ? undefined : false;
}

/**
 * The panel's entries, or undefined when they aren't markup Chrono knows: none playing, or
 * entries YouTube can play whose lengths Chrono can't read.
 */
function readPlaylistEntries(panel: Element): PlaylistEntry[] | undefined {
  const read = [...panel.querySelectorAll(PLAYLIST_ENTRIES)].map((entry) => {
    const href = entry.querySelector(ENTRY_LINK)?.getAttribute('href') ?? '';
    // The thumbnail says how long the entry is, or has a word such as LIVE or UPCOMING
    // when the entry has no fixed length yet.
    const timeStatus = [...entry.querySelectorAll(ENTRY_TIME_STATUS)].map((element) => element.textContent?.trim() ?? '');
    const playable = !entry.querySelector(ENTRY_UNPLAYABLE);
    return {
      // The playing entry shows ▶ in place of its number.
      number: Number(entry.querySelector(ENTRY_NUMBER)?.textContent?.trim()) || undefined,
      duration: playable ? timeStatus.map(parseDuration).find((seconds) => seconds !== undefined) : undefined,
      playable,
      hasTimeStatus: timeStatus.some(Boolean),
      selected: entry.hasAttribute('selected'),
      videoId: new URLSearchParams(href.split('?')[1] ?? '').get('v') ?? undefined,
    };
  });
  const playable = read.filter((entry) => entry.playable);
  // A playable entry with no time on its thumbnail, or no readable length on any of them,
  // means YouTube changed how it shows lengths.
  const lengthsKnown =
    playable.every((entry) => entry.hasTimeStatus) &&
    (playable.length === 0 || playable.some((entry) => entry.duration !== undefined));
  if (!read.some((entry) => entry.selected) || !lengthsKnown) return undefined;

  // Entries are numbered one after another, so a missing number follows from its neighbours.
  return read.map(({ number, duration, selected, videoId }, i) => {
    const before = read.slice(0, i).findLastIndex((e) => e.number !== undefined);
    const after = read.findIndex((e, j) => j > i && e.number !== undefined);
    const filled =
      number ??
      (before !== -1 ? read[before]!.number! + (i - before) : after !== -1 ? read[after]!.number! - (after - i) : i + 1);
    return { number: filled, duration, selected, videoId };
  });
}

/** A count YouTube writes with the viewer's digit grouping, e.g. "1,204". */
function parseCount(text: string): number {
  return Number(text.replace(/\D/g, ''));
}

/** A length written the way YouTube writes one, e.g. "4:05" or "1:02:03", in seconds. */
function parseDuration(text: string): number | undefined {
  const parts = text.split(':');
  if (parts.length < 2 || parts.length > 3 || !parts.every((part) => /^\d+$/.test(part))) return undefined;
  return parts.reduce((seconds, part) => seconds * 60 + Number(part), 0);
}

/**
 * Calls `onChange` whenever YouTube may have changed the playlist panel: rendered it,
 * loaded more entries, moved to another entry or turned Shuffle on or off. It stops when
 * `signal` aborts.
 */
export function watchPlaylist(doc: Document, onChange: () => void, signal: AbortSignal): void {
  const watchPage = doc.querySelector(WATCH_PAGE);
  if (!watchPage) return;
  // YouTube may render the panel after the watch page, so this watches the whole watch
  // page and passes on only changes in, or of, a playlist panel.
  const isPanel = (node: Node) =>
    node instanceof Element && (node.localName === PLAYLIST_PANEL_TAG || node.querySelector(PLAYLIST_PANEL_TAG) !== null);
  const observer = new MutationObserver((records) => {
    const changed = records.some(
      ({ target, addedNodes, removedNodes }) =>
        (target instanceof Element && target.closest(PLAYLIST_PANEL_TAG) !== null) ||
        [...addedNodes].some(isPanel) ||
        [...removedNodes].some(isPanel),
    );
    if (changed) onChange();
  });
  observer.observe(watchPage, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['selected', 'aria-pressed'],
  });
  signal.addEventListener('abort', () => observer.disconnect());
}
