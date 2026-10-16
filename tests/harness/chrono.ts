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

export interface StartOptions {
  /**
   * The browser doesn't promise which of Chrono's two scripts runs first. By default the
   * one in the page's own context does.
   */
  contentScriptFirst?: boolean;
}

/** Runs Chrono's scripts on the current page, as the browser does after a page load. */
export async function startChrono({ contentScriptFirst = false }: StartOptions = {}): Promise<void> {
  const startPlayerScript = async () => {
    stopPlayerScript = await (playerScript as MainWorldContentScriptDefinition).main();
  };
  if (!contentScriptFirst) await startPlayerScript();
  ctx = new ContentScriptContext('youtube');
  await contentScript.main(ctx);
  if (contentScriptFirst) await startPlayerScript();
  await settle();
}

/**
 * Invalidates the running content script's context, as the browser does when the extension
 * unloads. Chrono is told, through the context.
 */
export function stopChrono(): void {
  ctx?.notifyInvalidated();
  ctx = undefined;
  stopPlayerScript?.();
  stopPlayerScript = undefined;
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

/**
 * The parts of YouTube's page Chrono reports it couldn't recognise: what the Report link
 * will carry as `failed`. A stopgap until the Panel has its "Report it" link (#16), when
 * tests should read `failed` from the link the viewer opens instead.
 */
export function reportedFailures(): string[] {
  return failedParts();
}
