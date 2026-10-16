// A scope's speed table: one row per speed with the scope's remaining and finish time at
// that speed. The current speed's row is highlighted, and clicking a row asks for its
// speed. Any scope can show one.
import { formatClockTime, formatSpeed, formatWatchTime } from '@/format';
import type { SpeedTableRow } from '@/time-model';

export interface SpeedTable {
  element: HTMLElement;
  /** Shows these rows, slowest first, or hides the table when there are none. */
  show(rows: SpeedTableRow[], now: Date): void;
  /** Lets rows apply their speed, or not while YouTube's speed can't be reached. */
  setEnabled(enabled: boolean): void;
}

export function createSpeedTable(locale: string, setSpeed: (speed: number) => void): SpeedTable {
  const element = document.createElement('div');
  element.className = 'speed-table';
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', browser.i18n.getMessage('speedTable'));

  // Rows are kept for as long as their speed is in the table, so one the keyboard is on
  // keeps focus while its times change.
  const rows = new Map<number, ReturnType<typeof createRow>>();
  let enabled = true;

  function createRow(speed: number) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'speed-row';
    button.disabled = !enabled;
    const speedCell = document.createElement('span');
    speedCell.className = 'speed-row-speed';
    speedCell.textContent = browser.i18n.getMessage('speed', formatSpeed(speed, locale));
    const remaining = document.createElement('span');
    const finish = document.createElement('span');
    finish.className = 'speed-row-finish';
    button.append(speedCell, remaining, finish);
    button.addEventListener('click', () => setSpeed(speed));
    return { button, speedText: speedCell.textContent, remaining, finish };
  }

  return {
    element,
    show(tableRows, now) {
      const speeds = new Set(tableRows.map((row) => row.speed));
      for (const [speed, row] of rows) {
        if (!speeds.has(speed)) {
          row.button.remove();
          rows.delete(speed);
        }
      }
      const buttons = tableRows.map(({ speed, remaining, finishTime, current }) => {
        let row = rows.get(speed);
        if (!row) {
          row = createRow(speed);
          rows.set(speed, row);
        }
        const left = formatWatchTime(remaining);
        const clock = formatClockTime(finishTime, now, locale);
        row.remaining.textContent = left;
        row.finish.textContent = browser.i18n.getMessage('finishTime', clock);
        row.button.setAttribute('aria-label', browser.i18n.getMessage('speedTableRow', [row.speedText, left, clock]));
        row.button.setAttribute('aria-pressed', String(current));
        return row.button;
      });
      // Moving a row would take focus away from it, so only rows new to the table are
      // inserted; the others keep their place.
      buttons.forEach((button, i) => {
        const at = element.children[i] ?? null;
        if (button !== at) element.insertBefore(button, at);
      });
      element.hidden = buttons.length === 0;
    },
    setEnabled(value) {
      enabled = value;
      for (const row of rows.values()) row.button.disabled = !enabled;
    },
  };
}
