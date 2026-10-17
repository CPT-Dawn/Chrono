// How the Panel and the popup get a link opened. Only the background script can open a
// tab and read the browser's details, so the others ask it to; and only the content
// script knows what Chrono detected on a YouTube page, so the popup asks the tab for that.
import type { OutwardLink, PageReport } from '@/links';

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

/** Whether a runtime message is a request to open a link. */
export function isOpenLinkRequest(message: unknown): message is OpenLinkRequest {
  return (message as Partial<OpenLinkRequest> | null)?.type === 'chrono:open-link';
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
    return (await browser.tabs.sendMessage(tabId, request)) as PageReport | undefined;
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
    // Says a response was sent, for the browsers and fakes that wait for one only then.
    return true;
  };
  browser.runtime.onMessage.addListener(listener);
  signal.addEventListener('abort', () => browser.runtime.onMessage.removeListener(listener));
}
