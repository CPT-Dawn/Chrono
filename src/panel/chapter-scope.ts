// The Panel's Chapter scope: the title of the chapter the playhead is in, the chapter's
// remaining and finish time, its target and its speed table.
import type { ClockFormat } from '@/settings';
import type { ChapterScope, Target } from '@/time-model';
import { create } from './dom';
import { timesText } from './scope-text';
import { createSpeedTable } from './speed-table';
import { createTarget } from './target';

export interface ChapterScopeView {
  element: HTMLElement;
  /** Shows the chapter, or hides the Chapter scope when there is none to show. */
  show(scope: ChapterScope | undefined, now: Date, clockFormat: ClockFormat): void;
  /** Lets the speed table and target apply speeds, or not while YouTube's speed can't be reached. */
  setEnabled(enabled: boolean): void;
}

export function createChapterScope(
  locale: string,
  setSpeed: (speed: number) => void,
  setTarget: (target: Target | undefined) => void,
): ChapterScopeView {
  const element = create('div', 'scope');
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', browser.i18n.getMessage('chapterScope'));

  const label = create('div', 'scope-label');
  label.textContent = browser.i18n.getMessage('chapterScope');
  const title = create('div', 'scope-title');
  const remaining = create('span', 'remaining');
  const finish = create('span', 'finish');
  const times = create('div', 'times');
  times.append(remaining, finish);
  const target = createTarget('chapter', locale, setTarget, setSpeed);
  const table = createSpeedTable(locale, setSpeed, 'chapterSpeedTable');
  element.append(label, title, times, target.element, table.element);

  return {
    element,
    show(scope, now, clockFormat) {
      element.hidden = !scope;
      // A hidden Chapter scope stays empty, so Chrono doesn't keep updating what nobody sees.
      target.show(scope?.times, now, clockFormat);
      table.show(scope?.times.speedTable ?? [], now, clockFormat);
      if (!scope) return;
      title.textContent = scope.title;
      // A long title is cut short; hovering shows it in full.
      title.title = scope.title;
      const text = timesText(scope.times, now, locale, clockFormat);
      remaining.textContent = text.remaining;
      finish.textContent = text.finish;
    },
    setEnabled(enabled) {
      target.setEnabled(enabled);
      table.setEnabled(enabled);
    },
  };
}
