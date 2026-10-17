// Chrono's background lifecycle: the welcome, what's-new and goodbye pages, and opening
// the links the Panel and the popup offer. Content scripts can't open tabs or read the
// browser's details, so they ask the background script to.
import { readEnvironment } from '@/environment';
import { isOpenLinkRequest, linkUrl, siteUrl } from '@/links';

/** Starts the background lifecycle. The browser runs it each time it loads the extension. */
export function startOnboarding(): void {
  const { version } = browser.runtime.getManifest();
  void browser.runtime.setUninstallURL(siteUrl('goodbye', { v: version }));

  browser.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
    if (reason === 'install') {
      void openPage(siteUrl('welcome', {}));
    } else if (reason === 'update' && previousVersion && majorOf(version) > majorOf(previousVersion)) {
      void openPage(siteUrl('whatsNew', { from: previousVersion, to: version }));
    }
  });

  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!isOpenLinkRequest(message)) return;
    void readEnvironment().then((environment) => openPage(linkUrl(message, environment)));
  });
}

function openPage(url: string): Promise<unknown> {
  return browser.tabs.create({ url });
}

/** The major part of a version like "3.0.1". */
function majorOf(version: string): number {
  return Number.parseInt(version, 10);
}
