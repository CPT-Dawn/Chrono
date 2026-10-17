// The Panel's ⋮ menu: a button and the popup it opens, following the WAI-ARIA menu
// button pattern: arrow keys, Home and End move between its items.
import { CHECK, createIcon, DOTS } from '@/icons';

export interface Menu {
  button: HTMLButtonElement;
  popup: HTMLElement;
  /** Closes the menu and puts focus back on its button. */
  close(): void;
}

/** A ⋮ button whose popup opens below it. `id` must be unique in the Panel's shadow root. */
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

  const isInside = (target: EventTarget | null) =>
    target instanceof Node && (popup.contains(target) || button.contains(target));
  const onPointerDown = (event: PointerEvent) => {
    if (!event.composedPath().some(isInside)) close();
  };

  function open() {
    setOpen(true);
    document.addEventListener('pointerdown', onPointerDown, true);
    popup.focus();
  }

  function close({ refocus = false } = {}) {
    if (popup.hidden) return;
    setOpen(false);
    document.removeEventListener('pointerdown', onPointerDown, true);
    if (refocus) button.focus();
  }

  function setOpen(isOpen: boolean) {
    button.setAttribute('aria-expanded', String(isOpen));
    popup.hidden = !isOpen;
  }

  button.addEventListener('click', () => {
    if (popup.hidden) open();
    else close();
  });
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !popup.hidden) {
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

  setOpen(false);
  return { button, popup, close: () => close({ refocus: true }) };
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

/**
 * A menu item that toggles or picks, like a checkbox or radio button. Click, Enter and
 * Space all activate it, and the menu stays open so the viewer sees the result.
 */
export function createCheckItem(role: 'menuitemcheckbox' | 'menuitemradio', label: string, onActivate: () => void): HTMLElement {
  const item = document.createElement('div');
  item.className = 'menu-item';
  item.setAttribute('role', role);
  item.tabIndex = -1;
  item.append(createIcon(CHECK));
  item.append(label);
  item.addEventListener('click', onActivate);
  item.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onActivate();
  });
  return item;
}

/**
 * A menu item that does something, like opening a page, with an optional icon. Click, Enter
 * and Space activate it.
 */
export function createActionItem(label: string, onActivate: () => void, icon = ''): HTMLElement {
  const item = document.createElement('div');
  item.className = 'menu-item';
  item.setAttribute('role', 'menuitem');
  item.tabIndex = -1;
  if (icon) item.append(createIcon(icon));
  item.append(label);
  item.addEventListener('click', onActivate);
  item.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onActivate();
  });
  return item;
}
