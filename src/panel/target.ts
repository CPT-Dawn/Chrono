// A scope's target: the viewer chooses a finish time ("Done by 3:30 PM") or the watch time
// they have ("I have 0 h 45 min"), and sees the required speed, with a button that applies
// it when YouTube's player can play it. Any scope can show one.
import { dayPeriodNames, formatClockHour, timeSeparator, usesTwelveHourClock } from '@/format';
import type { MessageName } from '@/messages';
import type { ClockFormat } from '@/settings';
import { MAX_SPEED, MIN_SPEED, type RequiredSpeed, type ScopeTimes, type Target, upcomingClockTime } from '@/time-model';
import { create, uniqueId } from './dom';
import { speedText } from './scope-text';

export interface TargetView {
  element: HTMLElement;
  /** Shows the scope's target and required speed, or hides the target when the scope has no times. */
  show(times: ScopeTimes | undefined, now: Date, clockFormat: ClockFormat): void;
  /** Lets the viewer apply the required speed, or not while YouTube's speed can't be reached. */
  setEnabled(enabled: boolean): void;
}

type Kind = Target['kind'] | 'none';

/** The scopes the viewer can set a target on. */
export type TargetScope = 'video' | 'chapter' | 'playlist';

/** What screen readers call each scope's target. */
const LABELS: Record<TargetScope, MessageName> = {
  video: 'videoTarget',
  chapter: 'chapterTarget',
  playlist: 'playlistTarget',
};

/** The target of `scope`. */
export function createTarget(
  scope: TargetScope,
  locale: string,
  setTarget: (target: Target | undefined) => void,
  setSpeed: (speed: number) => void,
): TargetView {
  const element = create('div', 'target-control');
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', browser.i18n.getMessage(LABELS[scope]));

  const kind = document.createElement('select');
  kind.id = uniqueId('target-kind');
  for (const [value, message] of KINDS) kind.append(option(browser.i18n.getMessage(message), value));
  const kindLabel = create('label', 'target');
  kindLabel.htmlFor = kind.id;
  kindLabel.textContent = browser.i18n.getMessage('target');

  const hour = numberInput('targetHour');
  const minute = numberInput('targetMinute', 0, 59);
  const period = document.createElement('select');
  period.setAttribute('aria-label', browser.i18n.getMessage('targetPeriod'));
  const [am, pm] = dayPeriodNames(locale);
  period.append(option(am, 'am'), option(pm, 'pm'));
  const colon = create('span', 'target-unit');
  colon.textContent = timeSeparator(locale);
  const finishFields = create('span', 'target-fields');
  finishFields.append(hour, colon, minute, period);

  const hours = numberInput('targetHours', 0, 99);
  const minutes = numberInput('targetMinutes', 0, 59);
  const watchFields = create('span', 'target-fields');
  watchFields.append(hours, unit('targetHoursUnit'), minutes, unit('targetMinutesUnit'));

  const row = create('div', 'target-row');
  row.append(kindLabel, kind, finishFields, watchFields);

  const message = create('span', 'target-message');
  const apply = create('button', 'target-apply');
  apply.type = 'button';
  apply.textContent = browser.i18n.getMessage('applySpeed');
  const result = create('div', 'target-result');
  result.append(message, apply);
  element.append(row, result);

  /** What the target last showed, which choosing a kind starts from. */
  let shown: { times: ScopeTimes; clockFormat: ClockFormat; twelveHours: boolean } | undefined;
  /** The speed Apply sets. */
  let applySpeed: number | undefined;

  /** What each kind of target shows, and how it reads and fills its fields. */
  const fieldsOf: { [K in Target['kind']]: KindFields<Extract<Target, { kind: K }>> } = {
    'finish-time': {
      fields: finishFields,
      read() {
        const values = wholeNumbers(hour, minute);
        if (!values) return undefined;
        const [h, m] = values;
        const hour24 = shown?.twelveHours ? (h % 12) + (period.value === 'pm' ? 12 : 0) : h;
        return { kind: 'finish-time', time: upcomingClockTime(hour24, m, new Date()) };
      },
      fill({ time }, clockFormat) {
        // The hour as the Panel writes it in finish times: "7" in 7:42 PM, "07" in 07:42.
        hour.value = formatClockHour(time, locale, clockFormat);
        minute.value = String(time.getMinutes()).padStart(2, '0');
        period.value = time.getHours() < 12 ? 'am' : 'pm';
      },
    },
    'watch-time': {
      fields: watchFields,
      read() {
        const values = wholeNumbers(hours, minutes);
        if (!values) return undefined;
        const [h, m] = values;
        return { kind: 'watch-time', seconds: h * 3600 + m * 60 };
      },
      fill({ seconds }) {
        hours.value = String(Math.floor(seconds / 3600));
        minutes.value = String(Math.floor((seconds % 3600) / 60));
      },
    },
  };

  kind.addEventListener('change', () => {
    if (!shown) return;
    const chosen = kind.value as Kind;
    const target = chosen === 'none' ? undefined : startingTarget(chosen, shown.times, new Date());
    showTarget(target, shown.clockFormat);
    setTarget(readTarget());
  });
  for (const field of [hour, minute, period, hours, minutes]) {
    field.addEventListener('input', () => {
      const target = readTarget();
      if (target) setTarget(target);
    });
  }
  apply.addEventListener('click', () => {
    if (applySpeed !== undefined) setSpeed(applySpeed);
  });

  /** The target the fields describe, or undefined when they don't describe one. */
  function readTarget(): Target | undefined {
    const chosen = kind.value as Kind;
    return chosen === 'none' ? undefined : fieldsOf[chosen].read();
  }

  /** Shows `target` in the fields, or no target. */
  function showTarget(target: Target | undefined, clockFormat: ClockFormat) {
    kind.value = target?.kind ?? 'none';
    showFields(target?.kind ?? 'none');
    if (target) (fieldsOf[target.kind] as KindFields<Target>).fill(target, clockFormat);
  }

  function showFields(value: Kind) {
    for (const [fieldsKind, { fields }] of Object.entries(fieldsOf)) fields.hidden = fieldsKind !== value;
  }

  function showRequired(required: RequiredSpeed | undefined) {
    applySpeed = required?.kind === 'in-range' ? required.speed : undefined;
    apply.hidden = applySpeed === undefined;
    if (applySpeed !== undefined) {
      apply.setAttribute('aria-label', browser.i18n.getMessage('applySpeedLabel', speedText(applySpeed, locale)));
    }
    message.textContent = required ? requiredText(required, locale) : '';
    result.hidden = !required;
  }

  showFields('none');
  showRequired(undefined);

  return {
    element,
    show(times, now, clockFormat) {
      element.hidden = !times;
      if (!times) {
        shown = undefined;
        return;
      }
      const twelveHours = usesTwelveHourClock(locale, clockFormat);
      shown = { times, clockFormat, twelveHours };
      hour.min = twelveHours ? '1' : '0';
      hour.max = twelveHours ? '12' : '23';
      period.hidden = !twelveHours;
      // The target updates several times a second: leave its fields alone while the viewer
      // is using them.
      const root = element.getRootNode() as Document | ShadowRoot;
      if (!element.contains(root.activeElement)) showTarget(times.target, clockFormat);
      showRequired(times.required);
    },
    setEnabled(enabled) {
      apply.disabled = !enabled;
    },
  };
}

