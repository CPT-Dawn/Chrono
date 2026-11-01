// A scope's times: its remaining over its finish line. When the speed changes, the
// remaining's changed digits roll with the speed readout; as it ticks down, they don't.
import type { ClockFormat } from '@/settings';
import type { TimesAtSpeed } from '@/time-model';
import { create } from './dom';
import { createRollingText } from './roll';
import { timesText } from './scope-text';

export interface TimesView {
  element: HTMLElement;
  /** Shows a scope's times. With `withSpeed`, the finish line names the speed too. */
  show(times: TimesAtSpeed, now: Date, clockFormat: ClockFormat, withSpeed?: boolean): void;
  /** Shows `text` in place of the remaining, with no finish line, as during an ad break. */
  showState(text: string): void;
}

export function createTimes(locale: string): TimesView {
  const remaining = create('span', 'remaining');
  const finish = create('span', 'finish');
  const element = create('div', 'times');
  element.append(remaining, finish);
  const rolling = createRollingText(remaining);
  /** The speed of the times last shown, to tell a speed change from a tick. */
  let shownSpeed: number | undefined;

  return {
    element,
    show(times, now, clockFormat, withSpeed) {
      const text = timesText(times, now, locale, clockFormat, withSpeed);
      const direction = shownSpeed === undefined || times.speed === shownSpeed ? undefined : times.speed > shownSpeed ? 1 : -1;
      shownSpeed = times.speed;
      rolling.set(text.remaining, direction);
      finish.textContent = text.finish;
    },
    showState(text) {
      shownSpeed = undefined;
      rolling.set(text);
      finish.textContent = '';
    },
  };
}
