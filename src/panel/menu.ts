// The Panel's ⋮ menu: a button and the menu it opens, following the WAI-ARIA menu button
// pattern: arrow keys, Home and End move between its items, and Escape closes it.
//
// The menu is a popover, so it shows in the browser's top layer, above YouTube's playlist
// panel and masthead, which would otherwise cover it. It still lives in the Panel's shadow
// root, so the Panel's styles and colours reach it. Browsers without popovers, and tests,
// get the same menu shown and hidden in place.
import { CHECK, createIcon, DOTS } from '@/icons';
import { afterMotion, EASE, playMotion } from './dom';

export interface Menu {
  button: HTMLButtonElement;
  popup: HTMLElement;
  /** Closes the menu and puts focus back on its button. */
  close(): void;
  /** Calls `listener` each time the menu opens. */
  onOpen(listener: () => void): void;
}

/** The gap between the menu and its button, and the least it keeps from the window's edges. */
const GAP = 4;
const MARGIN = 8;

/** A ⋮ button whose menu opens below it. `id` must be unique in the Panel's shadow root. */
export function createMenu(id: string, label: string): Menu {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button';
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-controls', id);
  button.append(createIcon(DOTS));

  const popup = document.createElement('div');
  popup.id = id;
  popup.className = 'menu';
  popup.setAttribute('role', 'menu');
  popup.setAttribute('aria-label', label);
  popup.tabIndex = -1;
  const canPop = typeof popup.showPopover === 'function';
  if (canPop) popup.popover = 'manual';

  let isOpen = false;
  /** The closing fade, while it plays. */
  let exit: Animation | undefined;
  const openListeners: (() => void)[] = [];

  const isInside = (target: EventTarget | null) =>
    target instanceof Node && (popup.contains(target) || button.contains(target));
  const onPointerDown = (event: PointerEvent) => {
    if (!event.composedPath().some(isInside)) close();
  };
  // The page can scroll or resize under an open menu; it follows its button, once a frame.
  let frame = 0;
  const onMove = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      place();
    });
  };

  function open() {
    exit?.cancel();
    exit = undefined;
    isOpen = true;
    button.setAttribute('aria-expanded', 'true');
    popup.inert = false;
    if (canPop) popup.showPopover();
    popup.hidden = false;
    const below = place();
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onMove, { capture: true, passive: true });
    window.addEventListener('resize', onMove);
    popup.focus();
    // It grows from the corner nearest its button.
    popup.style.transformOrigin = below ? 'top right' : 'bottom right';
    playMotion(popup, [{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }], {
      duration: 150,
      easing: EASE.decelerate,
    }) ??
      playMotion(popup, [{ opacity: 0 }, { opacity: 1 }], { duration: 150, fadeOnly: true });
    for (const listener of openListeners) listener();
  }

  function close({ refocus = false } = {}) {
    if (!isOpen) return;
    isOpen = false;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('scroll', onMove, { capture: true });
    window.removeEventListener('resize', onMove);
    cancelAnimationFrame(frame);
    frame = 0;
    if (refocus) button.focus();
    // It fades out, and can't be used while it does.
    popup.inert = true;
    exit = playMotion(popup, [{ opacity: 1 }, { opacity: 0 }], {
      duration: 100,
      easing: EASE.accelerate,
      fill: 'forwards',
      fadeOnly: true,
    });
    if (!exit) return hide();
    const fading = exit;
    afterMotion([fading], () => {
      if (exit !== fading) return;
      exit = undefined;
      fading.cancel();
      hide();
    });
  }

  function hide() {
    if (canPop && popup.matches(':popover-open')) popup.hidePopover();
    // Without popovers, `hidden` hides the menu. With them, hiding the popover does.
    if (!canPop) popup.hidden = true;
  }

  /**
   * Puts the menu under its button, right-aligned with it, or above it when there's no room
   * below. Returns whether it went below.
   */
  function place(): boolean {
    if (!canPop) return true;
    const anchor = button.getBoundingClientRect();
    popup.style.maxHeight = `${window.innerHeight - 2 * MARGIN}px`;
    const { width, height } = popup.getBoundingClientRect();
    const roomBelow = window.innerHeight - MARGIN - anchor.bottom - GAP;
    const below = height <= roomBelow || roomBelow >= anchor.top - MARGIN - GAP;
    const top = below ? anchor.bottom + GAP : anchor.top - GAP - height;
    const left = Math.min(Math.max(MARGIN, anchor.right - width), window.innerWidth - MARGIN - width);
    popup.style.top = `${Math.round(Math.max(MARGIN, Math.min(top, window.innerHeight - MARGIN - height)))}px`;
    popup.style.left = `${Math.round(left)}px`;
    return below;
  }

  button.addEventListener('click', (event) => {
    // The rest of the Panel's row expands and collapses its details.
    event.stopPropagation();
    if (isOpen) close();
    else open();
  });
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && isOpen) {
      event.stopPropagation();
      close({ refocus: true });
    }
  };
  button.addEventListener('keydown', onKeyDown);
  popup.addEventListener('keydown', (event) => {
    onKeyDown(event);
    const items = [...popup.querySelectorAll<HTMLElement>(ITEMS)];
    const current = items.indexOf(event.target as HTMLElement);
    const next = nextItem(event.key, current, items.length);
    if (next === undefined) return;
    event.preventDefault();
    items[next]?.focus();
  });
  popup.addEventListener('focusout', (event) => {
    // Focus moving to nothing is a click on the page, which onPointerDown handles.
    if (event.relatedTarget && !isInside(event.relatedTarget)) close();
  });

  button.setAttribute('aria-expanded', 'false');
  if (!canPop) popup.hidden = true;
  return {
    button,
    popup,
    close: () => close({ refocus: true }),
    onOpen: (listener) => openListeners.push(listener),
  };
}

