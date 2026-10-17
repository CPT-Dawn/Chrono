import { describe, expect, it } from 'vitest';
import { openLink } from '@/link-requests';
import { install, openedPages, startBackground, uninstallPage } from './harness/background';
import { settle } from './harness/chrono';

const HELP_PARAMS = ['v', 'browser', 'browserVersion', 'os'];
const REPORT_PARAMS = [...HELP_PARAMS, 'player', 'layout', 'failed'];

async function openedUrls(): Promise<string[]> {
  return (await openedPages()).map(String);
}

describe('Lifecycle pages', () => {
  it('opens the welcome page on install', async () => {
    await startBackground();

    await install({ reason: 'install' });

    expect(await openedUrls()).toEqual(['https://chrono.cptdawn.dev/welcome']);
  });

  it("opens what's new, with both versions, on an update to a new major version", async () => {
    await startBackground({ version: '3.0.0' });

    await install({ reason: 'update', previousVersion: '2.0.0' });

    expect(await openedUrls()).toEqual(['https://chrono.cptdawn.dev/whats-new?from=2.0.0&to=3.0.0']);
  });

  it('opens nothing on a patch update', async () => {
    await startBackground({ version: '3.0.1' });

    await install({ reason: 'update', previousVersion: '3.0.0' });

    expect(await openedUrls()).toEqual([]);
  });

  it('opens nothing on a minor update', async () => {
    await startBackground({ version: '3.1.0' });

    await install({ reason: 'update', previousVersion: '3.0.4' });

    expect(await openedUrls()).toEqual([]);
  });

  it('sets the goodbye page, with the version, as the uninstall page', async () => {
    await startBackground({ version: '3.0.1' });

    expect(uninstallPage()?.href).toBe('https://chrono.cptdawn.dev/goodbye?v=3.0.1');
  });
});

describe('Links', () => {
  it('"Support Chrono" opens the tip page', async () => {
    await startBackground();

    await openLink('tip');
    await settle();

    expect(await openedUrls()).toEqual(['https://chrono.cptdawn.dev/tip']);
  });

  it('"Get help" opens the help page with the version, browser and OS in Chrome', async () => {
    await startBackground({ version: '3.0.0', browser: { name: 'chrome', version: '141' }, os: 'mac' });

    await openLink('help');
    await settle();

    expect(await openedUrls()).toEqual([
      'https://chrono.cptdawn.dev/help?v=3.0.0&browser=chrome&browserVersion=141&os=mac',
    ]);
  });

  it('"Get help" names Firefox and its version in Firefox', async () => {
    await startBackground({ version: '3.0.0', browser: { name: 'firefox', version: '144.0.2' }, os: 'linux' });

    await openLink('help');
    await settle();

    expect(await openedUrls()).toEqual([
      'https://chrono.cptdawn.dev/help?v=3.0.0&browser=firefox&browserVersion=144.0.2&os=linux',
    ]);
  });

  it('the help link carries only the allowed parameters', async () => {
    await startBackground();

    await openLink('help');
    await settle();

    const [help] = await openedPages();
    expect([...help!.searchParams.keys()]).toEqual(HELP_PARAMS);
  });

  it('a report carries only the allowed parameters, even if asked to carry more', async () => {
    await startBackground();

    // As if a content script sent more than a report holds.
    const page = { player: 'delhi', layout: 'sidebar', failed: ['ads'], videoId: 'aqz-KE-bpKQ', title: 'Big Buck Bunny' };
    await openLink('report', page as never);
    await settle();

    const [report] = await openedPages();
    expect([...report!.searchParams.keys()]).toEqual(REPORT_PARAMS);
    expect(report!.href).not.toMatch(/aqz-KE-bpKQ|Bunny/);
  });

  it('a report leaves out details that are not ones Chrono knows', async () => {
    await startBackground();

    // As if a content script put page content where Chrono's detections go.
    const page = { player: 'aqz-KE-bpKQ', layout: 'https://www.youtube.com/', failed: ['ads', 'Big Buck Bunny'] };
    await openLink('report', page as never);

    const [report] = await openedPages();
    expect(report!.searchParams.get('player')).toBeNull();
    expect(report!.searchParams.get('layout')).toBeNull();
    expect(report!.searchParams.get('failed')).toBe('ads');
  });
});
