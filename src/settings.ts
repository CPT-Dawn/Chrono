// Chrono's settings: what the viewer chooses in the Panel's ⋮ menu or the toolbar popup.
// They live in extension storage, so a change applies at once in the Panel, the popup and
// every open YouTube tab. The spec allows six settings in all.
//
// v3 starts fresh: the keys v2 stored (is24HourMode, showVideoCard, …) are never read.

import type { MessageName } from '@/messages';

/** How clock times are written. Automatic follows the browser's language and region. */
export type ClockFormat = 'auto' | '12h' | '24h';

export interface Settings {
  /** Whether the Panel shows the Playlist scope when the video plays in a playlist. */
  showPlaylistScope: boolean;
  clockFormat: ClockFormat;
  /**
   * Whether the Panel's details start expanded on a fresh watch page. Expanding or
   * collapsing them sets this too, so it is also how the viewer last left the Panel.
   */
  panelStartsExpanded: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  showPlaylistScope: true,
  clockFormat: 'auto',
  panelStartsExpanded: false,
};

/** A setting the viewer picks from a list, with the message name of each choice's label. */
export interface ChoiceSetting<K extends keyof Settings> {
  kind: 'choice';
  key: K;
  label: MessageName;
  choices: { value: Settings[K]; label: MessageName }[];
}

/** A setting the viewer turns on or off. */
export interface ToggleSetting<K extends keyof Settings> {
  kind: 'toggle';
  key: K;
  label: MessageName;
}

export type SettingControl =
  | ChoiceSetting<'clockFormat'>
  | ToggleSetting<'showPlaylistScope' | 'panelStartsExpanded'>;

/**
 * Every setting, in the order the ⋮ menu and the popup show them. Labels are message names
 * in messages.json.
 */
export const SETTING_CONTROLS: readonly SettingControl[] = [
  { kind: 'toggle', key: 'showPlaylistScope', label: 'showPlaylistScope' },
  {
    kind: 'choice',
    key: 'clockFormat',
    label: 'clockFormat',
    choices: [
      { value: 'auto', label: 'clockFormatAuto' },
      { value: '12h', label: 'clockFormat12h' },
      { value: '24h', label: 'clockFormat24h' },
    ],
  },
  { kind: 'toggle', key: 'panelStartsExpanded', label: 'panelStartsExpanded' },
];

const storageItems = {
  showPlaylistScope: storage.defineItem<boolean>('local:settings.showPlaylistScope', {
    fallback: DEFAULT_SETTINGS.showPlaylistScope,
  }),
  clockFormat: storage.defineItem<ClockFormat>('local:settings.clockFormat', {
    fallback: DEFAULT_SETTINGS.clockFormat,
  }),
  panelStartsExpanded: storage.defineItem<boolean>('local:settings.panelStartsExpanded', {
    fallback: DEFAULT_SETTINGS.panelStartsExpanded,
  }),
} satisfies { [K in keyof Settings]: WxtStorageItem<Settings[K], {}> };

const keys = Object.keys(storageItems) as (keyof Settings)[];

/** The viewer's current settings. */
export async function readSettings(): Promise<Settings> {
  const values = await Promise.all(keys.map((key) => storageItems[key].getValue()));
  return Object.fromEntries(keys.map((key, i) => [key, values[i]])) as unknown as Settings;
}

/** Saves one setting, which every Panel and popup then shows. */
export async function changeSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  await (storageItems[key] as WxtStorageItem<Settings[K], {}>).setValue(value);
}

/**
 * Calls `onChange` with all the settings whenever one changes, here or in another tab or
 * the popup, until `signal` aborts.
 */
export function watchSettings(onChange: (settings: Settings) => void, signal: AbortSignal): void {
  for (const key of keys) {
    const unwatch = storageItems[key].watch(async () => {
      if (!signal.aborted) onChange(await readSettings());
    });
    signal.addEventListener('abort', unwatch, { once: true });
  }
}
