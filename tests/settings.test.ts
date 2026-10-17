import { fireEvent, within } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { queryPanel, settle, startChrono, stopChrono } from './harness/chrono';
import { openPopup } from './harness/popup';
import { openSavedPage } from './harness/youtube';

const WATCH_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';

async function openWatchPage() {
  const page = openSavedPage('watch-delhi', WATCH_URL);
  page.video.load({ duration: 1000 });
  page.video.seek(250);
  await startChrono();
  return { page, panel: queryPanel()! };
}

describe('Settings', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 17, 15, 0, 0) });
  });

  describe('Clock format', () => {
    it('changed in the popup, changes the finish time in an open Panel without a reload', async () => {
      const { panel } = await openWatchPage();
      panel.getByText('ends 3:12 PM');
      const popup = await openPopup();

      fireEvent.click(popup.getByRole('radio', { name: '24-hour' }));
      await settle();

      panel.getByText('ends 15:12');
    });

    it("starts on Automatic, which follows a 12-hour locale's convention", async () => {
      const popup = await openPopup();
      expect(popup.getByRole<HTMLInputElement>('radio', { name: 'Automatic' }).checked).toBe(true);

      const { panel } = await openWatchPage();

      panel.getByText('ends 3:12 PM');
    });

    it("follows a 24-hour locale's convention on Automatic", async () => {
      vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-GB');

      const { panel } = await openWatchPage();

      panel.getByText('ends 15:12');
    });

    it('writes 12-hour times when chosen, even in a 24-hour locale', async () => {
      vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-GB');
      const { panel } = await openWatchPage();
      const popup = await openPopup();

      fireEvent.click(popup.getByRole('radio', { name: '12-hour' }));
      await settle();

      panel.getByText(/^ends 3:12\s?pm$/i);
    });

    it('is remembered for the next watch page', async () => {
      const popup = await openPopup();
      fireEvent.click(popup.getByRole('radio', { name: '24-hour' }));
      await settle();

      const { panel } = await openWatchPage();

      panel.getByText('ends 15:12');
    });

    it("ignores Chrono 2's 24-hour setting", async () => {
      await fakeBrowser.storage.local.set({ is24HourMode: true });

      const { panel } = await openWatchPage();

      panel.getByText('ends 3:12 PM');
      const popup = await openPopup();
      expect(popup.getByRole<HTMLInputElement>('radio', { name: 'Automatic' }).checked).toBe(true);
    });
  });

  describe('Panel starts expanded', () => {
    it('is off at first, so a fresh watch page shows the Panel collapsed', async () => {
      const popup = await openPopup();
      expect(popup.getByRole<HTMLInputElement>('checkbox', { name: 'Panel starts expanded' }).checked).toBe(false);

      const { panel } = await openWatchPage();

      expect(panel.queryByRole('region', { name: 'Details' })).toBeNull();
    });

    it('turned on, opens the Panel expanded on a fresh watch page', async () => {
      const popup = await openPopup();
      fireEvent.click(popup.getByRole('checkbox', { name: 'Panel starts expanded' }));
      await settle();

      const { panel } = await openWatchPage();

      panel.getByRole('region', { name: 'Details' });
    });

    it('is turned on and off by expanding and collapsing the Panel, in the menu and the popup', async () => {
      const { panel } = await openWatchPage();
      const popup = await openPopup();
      const popupSetting = popup.getByRole<HTMLInputElement>('checkbox', { name: 'Panel starts expanded' });
      const toggle = panel.getByRole('button', { name: 'Details' });
      const menuSetting = () => {
        fireEvent.click(panel.getByRole('button', { name: 'More actions' }));
        const item = panel.getByRole('menuitemcheckbox', { name: 'Panel starts expanded' });
        fireEvent.click(panel.getByRole('button', { name: 'More actions' }));
        return item.getAttribute('aria-checked');
      };

      fireEvent.click(toggle);
      await settle();
      expect(popupSetting.checked).toBe(true);
      expect(menuSetting()).toBe('true');

      fireEvent.click(toggle);
      await settle();
      expect(popupSetting.checked).toBe(false);
      expect(menuSetting()).toBe('false');
    });

    it('expands and collapses an open Panel as it is turned on and off', async () => {
      const { panel } = await openWatchPage();
      const popup = await openPopup();
      const setting = popup.getByRole('checkbox', { name: 'Panel starts expanded' });

      fireEvent.click(setting);
      await settle();
      panel.getByRole('region', { name: 'Details' });

      fireEvent.click(setting);
      await settle();
      expect(panel.queryByRole('region', { name: 'Details' })).toBeNull();
    });

    it('opens a fresh watch page the way the viewer left the Panel, even after the setting changed', async () => {
      const popup = await openPopup();
      fireEvent.click(popup.getByRole('checkbox', { name: 'Panel starts expanded' }));
      await settle();
      const first = await openWatchPage();
      fireEvent.click(first.panel.getByRole('button', { name: 'Details' }));
      await settle();
      stopChrono();

      const { panel } = await openWatchPage();

      expect(panel.queryByRole('region', { name: 'Details' })).toBeNull();
      expect(popup.getByRole<HTMLInputElement>('checkbox', { name: 'Panel starts expanded' }).checked).toBe(false);
    });
  });

  describe('⋮ menu', () => {
    async function openMenu() {
      const opened = await openWatchPage();
      fireEvent.click(opened.panel.getByRole('button', { name: 'More actions' }));
      return { ...opened, menu: within(opened.panel.getByRole('menu', { name: 'More actions' })) };
    }
    const isChecked = (item: HTMLElement) => item.getAttribute('aria-checked') === 'true';

    it('shows the same settings as the popup, with the same values', async () => {
      const popup = await openPopup();
      fireEvent.click(popup.getByRole('radio', { name: '24-hour' }));
      fireEvent.click(popup.getByRole('checkbox', { name: 'Panel starts expanded' }));
      await settle();

      const { menu } = await openMenu();

      expect(menu.getAllByRole('menuitemradio').map((item) => [item.textContent, isChecked(item)])).toEqual([
        ['Automatic', false],
        ['12-hour', false],
        ['24-hour', true],
      ]);
      menu.getByRole('group', { name: 'Clock format' });
      expect(isChecked(menu.getByRole('menuitemcheckbox', { name: 'Panel starts expanded' }))).toBe(true);
    });

    it('changes Clock format in the Panel, the popup and every other tab at once', async () => {
      const { panel, menu } = await openMenu();
      const popup = await openPopup();

      fireEvent.click(menu.getByRole('menuitemradio', { name: '24-hour' }));
      await settle();

      panel.getByText('ends 15:12');
      expect(isChecked(menu.getByRole('menuitemradio', { name: '24-hour' }))).toBe(true);
      expect(isChecked(menu.getByRole('menuitemradio', { name: 'Automatic' }))).toBe(false);
      expect(popup.getByRole<HTMLInputElement>('radio', { name: '24-hour' }).checked).toBe(true);
    });

    it('turns Panel starts expanded on and off, and stays open to do it', async () => {
      const { menu } = await openMenu();
      const popup = await openPopup();
      const item = menu.getByRole('menuitemcheckbox', { name: 'Panel starts expanded' });

      fireEvent.click(item);
      await settle();
      expect(isChecked(item)).toBe(true);
      expect(popup.getByRole<HTMLInputElement>('checkbox', { name: 'Panel starts expanded' }).checked).toBe(true);

      fireEvent.click(item);
      await settle();
      expect(isChecked(item)).toBe(false);
      menu.getByRole('menuitemcheckbox', { name: 'Panel starts expanded' });
    });

    it('follows changes made in the popup while it is open', async () => {
      const { menu } = await openMenu();
      const popup = await openPopup();

      fireEvent.click(popup.getByRole('radio', { name: '12-hour' }));
      await settle();

      expect(isChecked(menu.getByRole('menuitemradio', { name: '12-hour' }))).toBe(true);
    });

    it('lets the keyboard move through the settings with the arrow keys', async () => {
      const { panel, menu } = await openMenu();
      const focused = () => panel.element.shadowRoot!.activeElement;
      // Every item, top to bottom.
      const items = [...menu.getAllByRole('menuitemcheckbox'), ...menu.getAllByRole('menuitemradio')].sort((a, b) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
      );
      const last = items.at(-1);
      const twelveHour = menu.getByRole('menuitemradio', { name: '12-hour' });

      fireEvent.keyDown(focused()!, { key: 'ArrowDown' });
      expect(focused()).toBe(items[0]);
      fireEvent.keyDown(focused()!, { key: 'ArrowDown' });
      expect(focused()).toBe(items[1]);
      fireEvent.keyDown(focused()!, { key: 'End' });
      expect(focused()).toBe(last);
      fireEvent.keyDown(focused()!, { key: 'ArrowDown' });
      expect(focused()).toBe(items[0]);
      fireEvent.keyDown(focused()!, { key: 'ArrowUp' });
      expect(focused()).toBe(last);
      fireEvent.keyDown(focused()!, { key: 'Home' });
      expect(focused()).toBe(items[0]);

      for (let i = 0; i < items.length && focused() !== twelveHour; i++) fireEvent.keyDown(focused()!, { key: 'ArrowDown' });
      fireEvent.keyDown(focused()!, { key: 'Enter' });
      await settle();
      expect(isChecked(twelveHour)).toBe(true);
    });
  });

  describe('Toolbar popup', () => {
    it('says where Chrono works', async () => {
      const popup = await openPopup();

      popup.getByText('Chrono works on YouTube watch and playlist pages.');
    });

    it("works when the active tab isn't YouTube, with Chrono running in no tab", async () => {
      const popup = await openPopup();

      fireEvent.click(popup.getByRole('radio', { name: '24-hour' }));
      await settle();
      const reopened = await openPopup();

      expect(reopened.getByRole<HTMLInputElement>('radio', { name: '24-hour' }).checked).toBe(true);
    });
  });
});
