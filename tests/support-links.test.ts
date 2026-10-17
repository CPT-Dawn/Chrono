import { fireEvent } from '@testing-library/dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { openedPages, startBackground, viewTab } from './harness/background';
import { followReportLink, queryPanel, settle, startChrono } from './harness/chrono';
import { openPopup } from './harness/popup';
import { openSavedPage } from './harness/youtube';

const VIDEO_ID = 'aqz-KE-bpKQ';
const WATCH_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;

const LINKS = ['Support Chrono', 'Get help', 'Something look wrong? Report it'];

async function openWatchPage() {
  const page = openSavedPage('watch-delhi', WATCH_URL);
  page.video.load({ duration: 1000 });
  page.video.seek(250);
  await startChrono();
  return page;
}

/** Opens the Panel's ⋮ menu and returns it. */
function openMenu() {
  const panel = queryPanel()!;
  fireEvent.click(panel.getByRole('button', { name: 'More actions' }));
  return panel.getByRole('menu', { name: 'More actions' });
}

describe("The Panel's ⋮ menu", () => {
  beforeEach(async () => {
    await startBackground({ version: '3.0.0', browser: { name: 'chrome', version: '141' }, os: 'win' });
  });

  it('offers Support Chrono, Get help and Report it', async () => {
    await openWatchPage();
    openMenu();

    for (const name of LINKS) queryPanel()!.getByRole('menuitem', { name });
  });

  it('"Support Chrono" opens the tip page and closes the menu', async () => {
    await openWatchPage();
    const menu = openMenu();

    fireEvent.click(queryPanel()!.getByRole('menuitem', { name: 'Support Chrono' }));
    await settle();

    expect((await openedPages()).map(String)).toEqual(['https://chrono.cptdawn.dev/tip']);
    expect(menu.hidden).toBe(true);
  });

  it('"Get help" opens the help page with only the version, browser and OS', async () => {
    await openWatchPage();
    openMenu();

    fireEvent.click(queryPanel()!.getByRole('menuitem', { name: 'Get help' }));
    await settle();

    expect((await openedPages()).map(String)).toEqual([
      'https://chrono.cptdawn.dev/help?v=3.0.0&browser=chrome&browserVersion=141&os=win',
    ]);
  });

  it('reaches every link with the arrow keys, last item first with End', async () => {
    await openWatchPage();
    const menu = openMenu();
    const panel = queryPanel()!;
    const focused = () => panel.element.shadowRoot!.activeElement;

    fireEvent.keyDown(menu, { key: 'End' });
    expect(focused()).toBe(panel.getByRole('menuitem', { name: 'Something look wrong? Report it' }));
    fireEvent.keyDown(focused()!, { key: 'ArrowUp' });
    expect(focused()).toBe(panel.getByRole('menuitem', { name: 'Get help' }));
    fireEvent.keyDown(focused()!, { key: 'ArrowUp' });
    expect(focused()).toBe(panel.getByRole('menuitem', { name: 'Support Chrono' }));
  });

  it.each([
    ['Enter', 'Support Chrono', '/tip'],
    [' ', 'Get help', '/help'],
    ['Enter', 'Something look wrong? Report it', '/help'],
  ])('opens a link with %j, and gives focus back to the ⋮ button', async (key, name, path) => {
    await openWatchPage();
    openMenu();
    const panel = queryPanel()!;
    const item = panel.getByRole('menuitem', { name });
    item.focus();

    fireEvent.keyDown(item, { key });
    await settle();

    expect((await openedPages()).map((url) => url.pathname)).toEqual([path]);
    expect(panel.element.shadowRoot!.activeElement).toBe(panel.getByRole('button', { name: 'More actions' }));
  });
});

