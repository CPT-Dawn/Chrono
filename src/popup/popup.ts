// The toolbar popup: Chrono's settings and links, reachable from any tab. Apart from
// "Report it", which asks the viewer's tab what Chrono detected there, it works the same
// whatever page the active tab shows.
import { createIcon, LINK_ICONS, MARK } from '@/icons';
import { askForPageReport, openLink } from '@/link-requests';
import { linkWantsPage, OUTWARD_LINKS, type OutwardLink } from '@/links';
import { changeSetting, readSettings, SETTING_CONTROLS, watchSettings, type Settings } from '@/settings';
import type { MessageName } from '@/messages';

/** Opens `link`. A report carries what Chrono detected on the page in the viewer's tab. */
async function follow(link: OutwardLink): Promise<void> {
  if (!linkWantsPage(link)) return openLink(link);
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const page = tab?.id === undefined ? undefined : await askForPageReport(tab.id);
  return openLink(link, page);
}

/** Fills the popup page `document` and keeps it in step with the viewer's settings. */
export async function startPopup(document: Document): Promise<void> {
  const message = (name: MessageName) => browser.i18n.getMessage(name);
  const create = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };

  document.title = message('extShortName');
  const main = create('main');

  // The header: the app icon, Chrono's name and what it does.
  const appIcon = create('div', undefined, 'app-icon');
  const mark = createIcon(MARK);
  // A path length of 1 lets the ring draw itself in step with the playhead on open.
  mark.querySelector('.mark-ring')?.setAttribute('pathLength', '1');
  appIcon.append(mark);
  const brandText = create('div', undefined, 'brand-text');
  brandText.append(create('h1', message('extShortName')), create('p', message('popupNote'), 'note'));
  const header = create('header', undefined, 'brand');
  header.append(appIcon, brandText);

  const heading = create('h2', message('settings'));
  heading.id = 'settings-heading';
  const form = create('form');
  form.setAttribute('aria-labelledby', heading.id);

  /** Shows a setting's current value in its controls. */
  const showControls: ((settings: Settings) => void)[] = [];

  for (const control of SETTING_CONTROLS) {
    if (control.kind === 'choice') {
      // The choices are radio buttons drawn as YouTube's chips; the chosen one is inverse.
      const fieldset = create('fieldset');
      const chips = create('div', undefined, 'chips');
      fieldset.append(create('legend', message(control.label)), chips);
      const radios = control.choices.map(({ value, label }) => {
        const input = create('input', undefined, 'visually-hidden');
        input.type = 'radio';
        input.name = control.key;
        input.value = value;
        input.addEventListener('change', () => {
          if (input.checked) void changeSetting(control.key, value);
        });
        const chip = create('label', undefined, 'chip');
        chip.append(input, create('span', message(label)));
        chips.append(chip);
        return input;
      });
      form.append(fieldset);
      showControls.push((settings) => {
        for (const radio of radios) radio.checked = radio.value === settings[control.key];
      });
    } else {
      // A checkbox drawn as YouTube's switch, at the end of a list row.
      const input = create('input', undefined, 'visually-hidden');
      input.type = 'checkbox';
      input.name = control.key;
      input.addEventListener('change', () => void changeSetting(control.key, input.checked));
      const track = create('span', undefined, 'switch');
      track.setAttribute('aria-hidden', 'true');
      const row = create('label', undefined, 'row');
      row.append(create('span', message(control.label), 'label'), input, track);
      form.append(row);
      showControls.push((settings) => {
        input.checked = settings[control.key];
      });
    }
  }
  form.addEventListener('submit', (event) => event.preventDefault());

  // The links: menu rows behind a divider, each with its icon.
  const links = create('nav', undefined, 'links');
  for (const { link, label } of OUTWARD_LINKS) {
    const button = create('button', undefined, 'row');
    button.type = 'button';
    button.dataset.link = link;
    button.append(createIcon(LINK_ICONS[link]), create('span', message(label), 'label'));
    button.addEventListener('click', () => void follow(link));
    links.append(button);
  }

  main.append(header, heading, form, links);
  document.body.append(main);

  const show = (settings: Settings) => {
    for (const showControl of showControls) showControl(settings);
  };
  show(await readSettings());
  // The popup closes by unloading, which stops this.
  watchSettings(show, new AbortController().signal);
}
