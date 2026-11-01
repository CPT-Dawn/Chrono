// Trims a YouTube page saved from a real browser into a saved page for tests: the
// page's markup in, the saved page's markup out. scripts/trim-youtube-page.ts reads and
// writes the files.
import { type Element as SavedElement, Window } from 'happy-dom';

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

export interface TrimmedPage {
  /** The saved page's markup. */
  page: string;
  /** How many links were opened inside another link and saved as a <span>. */
  nestedLinks: number;
}

export function trimPage(raw: string): TrimmedPage {
  const { html, rewritten } = rewriteNestedLinks(raw);
  const doc = parse(html);
  for (const el of doc.querySelectorAll(REMOVE.join(','))) el.remove();
  for (const list of doc.querySelectorAll(VIDEO_LISTS.join(','))) {
    for (const item of [...list.children].slice(VIDEO_LIST_KEEP)) item.remove();
  }
  for (const entry of doc.querySelectorAll(PLAYLIST_ENTRIES)) {
    for (const el of entry.querySelectorAll(PLAYLIST_ENTRY_CLUTTER.join(','))) el.remove();
  }
  // The video's blob: source means nothing outside the browser that saved the page.
  for (const video of doc.querySelectorAll('video')) video.removeAttribute('src');
  // A capture inlines every image as a data: URI, which is most of its size, and SingleFile
  // marks up what it touched with data-sf-* attributes. Tests need neither. The hidden
  // attribute and the sf-hidden class stay: they record what YouTube's styles hid on screen.
  for (const el of doc.querySelectorAll('*')) dropCaptureAttributes(el);

  const comment = leadingComment(readSingleFileHeader(raw), rewritten);
  return { page: `<!DOCTYPE html>\n${comment}${serialize(doc.documentElement, 0)}`, nestedLinks: rewritten };
}

// A style declaration whose value is an inline data: URI, e.g. a background image.
const DATA_URI_DECLARATION = /[^;]*url\(\s*["']?\s*data:[^)]*\)[^;]*;?/gi;

function dropCaptureAttributes(el: SavedElement): void {
  for (const { name, value: attributeValue } of [...el.attributes]) {
    const value = attributeValue ?? '';
    if (name.startsWith('data-sf-') || /^\s*data:/i.test(value)) {
      el.removeAttribute(name);
    } else if (name === 'style' && /data:/i.test(value)) {
      const kept = value
        .replace(DATA_URI_DECLARATION, '')
        .split(';')
        .map((declaration) => declaration.trim())
        .filter(Boolean);
      if (kept.length > 0) el.setAttribute('style', kept.join('; '));
      else el.removeAttribute('style');
    }
  }
}

interface SingleFileHeader {
  url: string;
  savedDate: string;
}

// SingleFile opens the page with a comment naming the address and the time it was saved.
function readSingleFileHeader(raw: string): SingleFileHeader | undefined {
  const comment = /<!--\s*Page saved with SingleFile([\s\S]*?)-->/.exec(raw)?.[1];
  const url = comment && /^\s*url:\s*(.+?)\s*$/m.exec(comment)?.[1];
  const savedDate = comment && /^\s*saved date:\s*(.+?)\s*$/m.exec(comment)?.[1];
  return url && savedDate ? { url, savedDate } : undefined;
}

// In the style of the saved pages' own leading comments: where and when the page was
// saved, and how links nested in links were kept.
function leadingComment(header: SingleFileHeader | undefined, nestedLinks: number): string {
  const lines: string[] = [];
  if (header) lines.push(`Saved with SingleFile from ${header.url}`, `on ${header.savedDate}.`);
  if (nestedLinks > 0) {
    lines.push(
      "HTML can't hold a link inside a link, and YouTube builds playlist entries that way from",
      'script, so each link nested in another was saved as a <span> with the same attributes.',
    );
  }
  if (lines.length === 0) return '';
  return `<!--\n${lines.map((line) => `  ${line}\n`).join('')}-->\n`;
}

export interface RewrittenLinks {
  html: string;
  /** How many links were opened inside another link and saved as a <span>. */
  rewritten: number;
}

// Comments and the raw text of scripts and styles pass through untouched; any tag is
// matched whole, quoted attribute values included, so a ">" inside one can't end it early.
const MARKUP =
  /<!--[\s\S]*?-->|<(script|style)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>|<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;

/**
 * HTML can't hold a link inside a link, but YouTube builds some entries that way from
 * script, and a browser saves them nested. Parsing would close the outer link early and
 * move what follows it, so each link opened inside another becomes a <span> with the same
 * attributes, closing tag included.
 */
export function rewriteNestedLinks(html: string): RewrittenLinks {
  // One entry per open <a>: whether it was saved as a <span>.
  const open: boolean[] = [];
  let rewritten = 0;
  const out = html.replace(MARKUP, (tag, _raw, closing: string | undefined, name: string | undefined, rest: string) => {
    if (name?.toLowerCase() !== 'a') return tag;
    if (closing) {
      return open.pop() ? `</span${rest}>` : tag;
    }
    const nested = open.length > 0;
    open.push(nested);
    if (!nested) return tag;
    rewritten++;
    return `<span${rest}>`;
  });
  return { html: out, rewritten };
}

function parse(html: string) {
  return new window.DOMParser().parseFromString(html, 'text/html');
}

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