describe('The toolbar popup', () => {
  beforeEach(async () => {
    await startBackground({ version: '3.0.0', browser: { name: 'firefox', version: '144.0' }, os: 'mac' });
  });

  it('offers Support Chrono, Get help and Report it as buttons, which the keyboard reaches', async () => {
    const popup = await openPopup();

    for (const name of LINKS) {
      const button = popup.getByRole('button', { name });
      // A native, enabled button: Tab reaches it and Enter and Space press it.
      expect(button.localName).toBe('button');
      expect(button.hasAttribute('disabled')).toBe(false);
    }
  });

  it('"Support Chrono" opens the tip page', async () => {
    const popup = await openPopup();

    fireEvent.click(popup.getByRole('button', { name: 'Support Chrono' }));
    await settle();

    expect((await openedPages()).map(String)).toEqual(['https://chrono.cptdawn.dev/tip']);
  });

  it('"Get help" opens the help page with the version, browser and OS', async () => {
    const popup = await openPopup();

    fireEvent.click(popup.getByRole('button', { name: 'Get help' }));
    await settle();

    expect((await openedPages()).map(String)).toEqual([
      'https://chrono.cptdawn.dev/help?v=3.0.0&browser=firefox&browserVersion=144.0&os=mac',
    ]);
  });

  it('"Report it" includes what Chrono detected on the YouTube watch page the viewer is looking at', async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL);
    page.withhold(page.timeDisplay);
    page.video.load({ duration: 1000 });
    await startChrono();
    await viewTab(WATCH_URL);
    const popup = await openPopup();

    fireEvent.click(popup.getByRole('button', { name: 'Something look wrong? Report it' }));
    await settle();

    const [report] = await openedPages();
    expect(report!.searchParams.get('player')).toBe('delhi');
    expect(report!.searchParams.get('layout')).toBe('sidebar');
    expect(report!.searchParams.get('failed')).toBe('live');
    expect(report!.href).not.toContain(VIDEO_ID);
  });

  it('"Report it" says failed=sidebar when Chrono found nowhere to put the Panel', async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL);
    page.withhold(page.sidebar.parentElement!);
    page.video.load({ duration: 1000 });
    await startChrono();
    expect(queryPanel()).toBeNull();
    await viewTab(WATCH_URL);
    const popup = await openPopup();

    fireEvent.click(popup.getByRole('button', { name: 'Something look wrong? Report it' }));

    const [report] = await openedPages();
    expect(report!.searchParams.get('failed')).toBe('sidebar');
    expect(report!.searchParams.get('layout')).toBeNull();
    expect(report!.searchParams.get('player')).toBe('delhi');
  });

  it('"Report it" is the help page alone when the viewer is on another site', async () => {
    await viewTab('https://example.com/');
    const popup = await openPopup();

    fireEvent.click(popup.getByRole('button', { name: 'Something look wrong? Report it' }));
    await settle();

    expect((await openedPages()).map(String)).toEqual([
      'https://chrono.cptdawn.dev/help?v=3.0.0&browser=firefox&browserVersion=144.0&os=mac',
    ]);
  });
});

describe('"Something look wrong? Report it"', () => {
  it('says which player and layout Chrono found, and that nothing failed', async () => {
    await openWatchPage();

    const report = await followReportLink();

    expect(report.origin + report.pathname).toBe('https://chrono.cptdawn.dev/help');
    expect(report.searchParams.get('player')).toBe('delhi');
    expect(report.searchParams.get('layout')).toBe('sidebar');
    expect(report.searchParams.get('failed')).toBeNull();
  });

  it('says when the Panel sits below the video in a narrow window', async () => {
    const page = await openWatchPage();
    page.setLayout('one-column');
    await settle();

    const report = await followReportLink();

    expect(report.searchParams.get('layout')).toBe('below-video');
  });

  it("names the player as legacy on YouTube's player from before the redesign", async () => {
    const page = await openWatchPage();
    // The legacy player is the same element without the redesign's flag.
    page.player.element.classList.remove('ytp-delhi-modern');

    const report = await followReportLink();

    expect(report.searchParams.get('player')).toBe('legacy');
  });

  it("reports failed=speed when YouTube's player speed API isn't recognised", async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL, { playerApi: false });
    page.video.load({ duration: 1000 });
    await startChrono();

    const report = await followReportLink();

    expect(report.searchParams.get('failed')).toBe('speed');
    expect(report.searchParams.get('player')).toBe('delhi');
  });

  it('carries nothing from the page: no video ID, title or address', async () => {
    await openWatchPage();
    const title = document.querySelector('title')?.textContent ?? '';

    const report = await followReportLink();

    expect([...report.searchParams.keys()].sort()).toEqual(
      ['browser', 'browserVersion', 'layout', 'os', 'player', 'v'].sort(),
    );
    expect(report.href).not.toContain(VIDEO_ID);
    expect(report.href).not.toContain('youtube');
    if (title) expect(report.href).not.toContain(encodeURIComponent(title));
  });
});
