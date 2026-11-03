import { fireEvent, within } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryPanel, settle, startChrono, stopChrono } from './harness/chrono';
import { openSavedPage } from './harness/youtube';

const WATCH_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';

async function openWatchPage(name = 'watch-delhi') {
  const page = openSavedPage(name, WATCH_URL);
  page.video.load({ duration: 1000 });
  await startChrono();
  return { page, panel: queryPanel()! };
}

describe('Panel shell', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 17, 15, 0, 0) });
  });

  it('starts collapsed and expands its details when the compact row is clicked', async () => {
    const { panel } = await openWatchPage();
    const toggle = panel.getByRole('button', { name: 'Details' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(panel.queryByRole('region', { name: 'Details' })).toBeNull();

    fireEvent.click(panel.getByText('16:40 left'));

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    panel.getByRole('region', { name: 'Details' });
  });

  it('remembers on the next watch page that the viewer left it expanded', async () => {
    const first = await openWatchPage();
    fireEvent.click(first.panel.getByRole('button', { name: 'Details' }));
    await settle();
    stopChrono();

    const { panel } = await openWatchPage();

    expect(panel.getByRole('button', { name: 'Details' }).getAttribute('aria-expanded')).toBe('true');
    panel.getByRole('region', { name: 'Details' });
  });

  it('remembers that the viewer collapsed it again', async () => {
    const first = await openWatchPage();
    const toggle = first.panel.getByRole('button', { name: 'Details' });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    await settle();
    stopChrono();

    const { panel } = await openWatchPage();

    expect(panel.queryByRole('region', { name: 'Details' })).toBeNull();
  });

  it('names every control and lets the keyboard reach it', async () => {
    const { panel } = await openWatchPage();

    const named = [
      panel.getByRole('button', { name: 'Slower' }),
      panel.getByRole('button', { name: 'Faster' }),
      panel.getByRole('button', { name: 'Details' }),
      panel.getByRole('button', { name: 'More actions' }),
    ];
    expect(panel.getAllByRole('button')).toEqual(named);
    for (const control of named) expect(control.tabIndex).toBe(0);
  });

  describe("YouTube's keyboard shortcuts", () => {
    /** The keys that reach YouTube's page-wide shortcut handler. */
    function listenAsYouTube() {
      const heard: string[] = [];
      const listener = (event: KeyboardEvent) => heard.push(`${event.type} ${event.key}`);
      for (const type of ['keydown', 'keypress', 'keyup'] as const) document.addEventListener(type, listener);
      return heard;
    }

    function press(element: Element, key: string) {
      fireEvent.keyDown(element, { key });
      fireEvent.keyPress(element, { key, charCode: key.charCodeAt(0) });
      fireEvent.keyUp(element, { key });
    }

    it("don't hear digits typed into a target's fields", async () => {
      const { panel } = await openWatchPage();
      fireEvent.click(panel.getByRole('button', { name: 'Details' }));
      const target = within(panel.getByRole('group', { name: 'Video target' }));
      fireEvent.change(target.getByRole('combobox', { name: 'Target' }), { target: { value: 'watch-time' } });
      const heard = listenAsYouTube();

      press(target.getByRole('spinbutton', { name: 'Hours' }), '3');
      press(target.getByRole('spinbutton', { name: 'Minutes' }), 'ArrowUp');

      expect(heard).toEqual([]);
    });

    it("don't hear Space or k on the Panel's buttons", async () => {
      const { panel } = await openWatchPage();
      const heard = listenAsYouTube();

      press(panel.getByRole('button', { name: 'Faster' }), ' ');
      press(panel.getByRole('button', { name: 'Details' }), 'k');

      expect(heard).toEqual([]);
    });

    it("don't hear arrow keys in the ⋮ menu, which still moves between its items", async () => {
      const { panel } = await openWatchPage();
      fireEvent.click(panel.getByRole('button', { name: 'More actions' }));
      const menu = panel.getByRole('menu');
      const heard = listenAsYouTube();

      press(menu, 'ArrowDown');

      expect(heard).toEqual([]);
      expect(panel.element.shadowRoot!.activeElement?.getAttribute('role')).toMatch(/^menuitem/);
    });

    it('still hear keys pressed outside the Panel', async () => {
      const { page } = await openWatchPage();
      const heard = listenAsYouTube();

      fireEvent.keyDown(page.video.element, { key: 'k' });

      expect(heard).toEqual(['keydown k']);
    });
  });

  describe('screen reader announcements', () => {
    it('announce the new speed when the viewer presses − or +', async () => {
      const { panel } = await openWatchPage();
      const status = panel.getByRole('status');
      expect(status.textContent).toBe('');

      fireEvent.click(panel.getByRole('button', { name: 'Faster' }));
      expect(status.textContent?.trim()).toBe('Speed 1.25×');

      fireEvent.click(panel.getByRole('button', { name: 'Slower' }));
      await settle();
      fireEvent.click(panel.getByRole('button', { name: 'Slower' }));
      expect(status.textContent?.trim()).toBe('Speed 0.75×');
    });

    it("announce the speed again when it can't go any faster, so a press is never silent", async () => {
      const { page, panel } = await openWatchPage();
      page.player.setSpeed(2);
      await settle();
      const faster = panel.getByRole('button', { name: 'Faster' });
      for (let i = 0; i < 8; i++) fireEvent.click(faster);
      expect(page.video.speed).toBe(4);
      const status = panel.getByRole('status');

      fireEvent.click(panel.getByRole('button', { name: 'Faster' }));
      const first = status.textContent;
      fireEvent.click(panel.getByRole('button', { name: 'Faster' }));

      expect(status.textContent?.trim()).toBe('Speed 4×');
      expect(status.textContent).not.toBe(first);
    });

    it('stay quiet while the times tick', async () => {
      const { page, panel } = await openWatchPage();
      page.video.play();

      vi.advanceTimersByTime(5000);

      expect(panel.getByRole('status').textContent).toBe('');
    });
  });

  // Chrono's own copy of YouTube's text colours: #0f0f0f on light, #f1f1f1 on dark.
  const LIGHT_TEXT = 'rgb(15, 15, 15)';
  const DARK_TEXT = 'rgb(241, 241, 241)';
  const textColour = (element: Element) => getComputedStyle(element).color;

  it("uses YouTube's light colours on a light-theme page", async () => {
    const { panel } = await openWatchPage('watch-delhi');

    expect(textColour(panel.getByText('16:40 left'))).toBe(LIGHT_TEXT);
  });

  it("uses YouTube's dark colours on a dark-theme page", async () => {
    const { panel } = await openWatchPage('watch-delhi-dark');

    expect(textColour(panel.getByText('16:40 left'))).toBe(DARK_TEXT);
  });

  it('follows YouTube when the viewer switches theme', async () => {
    const { page, panel } = await openWatchPage('watch-delhi');

    page.setTheme('dark');
    await settle();
    expect(textColour(panel.getByText('16:40 left'))).toBe(DARK_TEXT);

    page.setTheme('light');
    await settle();
    expect(textColour(panel.getByText('16:40 left'))).toBe(LIGHT_TEXT);
  });

  describe('⋮ menu', () => {
    it('opens and closes with its button', async () => {
      const { panel } = await openWatchPage();
      const button = panel.getByRole('button', { name: 'More actions' });
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(panel.queryByRole('menu')).toBeNull();

      fireEvent.click(button);
      expect(button.getAttribute('aria-expanded')).toBe('true');
      panel.getByRole('menu', { name: 'More actions' });

      fireEvent.click(button);
      expect(panel.queryByRole('menu')).toBeNull();
    });

    it("doesn't expand the Panel's details", async () => {
      const { panel } = await openWatchPage();

      fireEvent.click(panel.getByRole('button', { name: 'More actions' }));

      expect(panel.queryByRole('region', { name: 'Details' })).toBeNull();
    });

    it('takes keyboard focus when it opens, and Escape closes it and gives focus back', async () => {
      const { panel } = await openWatchPage();
      const button = panel.getByRole('button', { name: 'More actions' });
      button.focus();

      fireEvent.click(button);
      const menu = panel.getByRole('menu');
      expect(panel.element.shadowRoot!.activeElement).toBe(menu);

      fireEvent.keyDown(menu, { key: 'Escape' });
      expect(panel.queryByRole('menu')).toBeNull();
      expect(panel.element.shadowRoot!.activeElement).toBe(button);
    });

    it('closes when the viewer clicks elsewhere on the page', async () => {
      const { page, panel } = await openWatchPage();
      fireEvent.click(panel.getByRole('button', { name: 'More actions' }));

      fireEvent.pointerDown(page.video.element);

      expect(panel.queryByRole('menu')).toBeNull();
    });

    it('closes when keyboard focus leaves it', async () => {
      const { panel } = await openWatchPage();
      fireEvent.click(panel.getByRole('button', { name: 'More actions' }));

      panel.getByRole('button', { name: 'Details' }).focus();

      expect(panel.queryByRole('menu')).toBeNull();
    });
  });
});
