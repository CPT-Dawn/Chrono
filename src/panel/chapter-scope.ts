// The Panel's Chapter scope: the title of the chapter the playhead is in, the chapter's
// remaining and finish time, its target and its speed table.
import type { ClockFormat } from '@/settings';
import type { ChapterScope, Target } from '@/time-model';
import { CHAPTERS } from '@/icons';
import { create, createProgress } from './dom';
import { createScopeSection } from './scope-section';
import { createSpeedTable } from './speed-table';
import { createTarget } from './target';
import { createTimes } from './times';

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
  const element = createScopeSection('chapter', CHAPTERS);
  const title = create('div', 'scope-title');
  const times = createTimes(locale);
  const target = createTarget('chapter', locale, setTarget, setSpeed);
  const table = createSpeedTable(locale, setSpeed, 'chapterSpeedTable');
  const progress = createProgress();
  element.append(title, times.element, progress.element, target.element, table.element);

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
      times.show(scope.times, now, clockFormat);
      progress.show(scope.times.progress);
    },
    setEnabled(enabled) {
      target.setEnabled(enabled);
      table.setEnabled(enabled);
    },
  };
}
