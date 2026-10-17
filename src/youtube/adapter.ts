// The YouTube page adapter: the only module that reads YouTube's page. When YouTube
// changes its markup, this is the one place to fix.
//
// Readers never throw. Each returns a value, or an "unrecognised" result whose label
// names what Chrono couldn't find.

export type Reading<T> = { recognised: true; value: T } | { recognised: false; failed: FailureLabel };

export type FailureLabel =
  | 'video'
  | 'sidebar'
  | 'speed'
  | 'ads'
  | 'live'
  | 'badge'
  | 'chapters'
  | 'playlist'
  | 'player'
  | 'summary';

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

/** Which of YouTube's two players the watch page has: the legacy one or the redesigned (Delhi) one. */
export type PlayerVariant = 'legacy' | 'delhi';

// YouTube rolled the redesigned player out in waves from Oct 2025. It flags it with this
// class on the player element, as it still did in Oct 2026.
const DELHI = 'ytp-delhi-modern';

function variantOf(player: Element): PlayerVariant {
  return player.classList.contains(DELHI) ? 'delhi' : 'legacy';
}

/** Which of YouTube's players the watch page has. */
export function readPlayerVariant(doc: Document): Reading<PlayerVariant> {
  const player = doc.querySelector(PLAYER);
  if (!player) return unrecognised('player');
  return recognised(variantOf(player));
}

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
const TIME_WRAPPER = ':scope > .ytp-time-wrapper';
const TIME_CONTENTS = ':scope > .ytp-time-contents';
const TIMES = [':scope > .ytp-time-current', ':scope > .ytp-time-separator', ':scope > .ytp-time-duration'];

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
  return recognised({ variant: variantOf(player), duration });
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

/** A chapter of a video, as YouTube lists it. */
export interface Chapter {
  title: string;
  /** Where the chapter starts, in seconds of content time. It ends where the next one starts. */
  start: number;
}

// YouTube lists a video's chapters in a panel it keeps beside the video, whichever player
// it serves: one panel for chapters the creator wrote, another for chapters YouTube made.
// Its progress bar has a segment per chapter, and one segment for a video without them.
// All were so on the legacy and Delhi players in Oct 2026.
const CHAPTER_LIST = [
  'engagement-panel-macro-markers-description-chapters',
  'engagement-panel-macro-markers-auto-chapters',
]
  .map((id) => `${WATCH_PAGE} #panels > ytd-engagement-panel-section-list-renderer[target-id="${id}"]`)
  .join(', ');
const CHAPTER_ITEM = ':scope ytd-macro-markers-list-item-renderer';
const CHAPTER_LINK = ':scope > a#endpoint';
const CHAPTER_TITLE = ':scope #details .macro-markers';
const CHAPTER_SEGMENTS = ':scope .ytp-progress-bar .ytp-chapters-container';
const CHAPTER_SEGMENT = ':scope > .ytp-chapter-hover-container';
const YOUTUBE = 'https://www.youtube.com/';

/**
 * The chapters of `videoId`, the watch page's video, in order. An empty list for a video
 * without chapters. The list only counts when YouTube's progress bar agrees about how many
 * chapters there are, so a list YouTube hasn't yet replaced after navigating never does.
 */
export function readChapters(doc: Document, videoId: string): Reading<Chapter[]> {
  const segments = doc.querySelector(PLAYER)?.querySelector(CHAPTER_SEGMENTS);
  if (!segments) return unrecognised('chapters');
  const segmentCount = segments.querySelectorAll(CHAPTER_SEGMENT).length;
  const list = doc.querySelector(CHAPTER_LIST);
  if (!list) return segmentCount === 1 ? recognised([]) : unrecognised('chapters');

  const chapters: Chapter[] = [];
  for (const item of list.querySelectorAll(CHAPTER_ITEM)) {
    const chapter = readChapter(item, videoId);
    // Each chapter starts after the one before, and the first at the very start.
    const previous = chapters.at(-1);
    if (!chapter || (previous ? chapter.start <= previous.start : chapter.start !== 0)) return unrecognised('chapters');
    chapters.push(chapter);
  }
  return chapters.length === segmentCount ? recognised(chapters) : unrecognised('chapters');
}

/**
 * One chapter of the list. Its link plays `videoId` from the chapter's start, given in
 * whole seconds, e.g. `/watch?v=aircAruvnKk&t=67s`; the first chapter's has no start.
 */