const ITEMS = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';

/**
 * Which of `count` items a key moves focus to from item `current` (-1 for the menu
 * itself), wrapping around as the WAI-ARIA menu pattern does. Undefined for other keys.
 */
function nextItem(key: string, current: number, count: number): number | undefined {
  if (count === 0) return undefined;
  switch (key) {
    case 'ArrowDown':
      return (current + 1) % count;
    case 'ArrowUp':
      return current <= 0 ? count - 1 : current - 1;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return undefined;
  }
}

/** A menu row with the role `role`, which click, Enter and Space all activate. */
function menuItem(role: string, onActivate: () => void): HTMLElement {
  const item = document.createElement('div');
  item.className = 'menu-item';
  item.setAttribute('role', role);
  item.tabIndex = -1;
  item.addEventListener('click', onActivate);
  item.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onActivate();
  });
  return item;
}

/**
 * A menu item that picks one of a group of choices, with a check at its end when chosen.
 * The menu stays open so the viewer sees the result.
 */
export function createRadioItem(label: string, onActivate: () => void): HTMLElement {
  const item = menuItem('menuitemradio', onActivate);
  const text = document.createElement('span');
  text.className = 'menu-label';
  text.textContent = label;
  item.append(text, createIcon(CHECK));
  return item;
}

/**
 * A menu item that turns something on or off, with YouTube's switch at its end. The menu
 * stays open so the viewer sees the result.
 */
export function createSwitchItem(label: string, onActivate: () => void): HTMLElement {
  const item = menuItem('menuitemcheckbox', onActivate);
  const text = document.createElement('span');
  text.className = 'menu-label';
  text.textContent = label;
  const track = document.createElement('span');
  track.className = 'switch';
  track.setAttribute('aria-hidden', 'true');
  item.append(text, track);
  return item;
}

/** A menu item that does something, like opening a page, with its icon. */
export function createActionItem(label: string, onActivate: () => void, icon: string): HTMLElement {
  const item = menuItem('menuitem', onActivate);
  const text = document.createElement('span');
  text.className = 'menu-label';
  text.textContent = label;
  item.append(createIcon(icon), text);
  return item;
}
