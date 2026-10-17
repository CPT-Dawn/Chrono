// The toolbar popup side of Seam 1: Chrono's popup page, opened in its own window as the
// browser opens it when the viewer clicks Chrono's toolbar icon. It shares the fake
// browser, and so its storage, with the content script running on the YouTube page.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, within } from '@testing-library/dom';
import { Window } from 'happy-dom';
import { onTestFinished } from 'vitest';
import { startPopup } from '@/popup/popup';
import { ensureBackground, focusWindow, openedPages, viewTab } from './background';
import { settle } from './chrono';

/** Opens Chrono's popup and returns queries scoped to what it shows. */
export async function openPopup() {
  // The viewer clicks the toolbar icon in the window they're using.
  await focusWindow();
  const window = new Window({
    url: 'chrome-extension://chrono/popup.html',
    // The test runs the popup's script itself, below, the same way its entry point does.
    settings: { disableJavaScriptFileLoading: true },
  });
  onTestFinished(() => window.happyDOM.close());
  const html = readFileSync(join(import.meta.dirname, '../../src/entrypoints/popup/index.html'), 'utf8');
  window.document.write(html);
  const document = window.document as unknown as Document;
  await startPopup(document);
  await settle();
  return { document, ...within(document.body) };
}

/**
 * Follows "Something look wrong? Report it" from the popup, opened over the tab the test
 * loaded, as the viewer does on a page without a Panel. Returns the page it opens.
 */
export async function followPopupReportLink(): Promise<URL> {
  await ensureBackground();
  await viewTab(location.href);
  const popup = await openPopup();
  const before = (await openedPages()).length;
  fireEvent.click(popup.getByRole('button', { name: 'Something look wrong? Report it' }));
  const opened = (await openedPages()).slice(before);
  if (opened.length !== 1) throw new Error(`Report it opened ${opened.length} pages`);
  return opened[0]!;
}
