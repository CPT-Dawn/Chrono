import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryPanel, settle, startChrono } from './harness/chrono';
import { openSavedPage } from './harness/youtube';

const WATCH_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';

describe('Panel on a watch page', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 17, 15, 0, 0) });
  });

  it("shows the video's remaining and finish time at the top of the sidebar", async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL);
    page.video.load({ duration: 1000 });
    page.video.seek(250);

    await startChrono();

    const panel = queryPanel();
    expect(panel).not.toBeNull();
    expect(page.sidebar.firstElementChild).toBe(panel!.element);
    panel!.getByText('12:30 left at 1×');
    panel!.getByText('ends 3:12 PM');
  });

  it('gives remaining as watch time at the current speed', async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL);
    page.video.load({ duration: 1000 });
    page.video.seek(250);
    await startChrono();

    page.video.setSpeed(1.5);

    // 750 s of content at 1.5× takes 500 s.
    const panel = queryPanel()!;
    panel.getByText('8:20 left at 1.5×');
    panel.getByText('ends 3:08 PM');
  });

  it('lowers remaining as the video plays', async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL);
    page.video.load({ duration: 1000 });
    page.video.seek(250);
    await startChrono();

    page.video.play();
    vi.advanceTimersByTime(60_000);

    const panel = queryPanel()!;
    panel.getByText('11:30 left at 1×');
    panel.getByText('ends 3:12 PM');
  });

  it('moves the finish time on while the video is paused', async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL);
    page.video.load({ duration: 1000 });
    page.video.seek(250);
    await startChrono();

    vi.advanceTimersByTime(5 * 60_000);

    const panel = queryPanel()!;
    panel.getByText('12:30 left at 1×');
    panel.getByText('ends 3:17 PM');
  });

  it("writes the finish time in the browser's locale", async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-GB');
    const page = openSavedPage('watch-delhi', WATCH_URL);
    page.video.load({ duration: 1000 });
    page.video.seek(250);

    await startChrono();

    queryPanel()!.getByText('ends 15:12');
  });

  it('names the day when the video finishes after midnight', async () => {
    vi.setSystemTime(new Date(2026, 9, 17, 23, 50, 0)); // a Saturday
    const page = openSavedPage('watch-delhi', WATCH_URL);
    page.video.load({ duration: 30 * 60 });

    await startChrono();

    queryPanel()!.getByText('ends Sun 12:20 AM');
  });

  it("fills in once the video's length is known", async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL);
    await startChrono();

    const panel = queryPanel()!;
    expect(panel.queryByText(/NaN|left at|ends/)).toBeNull();

    page.video.load({ duration: 1000 });

    panel.getByText('16:40 left at 1×');
    panel.getByText('ends 3:16 PM');
  });

  it('appears once YouTube has rendered the video and the sidebar', async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL);
    page.video.load({ duration: 1000 });
    const renderVideo = page.withhold(page.video.element);
    const renderSidebar = page.withhold(page.sidebar);
    await startChrono();
    expect(queryPanel()).toBeNull();

    renderVideo();
    await settle();
    expect(queryPanel()).toBeNull();

    renderSidebar();
    await settle();
    queryPanel()!.getByText('16:40 left at 1×');
  });

  // YouTube keeps a watch page's elements in the document after the viewer moves on.
  it.each([
    'https://www.youtube.com/',
    'https://www.youtube.com/feed/subscriptions',
    'https://www.youtube.com/playlist?list=PL0123456789',
    'https://www.youtube.com/shorts/aqz-KE-bpKQ',
    'https://www.youtube.com/embed/aqz-KE-bpKQ',
    'https://www.youtube.com/watch',
  ])('stays out of %s', async (url) => {
    const page = openSavedPage('watch-delhi', url);
    page.video.load({ duration: 1000 });

    await startChrono();

    expect(queryPanel()).toBeNull();
  });
});
