// The YouTube page adapter: the only module that reads YouTube's page. When YouTube
// changes its markup, this is the one place to fix.
//
// Readers never throw. Each returns a value, or an "unrecognised" result whose label
// names what Chrono couldn't find.

export type Reading<T> = { recognised: true; value: T } | { recognised: false; failed: FailureLabel };

export type FailureLabel = 'video' | 'sidebar';

const recognised = <T>(value: T): Reading<T> => ({ recognised: true, value });
const unrecognised = <T>(failed: FailureLabel): Reading<T> => ({ recognised: false, failed });

export type PageKind = 'watch' | 'unsupported';

/** What kind of YouTube page the address points at. */
export function readPageKind(location: Location): PageKind {
  const isWatch = location.pathname === '/watch' && new URLSearchParams(location.search).has('v');
  return isWatch ? 'watch' : 'unsupported';
}

// Queries are scoped to the watch page's own element, because YouTube keeps other
// players (hover previews, the miniplayer) and duplicate ids elsewhere in the page.
const WATCH_PAGE = 'ytd-watch-flexy';

/** The watch page's main video element. */
export function readActiveVideo(doc: Document): Reading<HTMLVideoElement> {
  const video = doc.querySelector<HTMLVideoElement>(`${WATCH_PAGE} #movie_player video.html5-main-video`);
  return video ? recognised(video) : unrecognised('video');
}

/** The element at whose top the Panel goes: the inside of YouTube's sidebar column. */
export function readSidebarMount(doc: Document): Reading<Element> {
  const sidebar = doc.querySelector(`${WATCH_PAGE} #secondary #secondary-inner`);
  return sidebar ? recognised(sidebar) : unrecognised('sidebar');
}
