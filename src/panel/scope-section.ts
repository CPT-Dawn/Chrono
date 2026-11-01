// The frame of a scope below the Video scope's: a heading with the scope's icon and name,
// as YouTube heads a section of a panel. The scope adds the rest.
import { createIcon } from '@/icons';
import { create } from './dom';

const NAMES = { chapter: 'chapterScope', playlist: 'playlistScope' } as const;

/** A scope's section, named for screen readers as its heading reads, e.g. "Chapter". */
export function createScopeSection(scope: keyof typeof NAMES, icon: string): HTMLElement {
  const name = browser.i18n.getMessage(NAMES[scope]);
  const element = create('div', 'scope');
  element.dataset.scope = scope;
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', name);
  const heading = create('div', 'scope-heading');
  heading.append(createIcon(icon), name);
  element.append(heading);
  return element;
}
