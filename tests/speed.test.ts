import { fireEvent, within } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countObservers,
  countPageListeners,
  queryPanel,
  settle,
  startChrono,
  startPlayerScript,
  stopChrono,
  stopContentScript,
} from './harness/chrono';
import { finishNavigation, openSavedPage, renderSavedPage, startNavigation } from './harness/youtube';

const WATCH_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
const NEXT_WATCH_URL = 'https://www.youtube.com/watch?v=YE7VzlLtp-4';

/** The listeners, observers and timers running in the page, which the viewer can't see. */
function runningWork() {
  return { listeners: countPageListeners(), observers: countObservers(), timers: vi.getTimerCount() };
}

describe('Speed', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 17, 15, 0, 0) });
  });

  it("follows YouTube's speed when the viewer changes it in YouTube's menu", async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL);
    page.video.load({ duration: 1000 });
    page.video.seek(250);
    await startChrono();
    const panel = queryPanel()!;
    panel.getByText('1×');

    page.player.setSpeed(1.5);

    panel.getByText('1.5×');
    // 750 s of content at 1.5× takes 500 s.
    panel.getByText('8:20 left at 1.5×');
    panel.getByText('ends 3:08 PM');
  });

  it("speeds up by 0.25× through YouTube's player, so YouTube's menu shows the same speed", async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL);
    page.video.load({ duration: 1000 });
    page.video.seek(250);
    await startChrono();
    const panel = queryPanel()!;

    panel.getByRole('button', { name: 'Faster' }).click();

    expect(page.player.speed).toBe(1.25);
    panel.getByText('1.25×');
    // 750 s of content at 1.25× takes 600 s.
    panel.getByText('10:00 left at 1.25×');
    panel.getByText('ends 3:10 PM');
  });

  it("slows down by 0.25× and stops at YouTube's slowest speed, 0.25×", async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL);
    page.video.load({ duration: 1000 });
    await startChrono();
    page.player.setSpeed(0.5);
    const panel = queryPanel()!;
    const slower = panel.getByRole('button', { name: 'Slower' });

    slower.click();
    expect(page.player.speed).toBe(0.25);
    panel.getByText('0.25×');

    slower.click();
    expect(page.player.speed).toBe(0.25);
    panel.getByText('0.25×');
  });

  it("stops at YouTube's fastest speed, 2×", async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL);
    page.video.load({ duration: 1000 });
    await startChrono();
    page.player.setSpeed(1.9);
    const panel = queryPanel()!;
    const faster = panel.getByRole('button', { name: 'Faster' });

    faster.click();
    expect(page.player.speed).toBe(2);
    panel.getByText('2×');

    faster.click();
    expect(page.player.speed).toBe(2);
  });

  it("rounds the speed it sets to YouTube's 0.05× steps", async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL);
    page.video.load({ duration: 1000 });
    await startChrono();
    // Set by something other than YouTube's menu, such as another extension.
    page.player.setSpeed(1.33);
    const panel = queryPanel()!;
    panel.getByText('1.33×');

    panel.getByRole('button', { name: 'Faster' }).click();

    expect(page.player.speed).toBe(1.6);
    panel.getByText('1.6×');
  });

  it("hides the speed controls when YouTube's player speed API isn't recognised", async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL, { playerApi: false });
    page.video.load({ duration: 1000 });
    page.video.seek(250);

    await startChrono();

    const panel = queryPanel()!;
    expect(panel.queryByRole('button', { name: 'Faster' })).toBeNull();
    expect(panel.queryByRole('button', { name: 'Slower' })).toBeNull();
    panel.getByText('12:30 left at 1×');

    // The video still plays at whatever speed it has.
    page.video.setSpeed(1.5);
    panel.getByText('8:20 left at 1.5×');
  });

  it("shows the speed controls once YouTube's player has started", async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL, { playerApi: false });
    await startChrono();
    const panel = queryPanel()!;
    expect(panel.queryByRole('button', { name: 'Faster' })).toBeNull();

    page.player.addApi();
    page.video.load({ duration: 1000 });

    panel.getByText('1×');
    panel.getByRole('button', { name: 'Faster' }).click();
    expect(page.player.speed).toBe(1.25);
  });

  it("shows the speed controls when YouTube's watch page takes in a player that has already started", async () => {
    // A fresh page load: YouTube starts its player and plays the video before it renders
    // the watch page, so no media event is left to come once the player moves in.
    const page = openSavedPage('watch-delhi', WATCH_URL, { playerOutsideWatchPage: true });
    page.video.load({ duration: 1000 });
    page.video.play();
    await startChrono();

    page.adoptPlayer();
    await settle();

    const panel = queryPanel()!;
    fireEvent.click(panel.getByRole('button', { name: 'Details' }));
    const table = within(panel.getByRole('group', { name: 'Speed table' }));
    expect((table.getByRole('button', { name: /^1\.5×/ }) as HTMLButtonElement).disabled).toBe(false);
    panel.getByRole('button', { name: 'Faster' }).click();
    expect(page.player.speed).toBe(1.25);
  });

  it("shows the speed controls when YouTube's player gains its API after the video has started", async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL, { playerApi: false });
    page.video.load({ duration: 1000 });
    page.video.seek(250);
    page.video.play();
    await startChrono();
    const panel = queryPanel()!;
    fireEvent.click(panel.getByRole('button', { name: 'Details' }));
    const row = () =>
      within(panel.getByRole('group', { name: 'Speed table' })).getByRole('button', { name: /^1\.5×/ }) as HTMLButtonElement;
    expect(row().disabled).toBe(true);

    page.player.addApi();
    page.announcePlayer();

    expect(row().disabled).toBe(false);
    panel.getByRole('button', { name: 'Faster' }).click();
    expect(page.player.speed).toBe(1.25);
  });

  it("keeps waiting for YouTube's player API when the browser starts the content script again", async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL, { playerApi: false });
    page.video.load({ duration: 1000 });
    await startChrono();
    // The new content script stops the first one as it starts.
    await startChrono();

    page.player.addApi();
    page.announcePlayer();

    queryPanel()!.getByRole('button', { name: 'Faster' }).click();
    expect(page.player.speed).toBe(1.25);
  });

  it("shows the speed controls when a player YouTube swapped in during navigation gains its API late", async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL);
    page.video.load({ duration: 1000 });
    await startChrono();

    await startNavigation(NEXT_WATCH_URL);
    // YouTube renders the next watch page from scratch, with a player that hasn't started.
    const next = renderSavedPage('watch-delhi', { playerApi: false });
    next.video.load({ duration: 2000 });
    await finishNavigation();
    expect(queryPanel()!.queryByRole('button', { name: 'Faster' })).toBeNull();

    next.player.addApi();
    next.announcePlayer();

    queryPanel()!.getByRole('button', { name: 'Faster' }).click();
    expect(next.player.speed).toBe(1.25);
  });

  it("leaves nothing running for YouTube's player API once it's recognised", async () => {
    // What runs on a watch page whose player had its API from the start.
    const ready = openSavedPage('watch-delhi', WATCH_URL);
    ready.video.load({ duration: 1000 });
    await startChrono();
    const expected = runningWork();
    stopChrono();

    const page = openSavedPage('watch-delhi', WATCH_URL, { playerOutsideWatchPage: true });
    page.video.load({ duration: 1000 });
    await startChrono();
    page.adoptPlayer();
    await settle();

    expect(runningWork()).toEqual(expected);
  });

  it("doesn't wait for YouTube's player API on a page where Chrono's content script never runs", async () => {
    // What runs there when YouTube's player has its API.
    openSavedPage('watch-delhi', WATCH_URL);
    await startPlayerScript();
    const expected = runningWork();
    stopChrono();

    const page = openSavedPage('watch-delhi', WATCH_URL, { playerOutsideWatchPage: true });
    page.video.load({ duration: 1000 });
    await startPlayerScript();
    expect(runningWork()).toEqual(expected);

    page.adoptPlayer();
    expect(runningWork()).toEqual(expected);
  });

  it("stops waiting for YouTube's player API when Chrono's content script stops", async () => {
    // What's left running when the content script stops on a page whose player has its API.
    openSavedPage('watch-delhi', WATCH_URL);
    await startChrono();
    stopContentScript();
    const expected = runningWork();
    stopChrono();

    openSavedPage('watch-delhi', WATCH_URL, { playerApi: false });
    await startChrono();
    stopContentScript();

    expect(runningWork()).toEqual(expected);
  });

  it('connects to YouTube\'s player when the content script runs first', async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL);
    page.video.load({ duration: 1000 });
    await startChrono({ contentScriptFirst: true });
    const panel = queryPanel()!;

    page.player.setSpeed(1.5);
    panel.getByText('1.5×');

    panel.getByRole('button', { name: 'Faster' }).click();
    expect(page.player.speed).toBe(1.75);
  });
});
