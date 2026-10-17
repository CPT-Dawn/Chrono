// The Seam 2 harness: Chrono's background script on the browser's events, through WXT's
// fake browser. The fake browser leaves the browser's own facts unimplemented (the
// extension's version, the browser and the OS), so the test says what they are.
import { onTestFinished, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import background from '@/entrypoints/background';
import { settle } from './chrono';

export interface BrowserFacts {
  /** The version in Chrono's manifest. Defaults to 3.0.0. */
  version?: string;
  /** Which browser Chrono runs in. Defaults to Chrome 141 on Windows. */
  browser?: { name: 'chrome'; version: string } | { name: 'firefox'; version: string };
  os?: string;
}

let uninstallUrl: string | undefined;
let running = false;
/** Tabs the viewer opened, which aren't pages Chrono opened. */
const viewerTabs = new Set<number>();

/** Starts Chrono's background script, as the browser does when it loads the extension. */
export async function startBackground({
  version = '3.0.0',
  browser = { name: 'chrome', version: '141' },
  os = 'win',
}: BrowserFacts = {}): Promise<void> {
  uninstallUrl = undefined;
  running = true;
  onTestFinished(() => {
    running = false;
    viewerTabs.clear();
  });
  vi.spyOn(fakeBrowser.runtime, 'getManifest').mockReturnValue({ manifest_version: 3, name: 'Chrono', version });
  vi.spyOn(fakeBrowser.runtime, 'getPlatformInfo').mockResolvedValue({ os, arch: 'x86-64' } as never);
  vi.spyOn(fakeBrowser.runtime, 'setUninstallURL').mockImplementation(async (url?: string) => {
    uninstallUrl = url;
  });
  // Only Firefox has runtime.getBrowserInfo, and only Chromium browsers userAgentData.
  if (browser.name === 'firefox') {
    define(fakeBrowser.runtime, 'getBrowserInfo', async () => ({
      name: 'Firefox',
      vendor: 'Mozilla',
      version: browser.version,
      buildID: '20261001000000',
    }));
  } else {
    define(navigator, 'userAgentData', {
      brands: [
        { brand: 'Not)A;Brand', version: '8' },
        { brand: 'Chromium', version: browser.version },
        { brand: 'Google Chrome', version: browser.version },
      ],
    });
  }
  await background.main();
  await settle();
}

/** Gives `target` a property for this test only. */
function define(target: object, name: string, value: unknown): void {
  Object.defineProperty(target, name, { configurable: true, value });
  onTestFinished(() => {
    delete (target as Record<string, unknown>)[name];
  });
}

/** The browser installs or updates Chrono, and tells its background script. */
export async function install(details: { reason: 'install' } | { reason: 'update'; previousVersion: string }) {
  await fakeBrowser.runtime.onInstalled.trigger(details);
  await settle();
}

/** Makes sure the browser has a focused window, as it does whenever the viewer uses it. */
export async function focusWindow(): Promise<void> {
  if (!(await fakeBrowser.windows.getCurrent())) await fakeBrowser.windows.create({ focused: true });
}

/** Starts Chrono's background script with the default browser facts, unless it is running. */
export async function ensureBackground(): Promise<void> {
  if (!running) await startBackground();
}

/**
 * The viewer looks at a tab showing `url`. When it's YouTube, it's the tab whose page the
 * test loaded, where Chrono's content script runs; on other sites no script of Chrono's
 * answers messages sent to the tab, as in a browser.
 */
export async function viewTab(url: string): Promise<void> {
  await focusWindow();
  const tab = await fakeBrowser.tabs.create({ url, active: true });
  viewerTabs.add(tab.id!);
  const chronoRuns = new URL(url).hostname === 'www.youtube.com';
  vi.spyOn(fakeBrowser.tabs, 'sendMessage').mockImplementation(async (tabId: number, message: unknown) => {
    if (tabId !== tab.id || !chronoRuns) throw new Error('Could not establish connection. Receiving end does not exist.');
    return fakeBrowser.runtime.sendMessage(message);
  });
}

/** The pages Chrono has opened in new tabs, in order. */
export async function openedPages(): Promise<URL[]> {
  // Opening a page passes through several messages and browser calls, each a promise.
  for (let i = 0; i < 5; i++) await settle();
  const tabs = await fakeBrowser.tabs.query({});
  return tabs.flatMap((tab) => (tab.url && !viewerTabs.has(tab.id!) ? [new URL(tab.url)] : []));
}

/** The page the browser opens when the viewer removes Chrono. */
export function uninstallPage(): URL | undefined {
  return uninstallUrl === undefined ? undefined : new URL(uninstallUrl);
}
