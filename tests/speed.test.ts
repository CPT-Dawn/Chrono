import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryPanel, startChrono } from './harness/chrono';
import { openSavedPage } from './harness/youtube';

const WATCH_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';

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
