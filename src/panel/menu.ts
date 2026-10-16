// The Panel's ⋮ menu: a button and the popup it opens, following the WAI-ARIA menu
// button pattern. Items arrive with the settings and links.

export interface Menu {
  button: HTMLButtonElement;
  popup: HTMLElement;
}

/** A ⋮ button whose popup opens below it. `id` must be unique in the Panel's shadow root. */
export function createMenu(id: string, label: string): Menu {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button';
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-controls', id);
  button.innerHTML = DOTS;

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
  popup.addEventListener('keydown', onKeyDown);
  popup.addEventListener('focusout', (event) => {
    // Focus moving to nothing is a click on the page, which onPointerDown handles.
    if (event.relatedTarget && !isInside(event.relatedTarget)) close();
  });

  setOpen(false);
  return { button, popup };
}

const DOTS =
  '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="currentColor">' +
  '<circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>' +
  '</svg>';
