// Building the Panel's elements, and the one-shot motion that answers what the viewer does.

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

/** A scope's progress bar: how much of it has played, in YouTube's progress red. */
export interface Progress {
  element: HTMLElement;
  /** Shows `share`, from 0 to 1, or hides the bar when there is none. */
  show(share: number | undefined): void;
}

/** A progress bar. It is decoration: the scope's remaining already says how far it has to go. */
export function createProgress(): Progress {
  const element = create('div', 'progress');
  element.setAttribute('aria-hidden', 'true');
  element.append(create('div', 'progress-played'));
  return {
    element,
    show(share) {
      element.hidden = share === undefined;
      if (share !== undefined) element.style.setProperty('--played', share.toFixed(4));
    },
  };
}

/**
 * The Material 3 easings the spec names. The spring is Material 3 Expressive's effects
 * spring, which settles without overshooting.
 */
export const EASE = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  decelerate: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  accelerate: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
  spring:
    'linear(0, 0.004 1%, 0.019 2.2%, 0.079 5%, 0.161 7.8%, 0.464 17%, 0.557 20.2%, 0.637 23.5%, 0.706 26.8%, 0.767 30.2%, 0.817 33.8%, 0.860 37.5%, 0.899 42%, 0.929 46.8%, 0.953 52.2%, 0.971 58.5%, 0.991 73.8%, 1)',
} as const;

export interface MotionOptions {
  /** Milliseconds. */
  duration: number;
  easing?: string;
  delay?: number;
  /** How the first or last keyframe holds outside the animation's run, 'backwards' by default. */
  fill?: FillMode;
  /**
   * Whether the animation only fades. Fades still play, at most 100 ms long, when the viewer
   * asks their system for less motion; anything that moves or scales doesn't.
   */
  fadeOnly?: boolean;
}

/** Whether the viewer asked their system for less motion. */
export function prefersLessMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Plays a short animation on `element` that answers something the viewer did, and returns
 * it. Returns undefined, having played nothing, when the viewer asked for less motion (and
 * it isn't only a fade), when the browser can't animate, or when the element isn't laid out,
 * so there's nothing to see move.
 */
export function playMotion(
  element: Element | null | undefined,
  keyframes: Keyframe[],
  { duration, easing = EASE.standard, delay = 0, fill = 'backwards', fadeOnly = false }: MotionOptions,
): Animation | undefined {
  if (!element || typeof element.animate !== 'function' || !isLaidOut(element)) return undefined;
  if (prefersLessMotion()) {
    if (!fadeOnly) return undefined;
    duration = Math.min(duration, 100);
    delay = 0;
  }
  return element.animate(keyframes, { duration, easing, delay, fill });
}

/**
 * Calls `then` once, when every one of `animations` has run its course. It goes by their
 * timing rather than their `finished` promises or finish events, which a content script in
 * Chrome doesn't reliably get. Callers check the animations are still theirs.
 */
export function afterMotion(animations: Animation[], then: () => void): void {
  const end = Math.max(0, ...animations.map((animation) => Number(animation.effect?.getComputedTiming().endTime ?? 0)));
  setTimeout(then, end);
}

/** Whether `element` takes up space on the page, so motion on it can be seen. */
export function isLaidOut(element: Element): boolean {
  const { width, height } = element.getBoundingClientRect();
  return width > 0 || height > 0;
}