function readChapter(item: Element, videoId: string): Chapter | undefined {
  const link = item.querySelector(CHAPTER_LINK);
  const title = link?.querySelector(CHAPTER_TITLE)?.textContent?.trim();
  const href = link?.getAttribute('href');
  if (!title || !href || !URL.canParse(href, YOUTUBE)) return undefined;
  const params = new URL(href, YOUTUBE).searchParams;
  if (params.get('v') !== videoId) return undefined;
  const start = /^(\d+)s$/.exec(params.get('t') ?? '0s')?.[1];
  return start === undefined ? undefined : { title, start: Number(start) };
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

// Playlist pages. In Oct 2026 YouTube served two designs of the list, A/B tested per page
// load: ytd-playlist-video-renderer entries, or lockups. It also served two headers: most
// playlists had the older one, and the rest the newer one, in two copies (one per layout).
// A page with the newer header still carries the older one, empty and hidden, and its
// sidebar, so every query is scoped to the one part it means.
const PLAYLIST_PAGE = 'ytd-browse[page-subtype="playlist"]:not([hidden])';
/** The header's stats in each header, and the parts the stats are made of. */
const PLAYLIST_STATS = [
  // The newer header, in the copy beside the list (wide windows) and above it (narrow).
  {
    stats: ':scope > :is(yt-page-header-renderer, #header) yt-page-header-view-model yt-content-metadata-view-model',
    parts: ':scope [role="group"] > span[role="text"]',
  },
  // The older header's byline, e.g. "139 videos · Last updated on Nov 9, 2024".
  {
    stats: ':scope > ytd-playlist-header-renderer:not([hidden]) ytd-playlist-byline-renderer',
    parts: ':scope yt-formatted-string',
  },
];
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
/**
 * The badge on the lockup YouTube is playing, in the miniplayer, which says "Now playing"
 * with an animated icon in place of the length. It says the length only in words, in the
 * viewer's language, for screen readers.
 */
const ENTRY_NOW_PLAYING = ':scope yt-thumbnail-view-model badge-shape lottie-component';
const PAGE_ENTRY_LINK = ':scope a[href*="/watch?"]';

export interface PlaylistPage {
  /** YouTube's stats under the playlist's title, e.g. "Playlist • 412 videos • 3,021 views". */
  stats: Element;
  /** How many entries the stats say the playlist has, counting any YouTube hides. */
  entryCount: number;
  /**
   * The content time of each entry YouTube has loaded into the list, in seconds, in order.
   * Undefined for an entry that shows no length, as YouTube shows a deleted or private video,
   * and unknown for the entry YouTube is playing, when Chrono hasn't seen its length.
   */
  entryLengths: (number | 'unknown' | undefined)[];
  /** Whether YouTube loads more entries when the viewer scrolls to the end of the list. */
  moreToLoad: boolean;
}

/**
 * A reader for playlist pages. It remembers each video's length, because YouTube takes the
 * length badge off a lockup while the pointer is over it, and off the lockup it is playing.
 * Use one for as long as the tab is open, so that coming back to a playlist page still
 * counts the video the viewer went on to play from it.
 */
export function createPlaylistPageReader(): (doc: Document) => Reading<PlaylistPage> {
  const lengths = new Map<string, number>();

  const readLength = (entry: Element): number | 'unknown' | undefined => {
    const href = entry.querySelector(PAGE_ENTRY_LINK)?.getAttribute('href') ?? '';
    const videoId = new URLSearchParams(href.split('?')[1]).get('v');
    for (const badge of entry.querySelectorAll(ENTRY_BADGES)) {
      const length = parseDuration(badge.textContent?.trim() ?? '');
      if (length === undefined) continue;
      if (videoId) lengths.set(videoId, length);
      return length;
    }
    const remembered = videoId ? lengths.get(videoId) : undefined;
    if (remembered === undefined && entry.querySelector(ENTRY_NOW_PLAYING)) return 'unknown';
    return remembered;
  };

  return (doc) => {
    const page = doc.querySelector(PLAYLIST_PAGE);
    const statsCopies = PLAYLIST_STATS.flatMap(({ stats, parts }) =>
      page ? [...page.querySelectorAll(stats)].map((element) => ({ element, parts })) : [],
    );
    // YouTube's styles show one copy of the newer header, depending on the window's width.
    const shown = statsCopies.find((copy) => copy.element.checkVisibility()) ?? statsCopies[0];
    const stats = shown?.element;
    const list = page && readPlaylistList(page);
    // An empty playlist's stats say so in words ("No videos"), so the first number in them
    // is something else. A list with nothing to load has nothing to count, whatever they say.
    const empty = list && list.entries.length === 0 && !list.moreToLoad;
    const entryCount = empty ? 0 : shown && readEntryCount(shown.element, shown.parts);
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
 * The entry count in the stats: the first of its `parts` with a number in it, e.g.
 * "412 videos" or "1.234 Videos", whatever language YouTube is in. The channel isn't a part.
 */
function readEntryCount(stats: Element, parts: string): number | undefined {
  for (const part of stats.querySelectorAll(parts)) {
    const number = /\d[\d.,'\s]*/.exec(part.textContent ?? '')?.[0];
    if (number) return Number(number.replace(/\D/g, ''));
  }
  return undefined;
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
