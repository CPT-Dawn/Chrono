// Chrono's icons, as SVG markup for createIcon. They follow YouTube's own icon style: a
// 24-unit grid, a 2-unit line with round ends, and currentColor, so they sit beside
// YouTube's icons as if they were part of the set. They are decoration: every control that
// shows one has a text label or an aria-label of its own.
import type { OutwardLink } from '@/links';

const svg = (body: string, attributes = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" ${attributes}>${body}</svg>`;

/**
 * A new element for the icon `markup`, one of the constants below. It is parsed as SVG
 * rather than set as innerHTML, which add-on store reviews flag as unsafe.
 */
export function createIcon(markup: string): SVGSVGElement {
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
  return document.importNode(parsed.documentElement, true) as unknown as SVGSVGElement;
}

const line = (d: string) =>
  `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;

/**
 * Chrono's mark: a progress bar wrapped into a clock face. The ring runs clockwise from
 * twelve to the playhead, a dot in YouTube's progress red, and the hands read the time.
 * The ring and hands take currentColor; the playhead takes --chrono-playhead, which falls
 * back to YouTube's red. Its parts have classes so the Panel can animate them.
 */
export const MARK = svg(
  '<path class="mark-ring" d="M12 3.5A8.5 8.5 0 1 1 4.64 7.75" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' +
    '<g class="mark-hands" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">' +
    '<path d="M12 12V7.6"/><path d="M12 12l3.2 2"/></g>' +
    '<circle class="mark-playhead" cx="4.64" cy="7.75" r="2.6" style="fill: var(--chrono-playhead, #f03)"/>',
  'class="mark"',
);

/** Expand more, as on YouTube's description box. The Panel rotates it when expanded. */
export const CHEVRON = svg(line('M6 9l6 6 6-6'));

/** A selected choice. */
export const CHECK = svg(line('M4.5 12.5l5 5L19.5 7'));

/** More actions: YouTube's vertical ellipsis. */
export const DOTS = svg(
  '<circle cx="12" cy="5" r="1.75"/><circle cx="12" cy="12" r="1.75"/><circle cx="12" cy="19" r="1.75"/>',
  'fill="currentColor"',
);

export const MINUS = svg(line('M6 12h12'));

export const PLUS = svg(line('M12 6v12M6 12h12'));

/** The Chapter scope: chapter markers, as in YouTube's chapter list. */
export const CHAPTERS = svg(line('M4 6h10M4 12h16M4 18h12'));

/** The Playlist scope: YouTube's playlist glyph, lines and a play triangle. */
export const PLAYLIST = svg(
  line('M4 6h13M4 12h9M4 18h7') + '<path d="M16 14.2v5.6a.6.6 0 0 0 .9.5l4.4-2.8a.6.6 0 0 0 0-1l-4.4-2.8a.6.6 0 0 0-.9.5z" fill="currentColor"/>',
);

/** A caution: a required speed YouTube can't play, or a target that can't be met. */
export const CAUTION = svg(line('M12 3.5L2.8 19.5h18.4z') + line('M12 10v4') + '<circle cx="12" cy="17" r="1.1" fill="currentColor"/>');

/** Each outward link's icon: a heart for support, a question for help, a flag for a report. */
export const LINK_ICONS: Record<OutwardLink, string> = {
  tip: svg(line('M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z')),
  help: svg(
    line('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z') + line('M9.4 9.4a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.3-2.6 4') + '<circle cx="12" cy="17.2" r="1.1" fill="currentColor"/>',
  ),
  report: svg(line('M5.5 21V4.5M5.5 4.5h11.5l-2.2 4 2.2 4H5.5')),
};
