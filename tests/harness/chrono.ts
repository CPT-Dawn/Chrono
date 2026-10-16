// The Chrono side of Seam 1: runs the real content script on the current page and finds
// what it shows the viewer.
import { queryByRole, within } from '@testing-library/dom';
import type { MainWorldContentScriptDefinition } from 'wxt';
import { ContentScriptContext } from 'wxt/utils/content-script-context';
import playerScript from '@/entrypoints/youtube-player.content';
import contentScript from '@/entrypoints/youtube.content';

let ctx: ContentScriptContext | undefined;
let stopPlayerScript: (() => void) | undefined;

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

/** Stops Chrono's scripts, as the browser does when the extension unloads. */
export function stopChrono(): void {
  ctx?.notifyInvalidated();
  ctx = undefined;
  stopPlayerScript?.();
  stopPlayerScript = undefined;
}

/** Lets pending DOM work run: mutation observer callbacks and promise continuations. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

/** Chrono's Panel as the viewer sees it, or null when there isn't one. */
export function queryPanel() {
  // Not `screen`: it stays bound to the <body> that existed before the saved page loaded.
  const element = queryByRole(document.body, 'region', { name: 'Chrono' });
  if (!element) return null;
  return { element, ...within((element.shadowRoot ?? element) as HTMLElement) };
}
