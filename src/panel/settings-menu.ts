// The settings section of the Panel's ⋮ menu. It shows the same settings as the toolbar
// popup, in the same order, as menu items: a group of choices or an on/off item each.
import { SETTING_CONTROLS, type Settings } from '@/settings';
import { createCheckItem } from './menu';

export interface SettingsMenu {
  /** The menu's settings items, to add to the menu. */
  elements: HTMLElement[];
  /** Shows the viewer's current settings as the items' checked states. */
  show(settings: Settings): void;
}

export function createSettingsMenu(
  changeSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void,
): SettingsMenu {
  const elements: HTMLElement[] = [];
  const showControls: ((settings: Settings) => void)[] = [];

  for (const control of SETTING_CONTROLS) {
    if (elements.length > 0) elements.push(separator());
    if (control.kind === 'choice') {
      const group = document.createElement('div');
      group.setAttribute('role', 'group');
      const heading = document.createElement('div');
      heading.className = 'menu-heading';
      heading.id = `setting-${control.key}`;
      heading.textContent = browser.i18n.getMessage(control.label);
      group.setAttribute('aria-labelledby', heading.id);
      const items = control.choices.map(({ value, label }) => {
        const item = createCheckItem('menuitemradio', browser.i18n.getMessage(label), () =>
          changeSetting(control.key, value),
        );
        return { item, value };
      });
      group.append(heading, ...items.map(({ item }) => item));
      elements.push(group);
      showControls.push((settings) => {
        for (const { item, value } of items) item.setAttribute('aria-checked', String(value === settings[control.key]));
      });
    } else {
      let checked = false;
      const item = createCheckItem('menuitemcheckbox', browser.i18n.getMessage(control.label), () =>
        changeSetting(control.key, !checked),
      );
      elements.push(item);
      showControls.push((settings) => {
        checked = settings[control.key];
        item.setAttribute('aria-checked', String(checked));
      });
    }
  }

  return {
    elements,
    show(settings) {
      for (const showControl of showControls) showControl(settings);
    },
  };
}

function separator(): HTMLElement {
  const element = document.createElement('div');
  element.className = 'menu-separator';
  element.setAttribute('role', 'separator');
  return element;
}
