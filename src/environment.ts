// Where the viewer's copy of Chrono runs: its version, the browser and the OS. "Get help"
// pre-fills these so a viewer doesn't have to work them out. Only extension pages and the
// background script can read them; content scripts can't.
import type { Environment } from '@/links';

interface UserAgentBrand {
  brand: string;
  version: string;
}

/** Firefox's own API for its name and version. Chromium browsers don't have it. */
interface FirefoxRuntime {
  getBrowserInfo?(): Promise<{ name: string; version: string }>;
}

/**
 * The Chromium browsers Chrono's users install it in from the Chrome Web Store, by the
 * brand each reports in `navigator.userAgentData`. Vivaldi and Arc report only Chrome's.
 */
const CHROMIUM_BRANDS: Record<string, string> = {
  'Google Chrome': 'chrome',
  'Microsoft Edge': 'edge',
  Brave: 'brave',
  Opera: 'opera',
};

/** Chrono's version, and the browser and OS it runs in. */
export async function readEnvironment(): Promise<Environment> {
  const [browserInfo, platform] = await Promise.all([readBrowser(), browser.runtime.getPlatformInfo()]);
  return { v: browser.runtime.getManifest().version, ...browserInfo, os: platform.os };
}

async function readBrowser(): Promise<Pick<Environment, 'browser' | 'browserVersion'>> {
  const firefox = (browser.runtime as FirefoxRuntime).getBrowserInfo;
  if (firefox) {
    const { name, version } = await firefox();
    return { browser: name.toLowerCase(), browserVersion: version };
  }
  const brands: UserAgentBrand[] = (navigator as { userAgentData?: { brands: UserAgentBrand[] } }).userAgentData?.brands ?? [];
  const known = brands.find(({ brand }) => brand in CHROMIUM_BRANDS);
  if (known) return { browser: CHROMIUM_BRANDS[known.brand]!, browserVersion: known.version };
  const chromium = brands.find(({ brand }) => brand === 'Chromium');
  if (chromium) return { browser: 'chromium', browserVersion: chromium.version };
  return { browser: 'unknown', browserVersion: 'unknown' };
}
