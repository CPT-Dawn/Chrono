import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countObservers,
  countPanels,
  invalidateExtensionContext,
  queryPanel,
  settle,
  startChrono,
} from './harness/chrono';
import {
  finishNavigation,
  navigate,
  openSavedPage,
  renderSavedPage,
  setTabVisibility,
  startNavigation,
} from './harness/youtube';

const WATCH_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
const NEXT_WATCH_URL = 'https://www.youtube.com/watch?v=YE7VzlLtp-4';
const HOME_URL = 'https://www.youtube.com/';
const SHORTS_URL = 'https://www.youtube.com/shorts/A9Yn8Ad_cH8';
const EMBED_URL = 'https://www.youtube.com/embed/aqz-KE-bpKQ';

/** The Panel is up, but shows no remaining or finish time. */
function expectNoTimes(): void {
  expect(queryPanel()!.queryAllByText(/left at|ends/)).toHaveLength(0);
}

describe('Watch-page lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 17, 15, 0, 0) });
  });

  it('appears in a background tab once the viewer switches to it', async () => {
    setTabVisibility('hidden');
    const page = openSavedPage('watch-delhi', WATCH_URL);
    const renderVideo = page.withhold(page.video.element);
    const renderSidebar = page.withhold(page.sidebar);
    await startChrono();

    // YouTube can take any amount of time in a background tab, and Chrono has no
    // timeout to run out.
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(30 * 60_000);
    renderVideo();
    renderSidebar();
    page.video.load({ duration: 1000 });
    await settle();
    expect(queryPanel()).toBeNull();

    setTabVisibility('visible');
    await settle();
    queryPanel()!.getByText('16:40 left at 1×');
  });

  // YouTube serves live streams and their recordings at /live/<id>, and in Oct 2026 it
  // showed any video there, on its usual watch page, without changing the address.
  it('appears on a watch page at a /live/ address', async () => {
    const page = openSavedPage('watch-delhi', 'https://www.youtube.com/live/aqz-KE-bpKQ');
    page.video.load({ duration: 1000 });

    await startChrono();

    queryPanel()!.getByText('16:40 left at 1×');
  });

  // The Shorts page also has YouTube's hidden watch page in it, player and sidebar and all.
  it.each([
    ['shorts', SHORTS_URL],
    ['embed', EMBED_URL],
  ])('leaves a saved %s page exactly as YouTube rendered it', async (name, url) => {
    openSavedPage(name, url);
    const rendered = document.documentElement.outerHTML;

    await startChrono();
    vi.advanceTimersByTime(60_000);

    expect(document.documentElement.outerHTML).toBe(rendered);
  });

  it('follows YouTube when it swaps the video element for a new one', async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL);
    page.video.load({ duration: 1000 });
    page.video.seek(250);
    await startChrono();

    const replaced = page.video;
    page.replaceVideo();
    page.video.load({ duration: 1000 });
    page.video.seek(400);
    await settle();
    queryPanel()!.getByText('10:00 left at 1×');

    page.video.play();
    vi.advanceTimersByTime(60_000);
    queryPanel()!.getByText('9:00 left at 1×');
    expect(replaced.listenerCount).toBe(0);
  });

  it('steps aside while YouTube has no video on the watch page', async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL);
    page.video.load({ duration: 1000 });
    await startChrono();

    const putBack = page.withhold(page.video.element);
    await settle();
    expect(countPanels()).toBe(0);
    expect(page.video.listenerCount).toBe(0);

    putBack();
    await settle();
    queryPanel()!.getByText('16:40 left at 1×');
  });

  describe('the clock that moves the finish time on', () => {
    it('ticks at most once a second, however the viewer gets to the page', async () => {
      const page = openSavedPage('watch-delhi', WATCH_URL);
      page.video.load({ duration: 1000 });
      await startChrono();
      await navigate(HOME_URL);
      await navigate(WATCH_URL);
      setTabVisibility('hidden');
      setTabVisibility('visible');
      await navigate(`${WATCH_URL}&t=30s`);

      // The video is paused, so every timer is Chrono's.
      for (let i = 0; i < 5; i++) {
        const before = Date.now();
        vi.advanceTimersToNextTimer();
        expect(Date.now() - before).toBeGreaterThanOrEqual(1000);
      }
    });

    it('stops in a hidden tab, and catches up when the viewer comes back', async () => {
      const page = openSavedPage('watch-delhi', WATCH_URL);
      page.video.load({ duration: 1000 });
      page.video.seek(250);
      await startChrono();

      setTabVisibility('hidden');
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(5 * 60_000);

      setTabVisibility('visible');
      queryPanel()!.getByText('ends 3:17 PM');
    });
  });

  describe('when YouTube navigates to another video without a reload', () => {
    it("shows the next video's remaining once YouTube renders its page", async () => {
      const first = openSavedPage('watch-delhi', WATCH_URL);
      first.video.load({ duration: 1000 });
      first.video.seek(250);
      await startChrono();

      await startNavigation(NEXT_WATCH_URL);
      const next = renderSavedPage('watch-delhi');
      await finishNavigation();
      expectNoTimes();

      next.video.load({ duration: 2000 });
      queryPanel()!.getByText('33:20 left at 1×');
    });

    // What YouTube did in Chrome and Firefox in Oct 2026: it changed the address first,
    // and loaded the next video into the same element about half a second later.
    it("never shows the previous video's times while the next one loads", async () => {
      const page = openSavedPage('watch-delhi', WATCH_URL);
      page.video.load({ duration: 1000 });
      page.video.seek(250);
      page.video.play();
      await startChrono();

      await startNavigation(NEXT_WATCH_URL);
      expectNoTimes();
      vi.advanceTimersByTime(500);
      expectNoTimes();

      page.video.startLoading();
      page.video.load({ duration: 2000 });
      await finishNavigation();
      queryPanel()!.getByText('33:20 left at 1×');
    });

    // Firefox showed this in Oct 2026: with no event when the address changes, a paused
    // video's times stayed up until Chrono's next tick.
    it("clears the previous video's times as soon as YouTube starts navigating", async () => {
      const page = openSavedPage('watch-delhi', WATCH_URL);
      page.video.load({ duration: 1000 });
      await startChrono();

      await startNavigation(NEXT_WATCH_URL);

      expectNoTimes();
    });

    it('shows nothing, however long the next video takes to load', async () => {
      const page = openSavedPage('watch-delhi', WATCH_URL);
      page.video.load({ duration: 1000 });
      page.video.play();
      await startChrono();

      await navigate(NEXT_WATCH_URL);
      vi.advanceTimersByTime(60_000);
      expectNoTimes();

      page.video.startLoading();
      page.video.load({ duration: 2000 });
      queryPanel()!.getByText('33:20 left at 1×');
    });

    it('keeps showing the times when the address changes but the video stays', async () => {
      const page = openSavedPage('watch-delhi', WATCH_URL);
      page.video.load({ duration: 1000 });
      page.video.seek(250);
      await startChrono();

      await navigate(`${WATCH_URL}&list=PL0123456789`);

      queryPanel()!.getByText('12:30 left at 1×');
    });
  });

  describe('keeps exactly one Panel', () => {
    it('through repeated navigation events', async () => {
      const page = openSavedPage('watch-delhi', WATCH_URL);
      page.video.load({ duration: 1000 });
      await startChrono();

      for (let i = 0; i < 3; i++) await navigate(WATCH_URL);
      await navigate(NEXT_WATCH_URL);
      for (let i = 0; i < 3; i++) await finishNavigation();

      expect(countPanels()).toBe(1);
    });

    it('when the browser starts the content script again', async () => {
      const page = openSavedPage('watch-delhi', WATCH_URL);
      page.video.load({ duration: 1000 });
      await startChrono();

      await startChrono();

      expect(countPanels()).toBe(1);
      queryPanel()!.getByText('16:40 left at 1×');
    });

    it('and takes it away when the extension is updated or removed', async () => {
      const page = openSavedPage('watch-delhi', WATCH_URL);
      page.video.load({ duration: 1000 });
      await startChrono();

      invalidateExtensionContext();
      vi.advanceTimersByTime(1000);

      expect(countPanels()).toBe(0);
      expect(page.video.listenerCount).toBe(0);
      expect(countObservers()).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('when the viewer leaves the watch page', () => {
    // YouTube keeps the watch page in the document, hidden, after the viewer moves on.
    it.each([HOME_URL, SHORTS_URL])('removes the Panel and stops all its work on %s', async (url) => {
      const page = openSavedPage('watch-delhi', WATCH_URL);
      page.video.load({ duration: 1000 });
      await startChrono();

      await navigate(url);

      expect(countPanels()).toBe(0);
      expect(page.video.listenerCount).toBe(0);
      expect(countObservers()).toBe(0);
      // The video is paused, so any timer left would be Chrono's.
      expect(vi.getTimerCount()).toBe(0);
    });

    it('stays out of the miniplayer, and comes back when the viewer expands it', async () => {
      const page = openSavedPage('watch-delhi', WATCH_URL);
      page.video.load({ duration: 1000 });
      page.video.seek(250);
      page.video.play();
      await startChrono();

      await startNavigation(HOME_URL);
      page.movePlayer('miniplayer');
      await finishNavigation();
      vi.advanceTimersByTime(60_000);
      expect(countPanels()).toBe(0);

      await startNavigation(WATCH_URL);
      page.movePlayer('watch-page');
      await finishNavigation();
      queryPanel()!.getByText('11:30 left at 1×');
    });

    it("doesn't show the previous video's times on the next watch page the viewer opens", async () => {
      const page = openSavedPage('watch-delhi', WATCH_URL);
      page.video.load({ duration: 1000 });
      page.video.seek(250);
      await startChrono();
      await navigate(HOME_URL);

      await navigate(NEXT_WATCH_URL);
      expectNoTimes();

      page.video.startLoading();
      page.video.load({ duration: 2000 });
      queryPanel()!.getByText('33:20 left at 1×');
    });
  });
});
