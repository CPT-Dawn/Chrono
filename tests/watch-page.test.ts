import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryPanel, settle, startChrono } from './harness/chrono';
import { openSavedPage, type SavedPage } from './harness/youtube';

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

  it('moves below the video with the sidebar in a narrow window, and back again', async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL);
    page.video.load({ duration: 1000 });
    await startChrono();
    const panel = queryPanel()!;

    page.setLayout('one-column');
    await settle();

    expectBelowVideo(page, panel.element);

    page.setLayout('two-columns');
    await settle();

    expect(page.sidebar.firstElementChild).toBe(panel.element);
  });

  it('appears below the video on a page that opens in a narrow window', async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL);
    page.video.load({ duration: 1000 });
    page.setLayout('one-column');

    await startChrono();

    const panel = queryPanel()!;
    expectBelowVideo(page, panel.element);
  });

  it("goes at the top of the sidebar when YouTube renders none of the sidebar's usual blocks", async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL);
    page.video.load({ duration: 1000 });
    for (const block of page.sidebar.querySelectorAll(':scope > :is(#panels, #playlist)')) block.remove();

    await startChrono();

    expect(page.sidebar.firstElementChild).toBe(queryPanel()!.element);
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

/** The Panel sits between the video and the related videos, outside the sidebar column YouTube hides. */
function expectBelowVideo(page: SavedPage, panel: Element): void {
  expect(page.sidebar.contains(panel)).toBe(false);
  expect(isBefore(page.video.element, panel)).toBe(true);
  expect(isBefore(panel, page.related)).toBe(true);
}

function isBefore(a: Node, b: Node): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}
