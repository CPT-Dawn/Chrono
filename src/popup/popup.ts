// The toolbar popup: Chrono's settings and links, reachable from any tab. Apart from
// "Report it", which asks the viewer's tab what Chrono detected there, it works the same
// whatever page the active tab shows.
import { askForPageReport, OUTWARD_LINKS, openLink, type OutwardLink } from '@/links';
import { changeSetting, readSettings, SETTING_CONTROLS, watchSettings, type Settings } from '@/settings';
import type { MessageName } from '@/messages';

/** Opens `link`. A report carries what Chrono detected on the page in the viewer's tab. */
async function follow(link: OutwardLink): Promise<void> {
  if (link !== 'report') return openLink(link);
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const page = tab?.id === undefined ? undefined : await askForPageReport(tab.id);
  return openLink(link, page);
}

/** Fills the popup page `document` and keeps it in step with the viewer's settings. */
export async function startPopup(document: Document): Promise<void> {
  const message = (name: MessageName) => browser.i18n.getMessage(name);
  const create = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    return element;
  };

  document.title = message('extShortName');
  const main = create('main');
  const title = create('h1', message('extShortName'));
  const note = create('p', message('popupNote'));
  note.className = 'note';
  const heading = create('h2', message('settings'));
  heading.id = 'settings-heading';
  const form = create('form');
  form.setAttribute('aria-labelledby', heading.id);

  /** Shows a setting's current value in its controls. */
  const showControls: ((settings: Settings) => void)[] = [];

  for (const control of SETTING_CONTROLS) {
    if (control.kind === 'choice') {
      const fieldset = create('fieldset');
      fieldset.append(create('legend', message(control.label)));
      const radios = control.choices.map(({ value, label }) => {
        const input = create('input');
        input.type = 'radio';
        input.name = control.key;
        input.value = value;
        input.addEventListener('change', () => {
          if (input.checked) void changeSetting(control.key, value);
        });
        const wrapper = create('label');
        wrapper.append(input, create('span', message(label)));
        fieldset.append(wrapper);
        return input;
      });
      form.append(fieldset);
      showControls.push((settings) => {
        for (const radio of radios) radio.checked = radio.value === settings[control.key];
      });
    } else {
      const input = create('input');
      input.type = 'checkbox';
      input.name = control.key;
      input.addEventListener('change', () => void changeSetting(control.key, input.checked));
      const wrapper = create('label');
      wrapper.className = 'toggle';
      wrapper.append(create('span', message(control.label)), input);
      form.append(wrapper);
      showControls.push((settings) => {
        input.checked = settings[control.key];
      });
    }
  }
  form.addEventListener('submit', (event) => event.preventDefault());

  const links = create('div');
  links.className = 'links';
  for (const { link, label } of OUTWARD_LINKS) {
    const button = create('button', message(label));
    button.type = 'button';
    button.className = 'pill';
    button.addEventListener('click', () => void follow(link));
    links.append(button);
  }

  main.append(title, note, heading, form, links);
  document.body.append(main);

  const show = (settings: Settings) => {
    for (const showControl of showControls) showControl(settings);
  };
  show(await readSettings());
  // The popup closes by unloading, which stops this.
  watchSettings(show, new AbortController().signal);
}