/** The kinds of target, in the order the viewer chooses from, with their labels. */
const KINDS: [Kind, MessageName][] = [
  ['none', 'targetNone'],
  ['finish-time', 'targetFinishTime'],
  ['watch-time', 'targetWatchTime'],
];

/** A kind of target's fields. */
interface KindFields<T extends Target> {
  fields: HTMLElement;
  /** The target the fields describe, or undefined when they don't describe one. */
  read(): T | undefined;
  fill(target: T, clockFormat: ClockFormat): void;
}

/**
 * What a new target of `kind` starts from: the scope's own finish time or remaining, so
 * that its required speed starts at the current speed and the viewer adjusts from there.
 */
function startingTarget(kind: Target['kind'], times: ScopeTimes, now: Date): Target {
  const finishTime = new Date(Math.ceil(times.finishTime.getTime() / 60_000) * 60_000);
  // A clock time means a time within the next day, so a scope that ends later starts from
  // its remaining instead.
  if (kind === 'finish-time' && sayableAsClockTime(finishTime, now)) return { kind, time: finishTime };
  return { kind: 'watch-time', seconds: Math.round(times.remaining / 60) * 60 };
}

/** Whether the clock time of `time` alone, entered at `now`, means `time`. */
function sayableAsClockTime(time: Date, now: Date): boolean {
  return upcomingClockTime(time.getHours(), time.getMinutes(), now).getTime() === time.getTime();
}

/** What the target says about its required speed. */
function requiredText(required: RequiredSpeed, locale: string): string {
  const speed = (value: number) => speedText(value, locale);
  switch (required.kind) {
    case 'in-range':
      return browser.i18n.getMessage('requiredSpeed', speed(required.speed));
    case 'too-fast':
      return browser.i18n.getMessage('requiredSpeedTooFast', [speed(required.speed), speed(MAX_SPEED)]);
    case 'too-slow':
      return browser.i18n.getMessage('requiredSpeedTooSlow', speed(MIN_SPEED));
    case 'passed':
      return browser.i18n.getMessage('targetPassed');
    case 'no-time':
      return browser.i18n.getMessage('targetNoTime');
    case 'finished':
      return browser.i18n.getMessage('targetFinished');
  }
}

/** A whole-number field, named for screen readers by the message `label`. */
function numberInput(label: MessageName, min?: number, max?: number): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.step = '1';
  if (min !== undefined) input.min = String(min);
  if (max !== undefined) input.max = String(max);
  input.setAttribute('aria-label', browser.i18n.getMessage(label));
  return input;
}

/** The fields' whole numbers, or undefined unless every one holds one within its range. */
function wholeNumbers<const Fields extends HTMLInputElement[]>(
  ...fields: Fields
): { [I in keyof Fields]: number } | undefined {
  const values = fields.map(fieldValue);
  return values.every((value) => value !== undefined) ? (values as { [I in keyof Fields]: number }) : undefined;
}

/** A field's whole number, or undefined when it holds none within its range. */
function fieldValue(input: HTMLInputElement): number | undefined {
  if (input.value.trim() === '') return undefined;
  const value = Number(input.value);
  const fits = Number.isInteger(value) && value >= Number(input.min) && value <= Number(input.max);
  return fits ? value : undefined;
}

function option(text: string, value: string): HTMLOptionElement {
  const element = document.createElement('option');
  element.value = value;
  element.textContent = text;
  return element;
}

function unit(message: MessageName): HTMLElement {
  const element = create('span', 'target-unit');
  element.textContent = browser.i18n.getMessage(message);
  element.setAttribute('aria-hidden', 'true');
  return element;
}
