// The toolbar popup side of Seam 1: Chrono's popup page, opened in its own window as the
// browser opens it when the viewer clicks Chrono's toolbar icon. It shares the fake
// browser, and so its storage, with the content script running on the YouTube page.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { within } from '@testing-library/dom';
import { Window } from 'happy-dom';
import { onTestFinished } from 'vitest';
import { startPopup } from '@/popup/popup';
import { settle } from './chrono';

/** Opens Chrono's popup and returns queries scoped to what it shows. */
export async function openPopup() {
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
