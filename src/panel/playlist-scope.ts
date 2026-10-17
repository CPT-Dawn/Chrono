// The Panel's Playlist scope: the remaining and finish time up to the target entry, notes on
// what it couldn't count, the target entry input and the scope's speed table. With Shuffle
// on it shows a notice instead.
import { formatCount } from '@/format';
import type { ClockFormat } from '@/settings';
import type { PlaylistScope } from '@/time-model';
import { timesText } from './scope-text';
import { createSpeedTable } from './speed-table';

export interface PlaylistScopeView {
  element: HTMLElement;
  /** Shows the scope, or hides it when there's nothing to show. */
  show(scope: PlaylistScope, now: Date, clockFormat: ClockFormat): void;
  /** Lets speed table rows apply their speed, or not while YouTube's speed can't be reached. */
  setEnabled(enabled: boolean): void;
}

export function createPlaylistScope(
  locale: string,
  setSpeed: (speed: number) => void,
  setTarget: (target: number) => void,
): PlaylistScopeView {
  const element = document.createElement('div');
  element.className = 'scope';
  element.setAttribute('role', 'group');
  const heading = create('div', 'scope-label');
  heading.id = 'playlist-scope-heading';
  heading.textContent = browser.i18n.getMessage('playlistScope');
  element.setAttribute('aria-labelledby', heading.id);

  const remaining = create('span', 'remaining');
  const finish = create('span', 'finish');
  const times = create('div', 'times');
  times.append(remaining, finish);
  const notes = create('div', 'scope-notes');
  const notice = create('div', 'scope-notes');
  notice.textContent = browser.i18n.getMessage('playlistShuffle');

  const input = document.createElement('input');
  input.type = 'number';
  input.step = '1';
  input.id = 'playlist-target';
  const label = document.createElement('label');
  label.className = 'target';
  label.htmlFor = input.id;
  label.textContent = browser.i18n.getMessage('playlistTarget');
  const target = create('div', 'target-row');
  target.append(label, input);

  const table = createSpeedTable(locale, setSpeed, 'playlistSpeedTable');
  element.append(heading, times, notes, target, table.element, notice);

  /** The target entry the scope last showed, which a rejected entry goes back to. */
  let shownTarget: number | undefined;
  input.addEventListener('change', () => {
    const value = Number(input.value);
    if (Number.isInteger(value) && value >= Number(input.min) && value <= Number(input.max)) {
      setTarget(value);
    } else if (shownTarget !== undefined) {
      input.value = String(shownTarget);
    }
  });

  return {
    element,
    show(scope, now, clockFormat) {
      element.hidden = scope.kind === 'none';
      const counting = scope.kind === 'times';
      for (const part of [times, notes, target, table.element]) part.hidden = !counting;
      notice.hidden = scope.kind !== 'shuffle';
      if (!counting) {
        table.show([], now, clockFormat);
        shownTarget = undefined;
        return;
      }
      const text = timesText(scope.times, now, locale, clockFormat);
      remaining.textContent = text.remaining;
      finish.textContent = text.finish;
      const count = (n: number) => formatCount(n, locale);
      const noteTexts = [
        scope.partial &&
          browser.i18n.getMessage('playlistPartial', [count(scope.partial.counted), count(scope.partial.total)]),
        scope.unavailable > 0 && browser.i18n.getMessage('playlistUnavailable', count(scope.unavailable)),
      ].filter((text): text is string => Boolean(text));
      notes.textContent = noteTexts.join(' · ');
      notes.hidden = noteTexts.length === 0;
      input.min = String(scope.current);
      input.max = String(scope.last);
      // The scope updates several times a second: leave the input alone while the viewer is
      // typing in it, unless the target itself changed.
      const typing = (input.getRootNode() as Document | ShadowRoot).activeElement === input;
      if (!typing || scope.target !== shownTarget) input.value = String(scope.target);
      shownTarget = scope.target;
      table.show(scope.times.speedTable, now, clockFormat);
    },
    setEnabled(enabled) {
      table.setEnabled(enabled);
    },
  };
}

function create(tag: string, className: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  return element;
}
