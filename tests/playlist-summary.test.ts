import { fireEvent } from '@testing-library/dom';
import { describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  countObservers,
  countPlaylistSummaries,
  queryPanel,
  queryPlaylistSummary,
  settle,
  startChrono,
} from './harness/chrono';
import { followPopupReportLink, openPopup } from './harness/popup';
import {
  finishNavigation,
  navigate,
  openSavedPage,
  renderSavedPage,
  setTabVisibility,
  startNavigation,
} from './harness/youtube';

const WATCH_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
const SHORTS_URL = 'https://www.youtube.com/shorts/A9Yn8Ad_cH8';

// Expected totals are the saved pages' entry lengths, summed by hand from the pages.
const LOCKUPS_URL = 'https://www.youtube.com/playlist?list=PL398E6B0278A8F204';
const LEGACY_LONG_URL = 'https://www.youtube.com/playlist?list=PL-jdGlB2ROPIlCx00C3A-o2K_KoAlWUmZ';
const LOCKUPS_LONG_URL = 'https://www.youtube.com/playlist?list=PLwuVHrNMAUxr5qc1LKX7BHHC5QJc2_5lm';
const OLD_HEADER_URL = 'https://www.youtube.com/playlist?list=PLu0W_9lII9agq5TrH9XLIKQvv0iaF2X3w';

/** The parts of YouTube's page that the popup's "Report it" says Chrono couldn't recognise. */
async function reportedFailures(): Promise<string[]> {
  return (await followPopupReportLink()).searchParams.get('failed')?.split(',') ?? [];
}

