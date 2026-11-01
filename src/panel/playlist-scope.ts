// The Panel's Playlist scope: the remaining and finish time up to the target entry, notes on
// what it couldn't count, the target entry input, the scope's target and its speed table.
// With Shuffle on it shows a notice instead.
import { formatCount } from '@/format';
import type { ClockFormat } from '@/settings';
import type { PlaylistScope, Target } from '@/time-model';
import { PLAYLIST } from '@/icons';
import { create, createProgress, uniqueId } from './dom';
import { createScopeSection } from './scope-section';
import { createSpeedTable } from './speed-table';
import { createTarget } from './target';
import { createTimes } from './times';

export interface PlaylistScopeView {
  element: HTMLElement;
  /** Shows the scope, or hides it when there's nothing to show. */
  show(scope: PlaylistScope, now: Date, clockFormat: ClockFormat): void;
  /** Lets the speed table and target apply speeds, or not while YouTube's speed can't be reached. */
  setEnabled(enabled: boolean): void;
}

export function createPlaylistScope(
  locale: string,
  setSpeed: (speed: number) => void,
  setTargetEntry: (entry: number) => void,
  setTarget: (target: Target | undefined) => void,
): PlaylistScopeView {
  const element = createScopeSection('playlist', PLAYLIST);
  const times = createTimes(locale);
  const notes = create('div', 'scope-notes');
  const shuffleNotice = create('div', 'scope-notes');
  shuffleNotice.textContent = browser.i18n.getMessage('playlistShuffle');

  const input = document.createElement('input');
  input.type = 'number';
  input.step = '1';
  input.id = uniqueId('target-entry');
  const entryLabel = create('label', 'field-label');
  entryLabel.htmlFor = input.id;
  entryLabel.textContent = browser.i18n.getMessage('playlistTargetEntry');
  const entryRow = create('div', 'target-row');
  entryRow.append(entryLabel, input);

  const target = createTarget('playlist', locale, setTarget, setSpeed);
  const table = createSpeedTable(locale, setSpeed, 'playlistSpeedTable');
  const progress = createProgress();
  element.append(times.element, progress.element, notes, entryRow, target.element, table.element, shuffleNotice);

  /** The target entry the scope last showed, which a rejected entry goes back to. */
  let shownTarget: number | undefined;
  input.addEventListener('change', () => {
    const value = Number(input.value);
    if (Number.isInteger(value) && value >= Number(input.min) && value <= Number(input.max)) {
      setTargetEntry(value);
    } else if (shownTarget !== undefined) {
      input.value = String(shownTarget);
    }
  });

  return {
    element,
    show(scope, now, clockFormat) {
      element.hidden = scope.kind === 'none';
      const counting = scope.kind === 'times';
      for (const part of [times.element, progress.element, notes, entryRow, table.element]) part.hidden = !counting;
      shuffleNotice.hidden = scope.kind !== 'shuffle';
      if (!counting) {
        target.show(undefined, now, clockFormat);
        table.show([], now, clockFormat);
        shownTarget = undefined;
        return;
      }
      times.show(scope.times, now, clockFormat);
      progress.show(scope.times.progress);
      const count = (n: number) => formatCount(n, locale);
      const noteTexts = [
        scope.partial &&
          browser.i18n.getMessage('playlistPartial', [count(scope.partial.counted), count(scope.partial.total)]),
        scope.unavailable > 0 && browser.i18n.getMessage('playlistUnavailable', count(scope.unavailable)),
        scope.live > 0 && browser.i18n.getMessage('playlistLive', count(scope.live)),
      ].filter((text): text is string => Boolean(text));
      notes.textContent = noteTexts.join(' · ');
      notes.hidden = noteTexts.length === 0;
      input.min = String(scope.current);
      input.max = String(scope.last);
      // The scope updates several times a second: leave the input alone while the viewer is
      // typing in it, unless the target itself changed.
      const typing = (input.getRootNode() as Document | ShadowRoot).activeElement === input;
      if (!typing || scope.targetEntry !== shownTarget) input.value = String(scope.targetEntry);
      shownTarget = scope.targetEntry;
      target.show(scope.times, now, clockFormat);
      table.show(scope.times.speedTable, now, clockFormat);
    },
    setEnabled(enabled) {
      target.setEnabled(enabled);
      table.setEnabled(enabled);
    },
  };
}
