// The link builder: the one place that builds a URL Chrono opens outside the extension.
// Every outward link goes to a fixed path on Chrono's own site, which redirects wherever
// it needs to (ADR-0001). The paths and their parameters are a permanent contract, so
// paths may be added here but never renamed or removed.
//
// Links carry only what each path's parameters allow: versions, the browser and OS, and
// for a report, what Chrono detected about YouTube's page. Never anything from the page
// itself, like a video ID, title or URL (ADR-0002).
import type { MessageName } from '@/messages';
import type { FailureLabel, PlayerVariant, SidebarMount } from '@/youtube/adapter';

const SITE = 'https://chrono.cptdawn.dev';

/** Where the viewer's copy of Chrono runs: what "Get help" pre-fills. */
export interface Environment {
  /** Chrono's version. */
  v: string;
  /** The browser's name, in lower case, e.g. "chrome", "edge" or "firefox". */
  browser: string;
  browserVersion: string;
  /** The OS, as the browser names it, e.g. "win", "mac" or "linux". */
  os: string;
}

/** What Chrono detected on the YouTube page the viewer reports from. */
export interface PageReport {
  player?: PlayerVariant;
  layout?: SidebarMount['placement'];
  /** The parts of the page Chrono couldn't recognise. */
  failed: FailureLabel[];
}

/** What the help page takes: the environment, and for a report, the page's too. */
type HelpParams = Environment & Partial<PageReport>;

/** The values each page on Chrono's site takes as parameters. */
interface Params {
  home: Record<never, never>;
  welcome: Record<never, never>;
  whatsNew: { from: string; to: string };
  goodbye: Pick<Environment, 'v'>;
  help: HelpParams;
  tip: Record<never, never>;
}

/** A page on Chrono's site. */
export type SitePage = keyof Params;

/** Each page's path, and the parameters that go in its URL, in order. */
const PAGES: { [P in SitePage]: { path: string; params: readonly (keyof Params[P])[] } } = {
  home: { path: '/', params: [] },
  welcome: { path: '/welcome', params: [] },
  whatsNew: { path: '/whats-new', params: ['from', 'to'] },
  goodbye: { path: '/goodbye', params: ['v'] },
  help: { path: '/help', params: ['v', 'browser', 'browserVersion', 'os', 'player', 'layout', 'failed'] },
  tip: { path: '/tip', params: [] },
};

/**
 * The URL of `page` on Chrono's site with `params`. Only the parameters that page takes
 * make it into the URL. Lists are comma-separated, and empty ones left out.
 */
export function siteUrl<P extends SitePage>(page: P, params: Params[P]): string {
  const { path, params: allowed } = PAGES[page];
  const url = new URL(path, SITE);
  for (const name of allowed) {
    const value: unknown = params[name];
    if (value === undefined || (Array.isArray(value) && value.length === 0)) continue;
    url.searchParams.set(String(name), Array.isArray(value) ? value.join(',') : String(value));
  }
  return url.href;
}

/** The links the Panel's ⋮ menu and the popup offer the viewer. */
export type OutwardLink = 'tip' | 'help' | 'report';

/**
 * The links with their labels, in the order the ⋮ menu and the popup show them. A report
 * carries what Chrono detected on the viewer's YouTube page.
 */
export const OUTWARD_LINKS: readonly { link: OutwardLink; label: MessageName; withPage: boolean }[] = [
  { link: 'tip', label: 'supportChrono', withPage: false },
  { link: 'help', label: 'getHelp', withPage: false },
  { link: 'report', label: 'reportIt', withPage: true },
];

/** Whether following `link` sends what Chrono detected on the page. */
export function linkWantsPage(link: OutwardLink): boolean {
  return OUTWARD_LINKS.some((entry) => entry.link === link && entry.withPage);
}

/**
 * The URL `link` opens for a copy of Chrono running in `environment`, from a page Chrono
 * reported as `page`. Each detail of the page goes in only if it is one Chrono knows,
 * so a report can't carry anything else whoever sends it.
 */
export function linkUrl(link: OutwardLink, environment: Environment, page?: PageReport): string {
  if (link === 'tip') return siteUrl('tip', {});
  const report = link === 'report' && page ? checkedReport(page) : {};
  return siteUrl('help', { ...report, ...environment });
}

const PLAYERS: readonly unknown[] = ['legacy', 'delhi'] satisfies PlayerVariant[];
const LAYOUTS: readonly unknown[] = ['sidebar', 'below-video'] satisfies SidebarMount['placement'][];
/** Failure labels are short lower-case words naming a part of YouTube's page. */
const FAILURE_LABEL = /^[a-z]{1,16}$/;

function checkedReport({ player, layout, failed }: PageReport): Partial<PageReport> {
  return {
    player: PLAYERS.includes(player) ? player : undefined,
    layout: LAYOUTS.includes(layout) ? layout : undefined,
    failed: Array.isArray(failed) ? failed.filter((label) => typeof label === 'string' && FAILURE_LABEL.test(label)) : [],
  };
}
