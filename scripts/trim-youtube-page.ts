// Turns a YouTube page saved from a real browser into a small, readable saved page for tests.
//
//   node scripts/trim-youtube-page.ts <saved.html> tests/pages/<name>.html
//
// It removes what tests never need (scripts, styles, icons) and anything personal
// (the signed-in masthead, the subscriptions guide, comments, live chat), keeps only
// the first few related and recommended videos, and writes one element per line so diffs
// stay readable.
import { readFileSync, writeFileSync } from 'node:fs';
import { Window } from 'happy-dom';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node scripts/trim-youtube-page.ts <saved.html> <out.html>');
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
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'source', 'track', 'wbr']);

const window = new Window({
  url: 'https://www.youtube.com/',
  settings: {
    disableJavaScriptEvaluation: true,
    disableJavaScriptFileLoading: true,
    disableCSSFileLoading: true,
  },
});
const doc = new window.DOMParser().parseFromString(readFileSync(input, 'utf8'), 'text/html');

for (const el of doc.querySelectorAll(REMOVE.join(','))) el.remove();
for (const list of doc.querySelectorAll(VIDEO_LISTS.join(','))) {
  for (const item of [...list.children].slice(VIDEO_LIST_KEEP)) item.remove();
}
// The video's blob: source means nothing outside the browser that saved the page.
for (const video of doc.querySelectorAll('video')) video.removeAttribute('src');

writeFileSync(output, `<!DOCTYPE html>\n${serialize(doc.documentElement, 0)}`);
console.log(`Wrote ${output}`);

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
