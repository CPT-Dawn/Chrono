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

/** Each page on Chrono's site, its path, and the parameters it takes. */
interface Pages {
  home: { path: '/'; params: Record<never, never> };
  welcome: { path: '/welcome'; params: Record<never, never> };
  whatsNew: { path: '/whats-new'; params: { from: string; to: string } };
  goodbye: { path: '/goodbye'; params: { v: string } };
  help: { path: '/help'; params: Environment & Partial<Omit<PageReport, 'failed'>> & { failed?: FailureLabel[] } };
  tip: { path: '/tip'; params: Record<never, never> };
}

export type SitePage = keyof Pages;

const PAGES: { [P in SitePage]: { path: Pages[P]['path']; params: readonly (keyof Pages[P]['params'])[] } } = {
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
export function siteUrl<P extends SitePage>(page: P, params: Pages[P]['params']): string {
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

/** The links with their labels, in the order the ⋮ menu and the popup show them. */
export const OUTWARD_LINKS: readonly { link: OutwardLink; label: MessageName }[] = [
  { link: 'tip', label: 'supportChrono' },
  { link: 'help', label: 'getHelp' },
  { link: 'report', label: 'reportIt' },
];

/** A content script or the popup asks the background script to open a link. */
export interface OpenLinkRequest {
  type: 'chrono:open-link';
  link: OutwardLink;
  /** For "Report it": what Chrono detected on the YouTube page, if the viewer is on one. */
  page?: PageReport;
}

/** Asks the background script to open `link` in a new tab. */
export async function openLink(link: OutwardLink, page?: PageReport): Promise<void> {
  const request: OpenLinkRequest = { type: 'chrono:open-link', link, page };
  try {
    await browser.runtime.sendMessage(request);
  } catch {
    // The extension was updated or removed while this page stayed open. Nothing can open.
  }
}

export function isOpenLinkRequest(message: unknown): message is OpenLinkRequest {
  return (message as Partial<OpenLinkRequest> | null)?.type === 'chrono:open-link';
}

/** The URL `request`'s link opens, for a copy of Chrono running in `environment`. */
export function linkUrl({ link, page }: OpenLinkRequest, environment: Environment): string {
  switch (link) {
    case 'tip':
      return siteUrl('tip', {});
    case 'help':
      return siteUrl('help', environment);
    case 'report':
      return siteUrl('help', { ...page, ...environment });
  }
}

/** The popup asks the content script in the viewer's tab what it detected on the page. */
interface PageReportRequest {
  type: 'chrono:page-report';
}

/**
 * What Chrono detected on the page in tab `tabId`, or undefined when the tab isn't a
 * YouTube watch page Chrono is on.
 */
export async function askForPageReport(tabId: number): Promise<PageReport | undefined> {
  const request: PageReportRequest = { type: 'chrono:page-report' };
  try {
    return ((await browser.tabs.sendMessage(tabId, request)) as PageReport | undefined) ?? undefined;
  } catch {
    // No content script of Chrono's is listening in that tab.
    return undefined;
  }
}

/**
 * Answers the popup's questions about the page with `readPageReport`, until `signal`
 * aborts. Runs in the content script.
 */
export function answerPageReports(readPageReport: () => PageReport | undefined, signal: AbortSignal): void {
  const listener = (message: unknown, _sender: unknown, sendResponse: (response: unknown) => void) => {
    if ((message as Partial<PageReportRequest> | null)?.type !== 'chrono:page-report') return;
    const report = readPageReport();
    if (!report) return;
    sendResponse(report);
    return true;
  };
  browser.runtime.onMessage.addListener(listener);
  signal.addEventListener('abort', () => browser.runtime.onMessage.removeListener(listener));
}