describe('Playlist summary', () => {
  it("shows a playlist's total content time and how many entries are unavailable", async () => {
    // 37 entries listed, 2:43:55 in all; the header says 39, and YouTube hides 2.
    openSavedPage('playlist-lockups', LOCKUPS_URL, { playerApi: false });
    await startChrono();

    expect(queryPlaylistSummary()).toBe('2h 44m total · 2 unavailable');
  });

  it('keeps counting an entry while the pointer is over it', async () => {
    openSavedPage('playlist-lockups', LOCKUPS_URL);
    await startChrono();

    // In Oct 2026 YouTube took the length badge off a lockup under the pointer.
    document.querySelector('ytd-browse yt-lockup-view-model yt-thumbnail-bottom-overlay-view-model')!.remove();
    await settle();

    expect(queryPlaylistSummary()).toBe('2h 44m total · 2 unavailable');
  });

  describe('at the viewer\'s speed', () => {
    it("adds the watch time at the viewer's YouTube speed, which YouTube's player on the page knows", async () => {
      // YouTube keeps its player in the page, hidden, and gives it the viewer's speed.
      const page = openSavedPage('playlist-lockups', LOCKUPS_URL);
      page.player.setSpeed(1.5);
      await startChrono();

      expect(queryPlaylistSummary()).toBe('2h 44m total · 1h 49m at 1.5× · 2 unavailable');
    });

    it('follows the speed when the viewer changes it', async () => {
      const page = openSavedPage('playlist-lockups', LOCKUPS_URL);
      await startChrono();

      page.player.setSpeed(2);
      await settle();

      expect(queryPlaylistSummary()).toBe('2h 44m total · 1h 22m at 2× · 2 unavailable');
    });

    it("leaves the watch time out at 1×, when it's the total", async () => {
      openSavedPage('playlist-lockups', LOCKUPS_URL);
      await startChrono();

      expect(queryPlaylistSummary()).toBe('2h 44m total · 2 unavailable');
    });
  });

  describe('of a playlist YouTube has loaded only part of', () => {
    it('says how many entries it counted, of how many', async () => {
      // The first 100 entries, 6:37:44 in all, of the 139 the header counts.
      openSavedPage('playlist-legacy-long', LEGACY_LONG_URL);
      await startChrono();

      expect(queryPlaylistSummary()).toBe('6h 38m total · first 100 of 139 counted');
    });

    it('counts more as YouTube loads them, and the unavailable entries once it has loaded them all', async () => {
      const page = openSavedPage('playlist-legacy-long', LEGACY_LONG_URL);
      await startChrono();

      // 20 more entries, 1:17:36 in all.
      page.loadMoreEntries('playlist-legacy-long-more', { count: 20 });
      await settle();
      expect(queryPlaylistSummary()).toBe('7h 55m total · first 120 of 139 counted');

      // The last 15. YouTube hides 4 unavailable entries, so its list ends at 135.
      page.loadMoreEntries('playlist-legacy-long-more', { last: true });
      await settle();
      expect(queryPlaylistSummary()).toBe('9h 45m total · 4 unavailable');
    });

    it('works the same with the list in lockups', async () => {
      // The first 100 entries, 7:00:23 in all, of the 163 the header counts.
      openSavedPage('playlist-lockups-long', LOCKUPS_LONG_URL);
      await startChrono();

      expect(queryPlaylistSummary()).toBe('7h total · first 100 of 163 counted');
    });

    it("counts more as YouTube loads them into lockups, and never YouTube's recommendations below", async () => {
      const page = openSavedPage('playlist-lockups-long', LOCKUPS_LONG_URL);
      await startChrono();

      // 20 more entries, 1:17:47 in all.
      page.loadMoreEntries('playlist-lockups-long-more', { count: 20 });
      await settle();
      expect(queryPlaylistSummary()).toBe('8h 18m total · first 120 of 163 counted');

      // The last 34, some of them long mixes, then a shelf of recommended playlists. YouTube
      // hides 9 unavailable entries, so its list ends at 154.
      page.loadMoreEntries('playlist-lockups-long-more', { last: true });
      await settle();
      expect(queryPlaylistSummary()).toBe('26h 39m total · 9 unavailable');
    });
  });

  describe('on Watch Later and Liked videos', () => {
    // TODO: these are public playlist pages opened at Watch Later's and Liked videos'
    // addresses, because a headless browser can't sign in and no signed-in pages have been
    // saved yet (deferred in Oct 2026). Replace them with real pages saved from a signed-in
    // browser.
    it('works on Watch Later', async () => {
      openSavedPage('playlist-legacy-long', 'https://www.youtube.com/playlist?list=WL');
      await startChrono();

      expect(queryPlaylistSummary()).toBe('6h 38m total · first 100 of 139 counted');
    });

    it('works on Liked videos', async () => {
      openSavedPage('playlist-lockups', 'https://www.youtube.com/playlist?list=LL');
      await startChrono();

      expect(queryPlaylistSummary()).toBe('2h 44m total · 2 unavailable');
    });
  });

  describe('through YouTube navigating without a reload', () => {
    it('appears when YouTube navigates to a playlist page', async () => {
      const page = openSavedPage('watch-delhi', WATCH_URL);
      page.video.load({ duration: 1000 });
      await startChrono();
      expect(queryPlaylistSummary()).toBeNull();

      await startNavigation(LOCKUPS_URL);
      renderSavedPage('playlist-lockups');
      await finishNavigation();

      expect(queryPlaylistSummary()).toBe('2h 44m total · 2 unavailable');
      expect(countPlaylistSummaries()).toBe(1);
      expect(queryPanel()).toBeNull();
    });

    it('goes when YouTube navigates away, though YouTube keeps the playlist page hidden', async () => {
      openSavedPage('playlist-lockups', LOCKUPS_URL);
      await startChrono();

      await startNavigation(WATCH_URL);
      document.querySelector('ytd-browse')!.setAttribute('hidden', '');
      await finishNavigation();

      expect(countPlaylistSummaries()).toBe(0);
    });

    it('shows the new playlist when YouTube navigates from one playlist page to another', async () => {
      openSavedPage('playlist-lockups', LOCKUPS_URL);
      await startChrono();

      await startNavigation(LEGACY_LONG_URL);
      renderSavedPage('playlist-legacy-long');
      await finishNavigation();

      expect(queryPlaylistSummary()).toBe('6h 38m total · first 100 of 139 counted');
      expect(countPlaylistSummaries()).toBe(1);
    });

    it('never shows more than one, through repeated navigation events', async () => {
      openSavedPage('playlist-lockups', LOCKUPS_URL);
      await startChrono();

      for (let i = 0; i < 3; i++) await navigate(LOCKUPS_URL);
      await navigate(WATCH_URL);
      await navigate(LOCKUPS_URL);

      expect(queryPlaylistSummary()).toBe('2h 44m total · 2 unavailable');
      expect(countPlaylistSummaries()).toBe(1);
    });

    it('stops watching the page once it has left it', async () => {
      openSavedPage('playlist-lockups', LOCKUPS_URL);
      await startChrono();

      await navigate(SHORTS_URL);
      renderSavedPage('shorts');
      await settle();

      expect(countObservers()).toBe(0);
    });
  });

  describe('when YouTube changes its playlist page', () => {
    it.each([
      ['stats', 'playlist-legacy-long', LEGACY_LONG_URL, 'ytd-browse yt-page-header-view-model yt-content-metadata-view-model [role="group"]'],
      ['list', 'playlist-legacy-long', LEGACY_LONG_URL, 'ytd-browse ytd-playlist-video-list-renderer'],
      ["older header's byline", 'playlist-old-header-long', OLD_HEADER_URL, 'ytd-browse ytd-playlist-byline-renderer'],
    ])('hides quietly without the %s it knows, and reports failed=summary', async (_, name, url, part) => {
      openSavedPage(name, url);
      for (const element of document.querySelectorAll(part)) element.remove();
      await startChrono();

      expect(countPlaylistSummaries()).toBe(0);
      expect(await reportedFailures()).toEqual(['summary']);
    });

    it('appears once YouTube renders what it knows, and stops reporting the failure', async () => {
      const page = openSavedPage('playlist-lockups', LOCKUPS_URL);
      // A tab opened in the background: YouTube hasn't rendered the list yet.
      const list = document.querySelector('ytd-browse yt-section-list-renderer')!;
      const restore = page.withhold(list);
      setTabVisibility('hidden');
      await startChrono();
      expect(countPlaylistSummaries()).toBe(0);

      restore();
      await settle();

      expect(queryPlaylistSummary()).toBe('2h 44m total · 2 unavailable');
      expect(await reportedFailures()).toEqual([]);
    });

    it("adds nothing to an empty playlist, and doesn't take it for a change", async () => {
      openSavedPage('playlist-lockups', LOCKUPS_URL);
      for (const entry of document.querySelectorAll('ytd-browse yt-item-section-renderer > #contents > *')) entry.remove();
      for (const part of document.querySelectorAll('ytd-browse yt-content-metadata-view-model span[role="text"]')) {
        if (part.textContent.includes('videos')) part.textContent = 'No videos';
      }
      await startChrono();

      expect(countPlaylistSummaries()).toBe(0);
      expect(await reportedFailures()).toEqual([]);
    });

    it('leaves the failure behind when it leaves the page', async () => {
      openSavedPage('playlist-legacy-long', LEGACY_LONG_URL);
      document.querySelector('ytd-browse ytd-playlist-video-list-renderer')!.remove();
      await startChrono();

      await navigate(SHORTS_URL);

      expect(await reportedFailures()).toEqual([]);
    });
  });

  describe('setting', () => {
    it('hides and shows the summary live, from the popup', async () => {
      openSavedPage('playlist-lockups', LOCKUPS_URL);
      await startChrono();
      const popup = await openPopup();
      const setting = popup.getByRole<HTMLInputElement>('checkbox', { name: 'Playlist summary' });
      expect(setting.checked).toBe(true);

      fireEvent.click(setting);
      await settle();
      expect(countPlaylistSummaries()).toBe(0);

      fireEvent.click(setting);
      await settle();
      expect(queryPlaylistSummary()).toBe('2h 44m total · 2 unavailable');
    });

    it('keeps playlist pages untouched when off', async () => {
      await fakeBrowser.storage.local.set({ 'settings.playlistSummary': false });
      openSavedPage('playlist-lockups', LOCKUPS_URL);
      await startChrono();

      expect(countPlaylistSummaries()).toBe(0);
      expect(countObservers()).toBe(0);
    });
  });

  it('never fetches anything from YouTube, and never scrolls the page', async () => {
    const network = [
      vi.spyOn(window, 'fetch'),
      vi.spyOn(XMLHttpRequest.prototype, 'open'),
      vi.spyOn(navigator, 'sendBeacon'),
    ];
    const scrolling = [
      vi.spyOn(window, 'scroll'),
      vi.spyOn(window, 'scrollTo'),
      vi.spyOn(window, 'scrollBy'),
      vi.spyOn(Element.prototype, 'scroll'),
      vi.spyOn(Element.prototype, 'scrollTo'),
      vi.spyOn(Element.prototype, 'scrollBy'),
      vi.spyOn(Element.prototype, 'scrollIntoView'),
      vi.spyOn(Element.prototype, 'scrollTop', 'set'),
    ];

    const page = openSavedPage('playlist-legacy-long', LEGACY_LONG_URL);
    await startChrono();
    page.loadMoreEntries('playlist-legacy-long-more', { last: true });
    page.setPlaylistLayout('narrow');
    await settle();

    expect(queryPlaylistSummary()).toBe('9h 45m total · 4 unavailable');
    for (const spy of [...network, ...scrolling]) expect(spy).not.toHaveBeenCalled();
  });

  describe("on a playlist with YouTube's older header", () => {
    // In Oct 2026 YouTube still served most playlists with its older header, whose byline
    // says e.g. "139 videos · Last updated on Nov 9, 2024". It is one header for every
    // window width.
    it('counts the entries its byline says, and adds the line under the byline', async () => {
      const page = openSavedPage('playlist-old-header-long', OLD_HEADER_URL, { playerApi: false });
      await startChrono();

      expect(queryPlaylistSummary()).toBe('33h 25m total · first 100 of 139 counted');
      expect(document.querySelector('ytd-playlist-byline-renderer [role="note"]')).not.toBeNull();

      page.setPlaylistLayout('narrow');
      await settle();

      expect(queryPlaylistSummary()).toBe('33h 25m total · first 100 of 139 counted');
      expect(countPlaylistSummaries()).toBe(1);
    });
  });

  describe('while YouTube plays one of its entries', () => {
    // Back on a playlist page while its miniplayer played one of the playlist's videos,
    // YouTube showed "Now playing" on that lockup in place of its length (4:07 here) in
    // Oct 2026, and said the length only in words, for screen readers.
    const PLAYING_URL = 'https://www.youtube.com/watch?v=dY7PmX6Oz58&list=PL398E6B0278A8F204&index=1';

    it('counts the playing entry at the length YouTube showed for it before', async () => {
      openSavedPage('playlist-lockups', LOCKUPS_URL, { playerApi: false });
      await startChrono();

      await startNavigation(PLAYING_URL);
      document.querySelector('ytd-browse')!.setAttribute('hidden', '');
      await finishNavigation();
      await startNavigation(LOCKUPS_URL);
      renderSavedPage('playlist-lockups-now-playing', { playerApi: false });
      await finishNavigation();

      expect(queryPlaylistSummary()).toBe('2h 44m total · 2 unavailable');
    });

    it("doesn't count it as unavailable when it never showed its length, and says the total leaves it out", async () => {
      openSavedPage('playlist-lockups-now-playing', LOCKUPS_URL);
      await startChrono();

      expect(queryPlaylistSummary()).toBe('2h 40m total · 2 unavailable · 38 of 39 counted');
      expect(await reportedFailures()).not.toContain('summary');
    });

    it("doesn't report YouTube's speed as unrecognised while the miniplayer holds YouTube's player", async () => {
      // The player's speed API is the one Chrono knows; it's only outside the watch page.
      openSavedPage('playlist-lockups-now-playing', LOCKUPS_URL);
      await startChrono();

      expect(await reportedFailures()).toEqual([]);
    });
  });

  describe("on a page that mixes YouTube's old and new elements", () => {
    // Each saved page has the stats three times: in the new header's copy for each layout, and
    // in the old header YouTube keeps hidden. It also has YouTube's hidden watch page, with
    // its own lockups.
    it('counts every entry, and the stats, once', async () => {
      openSavedPage('playlist-legacy-long', LEGACY_LONG_URL);
      await startChrono();

      expect(queryPlaylistSummary()).toBe('6h 38m total · first 100 of 139 counted');
      expect(countPlaylistSummaries()).toBe(1);
    });

    it("moves to the header YouTube shows when the window's width changes its layout", async () => {
      const page = openSavedPage('playlist-lockups', LOCKUPS_URL);
      await startChrono();

      page.setPlaylistLayout('narrow');
      await settle();

      expect(queryPlaylistSummary()).toBe('2h 44m total · 2 unavailable');
      expect(countPlaylistSummaries()).toBe(1);

      page.setPlaylistLayout('wide');
      await settle();

      expect(queryPlaylistSummary()).toBe('2h 44m total · 2 unavailable');
      expect(countPlaylistSummaries()).toBe(1);
    });
  });
});
