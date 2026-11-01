// Rolling text, for the speed readout and the remaining. When the speed changes, the
// characters that change roll like an odometer: the new ones come up from below when the
// speed goes up, and down from above when it goes down. Every other change, like the
// remaining ticking down each second, happens in place.
//
// The element always holds its real text, which screen readers read. While a roll plays,
// that text turns transparent under a copy that moves, which screen readers skip.
import { afterMotion, create, EASE, playMotion } from './dom';

export interface RollingText {
  /** Shows `text`, rolling what changed in `direction` (1 for up, -1 for down), or in place without one. */
  set(text: string, direction?: 1 | -1): void;
}

const DURATION = 250;

export function createRollingText(element: HTMLElement): RollingText {
  let roll: { overlay: HTMLElement; animations: Animation[] } | undefined;

  function stop() {
    if (!roll) return;
    for (const animation of roll.animations) animation.cancel();
    roll.overlay.remove();
    element.classList.remove('rolling');
    roll = undefined;
  }

  return {
    set(text, direction) {
      const from = roll ? element.firstChild?.textContent ?? '' : element.textContent ?? '';
      if (text === from) return;
      stop();
      element.textContent = text;
      if (!direction || !from) return;

      const overlay = create('span', 'roll');
      overlay.setAttribute('aria-hidden', 'true');
      const slots = changedParts(from, text).map(({ text: part, old }) => {
        if (old === undefined) return part;
        const slot = create('span', 'roll-slot');
        const next = create('span', 'roll-next');
        next.textContent = part;
        const previous = create('span', 'roll-old');
        previous.textContent = old;
        slot.append(next, previous);
        return slot;
      });
      overlay.append(...slots);
      element.append(overlay);
      element.classList.add('rolling');

      const shift = (share: number) => `translateY(${share * direction * 100}%)`;
      const options = { duration: DURATION, easing: EASE.spring, fill: 'both' as const };
      const animations = [...overlay.querySelectorAll('.roll-slot')].flatMap((slot) => [
        playMotion(slot.firstElementChild, [{ transform: shift(1), opacity: 0 }, { transform: 'none', opacity: 1 }], options),
        playMotion(slot.lastElementChild, [{ transform: 'none', opacity: 1 }, { transform: shift(-1), opacity: 0 }], options),
      ]);
      const played = animations.filter((animation): animation is Animation => animation !== undefined);
      if (played.length === 0) {
        overlay.remove();
        element.classList.remove('rolling');
        return;
      }
      const current = { overlay, animations: played };
      roll = current;
      afterMotion(played, () => {
        if (roll === current) stop();
      });
    },
  };
}

/**
 * `to` in parts, each with the `old` text it replaces in `from` when it changed. Texts of the
 * same length compare character by character, as digits in tabular figures line up; otherwise
 * what lies between their common start and end changes as one.
 */
function changedParts(from: string, to: string): { text: string; old?: string }[] {
  if (from.length === to.length) {
    return [...to].map((char, i) => (char === from[i] ? { text: char } : { text: char, old: from[i] }));
  }
  let start = 0;
  while (start < Math.min(from.length, to.length) && from[start] === to[start]) start += 1;
  let end = 0;
  while (
    end < Math.min(from.length, to.length) - start &&
    from[from.length - 1 - end] === to[to.length - 1 - end]
  ) {
    end += 1;
  }
  return [
    { text: to.slice(0, start) },
    { text: to.slice(start, to.length - end), old: from.slice(start, from.length - end) },
    { text: to.slice(to.length - end) },
  ].filter((part) => part.text !== '' || part.old !== undefined);
}
