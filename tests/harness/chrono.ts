// The Chrono side of Seam 1: runs the real content script on the current page and finds
// what it shows the viewer. It also counts the work Chrono leaves running, which the viewer
// can't see, so tests can check that Chrono stops all of it on pages it isn't on.
import { queryAllByRole, queryByRole, within } from '@testing-library/dom';
import { onTestFinished } from 'vitest';
import type { MainWorldContentScriptDefinition } from 'wxt';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ContentScriptContext } from 'wxt/utils/content-script-context';
import { failedParts } from '@/diagnostics';
import playerScript from '@/entrypoints/youtube-player.content';
import contentScript from '@/entrypoints/youtube.content';
import { ListenerRegistry } from './listeners';

let ctx: ContentScriptContext | undefined;
let stopPlayerScript: (() => void) | undefined;

// Keeps count of the DOM observers that are watching something, so tests can check that
// Chrono stops its own when it has nothing to watch.
const observing = new Set<MutationObserver>();
globalThis.MutationObserver = class extends MutationObserver {
  override observe(target: Node, options?: MutationObserverInit): void {
    super.observe(target, options);
    observing.add(this);
  }
  override disconnect(): void {
    super.disconnect();
    observing.delete(this);
  }
};

/** How many DOM observers are watching the page. */
export function countObservers(): number {
  return observing.size;
}

// Keeps count of the event listeners on the document and the window.
const pageListeners = new ListenerRegistry();
/** The object `target` gets addEventListener from: itself or a prototype. */
function eventTargetPrototype(target: EventTarget): EventTarget {
  let proto = target;
  while (!Object.hasOwn(proto, 'addEventListener')) proto = Object.getPrototypeOf(proto);
  return proto;
}
// happy-dom's document and window don't share the global EventTarget's prototype.
for (const proto of new Set([eventTargetPrototype(document), eventTargetPrototype(window)])) {
  const { addEventListener, removeEventListener } = proto;
  proto.addEventListener = function (type, listener, options) {
    addEventListener.call(this, type, listener, options);
    if ((this === document || this === window) && listener) pageListeners.add(this, type, listener, options);
  };
  proto.removeEventListener = function (type, listener, options) {
    removeEventListener.call(this, type, listener, options);
    if (listener) pageListeners.remove(this, type, listener, options);
  };
}

/** How many event listeners are on the document and the window. */
export function countPageListeners(): number {
  return pageListeners.count;
}

export interface StartOptions {
  /**
   * The browser doesn't promise which of Chrono's two scripts runs first. By default the
   * one in the page's own context does.
   */
  contentScriptFirst?: boolean;
}

/** Runs Chrono's scripts on the current page, as the browser does after a page load. */
export async function startChrono({ contentScriptFirst = false }: StartOptions = {}): Promise<void> {
  if (!contentScriptFirst) await startPlayerScript();
  ctx = new ContentScriptContext('youtube');
  await contentScript.main(ctx);
  if (contentScriptFirst) await startPlayerScript();
  await settle();
}

/**
 * Runs only Chrono's script in the page's own context, as on a page where Chrono's
 * content script never runs.
 */
export async function startPlayerScript(): Promise<void> {
  stopPlayerScript = await (playerScript as MainWorldContentScriptDefinition).main();
}

/**
 * Invalidates the running content script's context, as the browser does when the extension
 * unloads. Chrono is told, through the context.
 */
export function stopChrono(): void {
  stopContentScript();
  stopPlayerScript?.();
  stopPlayerScript = undefined;
}

/**
 * Invalidates only the content script's context. When the extension unloads, the browser
 * leaves Chrono's script in the page's own context running, because it can't take a
 * script back out of a page.
 */
export function stopContentScript(): void {
  ctx?.notifyInvalidated();
  ctx = undefined;
}

/**
 * The extension is updated, disabled or removed. Chrome leaves the running content script
 * in the page, cut off from the extension: its code still runs, but `browser.runtime.id`
 * is gone. Unlike `stopChrono`, nothing tells Chrono; it has to notice.
 */
export function invalidateExtensionContext(): void {
  const { id } = fakeBrowser.runtime;
  fakeBrowser.runtime.id = undefined as unknown as string;
  onTestFinished(() => {
    fakeBrowser.runtime.id = id;
  });
}

/** Lets pending DOM work run: mutation observer callbacks and promise continuations. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

/** How many Panels are in the page, including any YouTube has hidden. */
export function countPanels(): number {
  return queryAllByRole(document.body, 'region', { name: 'Chrono', hidden: true }).length;
}

/** Chrono's Panel as the viewer sees it, or null when there isn't one. */
export function queryPanel() {
  // Not `screen`: it stays bound to the <body> that existed before the saved page loaded.
  const element = queryByRole(document.body, 'region', { name: 'Chrono' });
  if (!element) return null;
  return { element, ...within((element.shadowRoot ?? element) as HTMLElement) };
}

const PLAYLIST_SUMMARY = { name: 'Playlist summary' };

/** How many Playlist summaries are in the page, including any YouTube's styles hide. */
export function countPlaylistSummaries(): number {
  return queryAllByRole(document.body, 'note', { ...PLAYLIST_SUMMARY, hidden: true }).length;
}

/** The text of the Playlist summary the viewer sees, or null when there isn't one. */
export function queryPlaylistSummary(): string | null {
  const element = queryByRole(document.body, 'note', PLAYLIST_SUMMARY);
  if (!element) return null;
  const root = element.shadowRoot ?? element;
  return [...root.children]
    .filter((child) => child.localName !== 'style')
    .map((child) => child.textContent)
    .join('');
}

/**
 * The parts of YouTube's page Chrono reports it couldn't recognise: what the Report link
 * will carry as `failed`. A stopgap until the Panel has its "Report it" link (#16), when
 * tests should read `failed` from the link the viewer opens instead.
 */
export function reportedFailures(): string[] {
  return failedParts();
}

/**
 * Chrono's Player badge as the viewer reads it next to YouTube's time display in the watch
 * page's player, or null when none shows there.
 */
export function queryPlayerBadge(): string | null {
  const timeDisplay = document.querySelector('ytd-watch-flexy #movie_player .ytp-time-display');
  const badges = timeDisplay ? playerBadgesIn(timeDisplay) : [];
  if (badges.length > 1) throw new Error(`${badges.length} Player badges in the time display`);
  const badge = badges[0];
  if (!badge || badge.hidden) return null;
  const parts = [...badge.shadowRoot!.childNodes].filter((node) => node.nodeName !== 'STYLE');
  return parts.map((node) => node.textContent).join('').trim();
}

/** YouTube's time display `timeDisplay` as its markup would be without Chrono's Player badge. */
export function withoutPlayerBadge(timeDisplay: Element): string {
  const badges = playerBadgesIn(timeDisplay);
  const places = badges.map((badge) => ({ badge, parent: badge.parentNode!, next: badge.nextSibling }));
  for (const badge of badges) badge.remove();
  const html = timeDisplay.outerHTML;
  for (const { badge, parent, next } of places) parent.insertBefore(badge, next);
  return html;
}

// YouTube's player uses no shadow roots, so one in its time display is Chrono's.
function playerBadgesIn(timeDisplay: Element): HTMLElement[] {
  return [...timeDisplay.querySelectorAll<HTMLElement>('*')].filter((element) => element.shadowRoot);
}
