// Building the Panel's elements.

/** A new `tag` element with the class names in `className`. */
export function create<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  return element;
}

let idCount = 0;

/** An id no other element in the page has, for linking a label to its field. */
export function uniqueId(name: string): string {
  idCount += 1;
  return `chrono-${name}-${idCount}`;
}

/** A scope's progress bar: how much of it has played, running from night to dawn. */
export interface Progress {
  element: HTMLElement;
  /** Shows `share`, from 0 to 1, or hides the bar when there is none. */
  show(share: number | undefined): void;
}

/** A progress bar. It is decoration: the scope's remaining already says how far it has to go. */
export function createProgress(): Progress {
  const element = create('div', 'progress');
  element.setAttribute('aria-hidden', 'true');
  return {
    element,
    show(share) {
      element.hidden = share === undefined;
      if (share !== undefined) element.style.setProperty('--progress', share.toFixed(4));
    },
  };
}

/**
 * Plays a short animation on `element` that answers something the viewer did, unless they
 * asked their system for less motion or the browser can't animate.
 */
export function playMotion(element: Element | null, keyframes: Keyframe[], duration = 260): void {
  if (!element || typeof element.animate !== 'function') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  element.animate(keyframes, { duration, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
}
