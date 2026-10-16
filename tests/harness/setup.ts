import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { configure, prettyDOM } from '@testing-library/dom';
import { afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { stopChrono } from './chrono';

type Messages = Record<string, { message: string; placeholders?: Record<string, { content: string }> }>;

const messages: Messages = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../public/_locales/en/messages.json'), 'utf8'),
);

// WXT's fake browser leaves i18n unimplemented. This follows the browser's rules for
// messages.json: $NAME$ placeholders, $1–$9 substitutions and $$ for a literal $.
fakeBrowser.i18n.getMessage = (name: string, substitutions?: string | (string | number)[]) => {
  const entry = messages[name];
  if (!entry) return '';
  const subs = [substitutions ?? []].flat().map(String);
  return entry.message
    .replace(/\$([a-z0-9_@]+)\$/gi, (_, name: string) => entry.placeholders?.[name.toLowerCase()]?.content ?? '')
    .replace(/\$(\d)/g, (_, n: string) => subs[Number(n) - 1] ?? '')
    .replace(/\$\$/g, '$');
};

// Testing Library can't print a shadow root when a query fails, and the Panel lives in one.
configure({
  getElementError(message, container) {
    const markup =
      container instanceof ShadowRoot
        ? [...container.children].filter((c) => c.localName !== 'style').map((c) => c.outerHTML).join('\n')
        : prettyDOM(container);
    const error = new Error([message, markup].filter(Boolean).join('\n\n'));
    error.name = 'TestingLibraryElementError';
    return error;
  },
});

afterEach(() => {
  stopChrono();
  fakeBrowser.reset();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
