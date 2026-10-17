// Chrono's icons, as SVG markup for createIcon. They are decoration: every control that
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
 * Chrono's mark: a dial whose arc runs from night to dawn, and a hand reaching into the gap
 * where it ends. The surface it sits on defines --dawn-1, --dawn-2 and --dawn-3.
 */
export const MARK = svg(
  '<defs><linearGradient id="chrono-dawn" x1="3" y1="18" x2="21" y2="9" gradientUnits="userSpaceOnUse">' +
    '<stop offset="0" style="stop-color: var(--dawn-1)"/>' +
    '<stop offset="0.55" style="stop-color: var(--dawn-2)"/>' +
    '<stop offset="1" style="stop-color: var(--dawn-3)"/>' +
    '</linearGradient></defs>' +
    '<path d="M12 3a9 9 0 1 0 9 9" fill="none" stroke="url(#chrono-dawn)" stroke-width="2.6" stroke-linecap="round"/>' +
    '<g class="mark-hand"><path d="M12 12l5-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' +
    '<circle cx="12" cy="12" r="1.9" fill="currentColor"/></g>',
  'class="mark"',
);

export const CHEVRON = svg(line('M7 10l5 5 5-5'));

export const CHECK = svg(line('M5 12.5l4.5 4.5L19 7.5'));

export const DOTS = svg(
  '<circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>',
  'fill="currentColor"',
);

export const MINUS = svg(line('M6 12h12'));

export const PLUS = svg(line('M12 6v12M6 12h12'));

/** Each outward link's icon: a heart for support, a question for help, a flag for a report. */
export const LINK_ICONS: Record<OutwardLink, string> = {
  tip: svg(line('M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z')),
  help: svg(line('M9.2 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5M12 18h.01') + line('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z')),
  report: svg(line('M5 21V4M5 4h11l-2 4 2 4H5')),
};
