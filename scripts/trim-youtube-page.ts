// Turns a YouTube page saved from a real browser into a small, readable saved page for tests.
//
//   bun run trim-page -- <saved.html> tests/pages/<name>.html
//
// The input is the live DOM, saved with SingleFile or copied from DevTools. Links YouTube
// nested inside links are rewritten as <span>s first, so the page parses as the browser
// showed it. Then it removes what tests never need (scripts, styles, icons, inline data:
// images, SingleFile's own attributes) and anything personal
// (the signed-in masthead, the subscriptions guide, comments, live chat), keeps only
// the first few related and recommended videos, and writes one element per line so diffs
// stay readable.
import { readFileSync, writeFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { unnestLinks } from './nested-links';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: bun run trim-page -- <saved.html> <out.html>');
  process.exit(1);
}

const REMOVE = [
  'script',
  'style',
  'link',
  'meta',
  'noscript',
  'iframe',
  'svg',
  'iron-iconset-svg',
  '#masthead-container',
  'tp-yt-app-drawer#guide',
  'ytd-mini-guide-renderer',
  'ytd-comments',
  '#chat-container > *',
];
// Lists of other videos: the watch page's related videos, and the player's recommendations.
const VIDEO_LISTS = [
  'ytd-watch-next-secondary-results-renderer ytd-item-section-renderer > #contents',
  '.ytFullscreenVideoRecommendationsHost',
];
const VIDEO_LIST_KEEP = 3;
// A playlist page lists up to a hundred entries at once, all of which tests need. Inside
// each, these parts only make the saved page huge: images, avatars, the channel and view
// count, empty badge slots, menus and hover effects. Titles, links and lengths stay.
const PLAYLIST_ENTRIES = 'ytd-playlist-video-renderer, yt-lockup-view-model';
const PLAYLIST_ENTRY_CLUTTER = [
  'img',
  'yt-image',
  'yt-icon',
  'dom-repeat',
  'tp-yt-paper-tooltip',
  'yt-interaction',
  'yt-touch-feedback-shape',
  'ytd-menu-renderer',
  'button-view-model',
  'ytd-badge-supported-renderer',
  'ytd-video-meta-block',
  'yt-content-metadata-view-model',
  'ytd-thumbnail-overlay-now-playing-renderer',
  'thumbnail-overlay-avatar-stack-view-model',
  'yt-thumbnail-hover-overlay-toggle-actions-view-model',
  'yt-decorated-avatar-view-model',
];
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'source', 'track', 'wbr']);

const window = new Window({
  url: 'https://www.youtube.com/',
  settings: {
    disableJavaScriptEvaluation: true,
    disableJavaScriptFileLoading: true,
    disableCSSFileLoading: true,
  },
});
const saved = readFileSync(input, 'utf8');
const source = readSingleFileHeader(saved);
const { html, rewritten } = unnestLinks(saved);
const doc = new window.DOMParser().parseFromString(html, 'text/html');

for (const el of doc.querySelectorAll(REMOVE.join(','))) el.remove();
for (const list of doc.querySelectorAll(VIDEO_LISTS.join(','))) {
  for (const item of [...list.children].slice(VIDEO_LIST_KEEP)) item.remove();
}
for (const entry of doc.querySelectorAll(PLAYLIST_ENTRIES)) {
  for (const el of entry.querySelectorAll(PLAYLIST_ENTRY_CLUTTER.join(','))) el.remove();
}
// The video's blob: source means nothing outside the browser that saved the page.
for (const video of doc.querySelectorAll('video')) video.removeAttribute('src');
// Inline data: images make up most of a saved page's size, and SingleFile marks up what it
// saved with data-sf-* attributes. SingleFile also saves each canvas as an inline
// background image. SingleFile's sf-hidden class and the hidden attribute stay: they record what
// YouTube's styles hid on screen.
const INLINE_IMAGE = /url\(\s*(["']?)data:[^"')]*\1\s*\)/gi;
for (const el of doc.querySelectorAll('*')) {
  for (const attribute of [...el.attributes]) {
    const { name } = attribute;
    const value = attribute.value ?? '';
    if (name.startsWith('data-sf-') || /^\s*data:/i.test(value)) el.removeAttribute(name);
    else if (value.includes('data:')) el.setAttribute(name, value.replace(INLINE_IMAGE, 'none'));
  }
}

const page = `<!DOCTYPE html>\n${leadingComment()}\n${serialize(doc.documentElement, 0)}`;
writeFileSync(output, page);
console.log(`Wrote ${output}`);
console.log(`  ${rewritten} nested links saved as <span>`);
console.log(`  ${formatSize(Buffer.byteLength(saved))} -> ${formatSize(Buffer.byteLength(page))}`);
if (!source) console.warn('  No SingleFile header: add where and when the page was saved to its leading comment.');

// SingleFile opens its page with a comment saying where and when it was saved.
function readSingleFileHeader(text: string): { url: string; date: string } | undefined {
  const comment = /<!--\s*Page saved with SingleFile\b([\s\S]*?)-->/.exec(text)?.[1] ?? '';
  const url = /^\s*url:\s*(\S+)/m.exec(comment)?.[1];
  const date = /^\s*saved date:\s*(.+?)\s*$/m.exec(comment)?.[1];
  return url && date ? { url, date } : undefined;
}

function leadingComment(): string {
  const lines = source ? [`Saved from ${source.url}`, `with SingleFile on ${source.date}.`] : ['Saved from youtube.com.'];
  lines.push(
    "HTML can't hold a link inside a link, and YouTube builds some entries that way from",
    'script, so each link nested in another was saved as a <span> with the same attributes.',
  );
  return `<!--\n${lines.map((line) => `  ${line}`).join('\n')}\n-->`;
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

type SavedElement = (typeof doc)['documentElement'];

function serialize(el: SavedElement, depth: number): string {
  const indent = ' '.repeat(depth);
  const tag = el.tagName.toLowerCase();
  const attrs = [...el.attributes]
    .map((a) => (a.value ? ` ${a.name}="${escapeHtml(a.value, true)}"` : ` ${a.name}`))
    .join('');
  const open = `${indent}<${tag}${attrs}>`;
  if (VOID.has(tag)) return `${open}\n`;

  const parts: string[] = [];
  for (const child of el.childNodes) {
    if (child.nodeType === child.ELEMENT_NODE) {
      parts.push(serialize(child as SavedElement, depth + 1));
    } else if (child.nodeType === child.TEXT_NODE) {
      const text = (child.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text) parts.push(`${indent} ${escapeHtml(text, false)}\n`);
    }
  }
  // Keep short text-only elements on one line, e.g. <span>10:34</span>.
  const only = el.childNodes.length === 1 ? el.childNodes[0] : undefined;
  if (only !== undefined && only.nodeType === only.TEXT_NODE && parts.length === 1) {
    return `${open}${parts[0]!.trim()}</${tag}>\n`;
  }
  if (parts.length === 0) return `${open}</${tag}>\n`;
  return `${open}\n${parts.join('')}${indent}</${tag}>\n`;
}

function escapeHtml(text: string, attribute: boolean): string {
  const out = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return attribute ? out.replace(/"/g, '&quot;') : out;
}
