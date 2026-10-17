// A scope's target: the viewer chooses a finish time ("Done by 3:30 PM") or the watch time
// they have ("I have 0 h 45 min"), and sees the required speed, with a button that applies
// it when YouTube's player can play it. Any scope can show one.
import { dayPeriodNames, usesTwelveHourClock } from '@/format';
import type { MessageName } from '@/messages';
import type { ClockFormat } from '@/settings';
import { clockTimeNear, MAX_SPEED, MIN_SPEED, type RequiredSpeed, type ScopeTimes, type Target } from '@/time-model';
import { speedText } from './scope-text';

export interface TargetView {
  element: HTMLElement;
  /** Shows the scope's target and required speed, or hides the target when the scope has no times. */
  show(times: ScopeTimes | undefined, now: Date, clockFormat: ClockFormat): void;
  /** Lets the viewer apply the required speed, or not while YouTube's speed can't be reached. */
  setEnabled(enabled: boolean): void;
}

type Kind = Target['kind'] | 'none';

/**
 * A scope's target, named for screen readers by the message `label`. `id` tells it apart
 * from the other scopes' targets in the Panel.
 */
export function createTarget(
  id: string,
  label: MessageName,
  locale: string,
  setTarget: (target: Target | undefined) => void,
  setSpeed: (speed: number) => void,
): TargetView {
  const element = create('div', 'target-control');
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', browser.i18n.getMessage(label));

  const kind = document.createElement('select');
  kind.id = `${id}-target-kind`;
  for (const [value, message] of KINDS) kind.append(option(browser.i18n.getMessage(message), value));
  const kindLabel = document.createElement('label');
  kindLabel.className = 'target';
  kindLabel.htmlFor = kind.id;
  kindLabel.textContent = browser.i18n.getMessage('target');

  const hour = numberInput('targetHour');
  const minute = numberInput('targetMinute', 0, 59);
  const period = document.createElement('select');
  period.setAttribute('aria-label', browser.i18n.getMessage('targetPeriod'));
  const [am, pm] = dayPeriodNames(locale);
  period.append(option(am, 'am'), option(pm, 'pm'));
  const colon = create('span', 'target-unit');
  colon.textContent = ':';
  const finishFields = create('span', 'target-fields');
  finishFields.append(hour, colon, minute, period);

  const hours = numberInput('targetHours', 0, 99);
  const minutes = numberInput('targetMinutes', 0, 59);
  const watchFields = create('span', 'target-fields');
  watchFields.append(hours, unit('targetHoursUnit'), minutes, unit('targetMinutesUnit'));

  const row = create('div', 'target-row');
  row.append(kindLabel, kind, finishFields, watchFields);

  const message = create('span', 'target-message');
  const apply = create('button', 'target-apply') as HTMLButtonElement;
  apply.type = 'button';
  apply.textContent = browser.i18n.getMessage('applySpeed');
  const result = create('div', 'target-result');
  result.append(message, apply);
  element.append(row, result);

  /** What the target last showed, which choosing a kind starts from. */
  let shown: { times: ScopeTimes; twelveHours: boolean } | undefined;
  /** The speed Apply sets. */
  let applySpeed: number | undefined;

  kind.addEventListener('change', () => {
    if (!shown) return;
    showFields(kind.value as Kind);
    // A new target starts at the scope's own times, so its required speed starts at the
    // current speed and the viewer adjusts from there.
    const { times, twelveHours } = shown;
    if (kind.value === 'finish-time') {
      fillFinishTime(new Date(Math.ceil(times.finishTime.getTime() / 60_000) * 60_000), twelveHours);
    } else if (kind.value === 'watch-time') {
      fillWatchTime(Math.round(times.remaining / 60) * 60);
    }
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
    if (kind.value === 'finish-time') {
      const values = [hour, minute].map(fieldValue);
      if (values.some((value) => value === undefined)) return undefined;
      const [h, m] = values as [number, number];
      const hour24 = shown?.twelveHours ? (h % 12) + (period.value === 'pm' ? 12 : 0) : h;
      return { kind: 'finish-time', time: clockTimeNear(hour24, m, new Date()) };
    }
    if (kind.value === 'watch-time') {
      const values = [hours, minutes].map(fieldValue);
      if (values.some((value) => value === undefined)) return undefined;
      const [h, m] = values as [number, number];
      return { kind: 'watch-time', seconds: h * 3600 + m * 60 };
    }
    return undefined;
  }

  function fillFinishTime(time: Date, twelveHours: boolean) {
    const h = time.getHours();
    hour.value = String(twelveHours ? h % 12 || 12 : h);
    minute.value = String(time.getMinutes()).padStart(2, '0');
    period.value = h < 12 ? 'am' : 'pm';
  }

  function fillWatchTime(seconds: number) {
    hours.value = String(Math.floor(seconds / 3600));
    minutes.value = String(Math.floor((seconds % 3600) / 60));
  }

  function showFields(value: Kind) {
    finishFields.hidden = value !== 'finish-time';
    watchFields.hidden = value !== 'watch-time';
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
      shown = { times, twelveHours };
      hour.min = twelveHours ? '1' : '0';
      hour.max = twelveHours ? '12' : '23';
      period.hidden = !twelveHours;
      // The target updates several times a second: leave its fields alone while the viewer
      // is using them.
      const root = element.getRootNode() as Document | ShadowRoot;
      if (!element.contains(root.activeElement)) {
        const { target } = times;
        kind.value = target?.kind ?? 'none';
        showFields(target?.kind ?? 'none');
        if (target?.kind === 'finish-time') fillFinishTime(target.time, twelveHours);
        if (target?.kind === 'watch-time') fillWatchTime(target.seconds);
      }
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

/** What the target says about its required speed. */
function requiredText(required: RequiredSpeed, locale: string): string {
  const speed = (value: number) => speedText(value, locale);
  switch (required.kind) {
    case 'in-range':
      return browser.i18n.getMessage('requiredSpeed', speed(required.speed));
    case 'too-fast':
      return browser.i18n.getMessage('requiredSpeedTooFast', [speed(required.speed), speed(MAX_SPEED)]);
    case 'too-slow':
      return browser.i18n.getMessage('requiredSpeedTooSlow', [speed(required.speed), speed(MIN_SPEED)]);
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

function create(tag: string, className: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  return element;
}
