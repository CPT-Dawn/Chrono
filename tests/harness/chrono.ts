// The Chrono side of Seam 1: runs the real content script on the current page and finds
// what it shows the viewer.
import { queryByRole, within } from '@testing-library/dom';
import { ContentScriptContext } from 'wxt/utils/content-script-context';
import contentScript from '@/entrypoints/youtube.content';

let ctx: ContentScriptContext | undefined;

/** Runs Chrono's content script on the current page, as the browser does after a page load. */
export async function startChrono(): Promise<void> {
  ctx = new ContentScriptContext('youtube');
  await contentScript.main(ctx);
  await settle();
}

/** Invalidates the running content script, as the browser does when the extension unloads. */
export function stopChrono(): void {
  ctx?.notifyInvalidated();
  ctx = undefined;
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
