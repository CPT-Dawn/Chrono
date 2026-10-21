import { fireEvent, within } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  invalidateExtensionContext,
  queryPanel,
  queryPlayerBadge,
  reportedFailures,
  settle,
  startChrono,
  withoutPlayerBadge,
} from './harness/chrono';
import { openPopup } from './harness/popup';
import { finishNavigation, navigate, openSavedPage, renderSavedPage, startNavigation } from './harness/youtube';

const WATCH_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
const NEXT_WATCH_URL = 'https://www.youtube.com/watch?v=YE7VzlLtp-4';
const LIVE_URL = 'https://www.youtube.com/watch?v=56llPN9tS88';
const UPCOMING_URL = 'https://www.youtube.com/watch?v=UleiRdWFG7o';
const AD_URL = 'https://www.youtube.com/watch?v=XCtYg1Hj3YI&list=PLxCzCOWd7aiEbY0sZVAi7zxvI7zBhBqZb';

/** The two players YouTube served in Oct 2026: the legacy one and the redesigned (Delhi) one. */
const PLAYERS = [
  ['legacy', 'watch-legacy'],
  ['Delhi', 'watch-delhi'],
] as const;

describe('Player badge', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 17, 15, 0, 0) });
  });

  describe.each(PLAYERS)('on the %s player', (_, savedPage) => {
    it("shows the video's finish time next to YouTube's time display", async () => {
      const page = openSavedPage(savedPage, WATCH_URL);
      page.video.load({ duration: 1000 });
      page.video.seek(250);

      await startChrono();

      expect(queryPlayerBadge()).toBe('· ends 3:12 PM');
    });

    it('moves the finish time with the speed', async () => {
      const page = openSavedPage(savedPage, WATCH_URL);
      page.video.load({ duration: 1000 });
      page.video.seek(250);
      await startChrono();

      page.player.setSpeed(1.5);

      // 750 s of content at 1.5× takes 500 s.
      expect(queryPlayerBadge()).toBe('· ends 3:08 PM');
    });

    it('moves the finish time with the position', async () => {
      const page = openSavedPage(savedPage, WATCH_URL);
      page.video.load({ duration: 1000 });
      page.video.seek(250);
      await startChrono();

      page.video.seek(850);

      expect(queryPlayerBadge()).toBe('· ends 3:02 PM');
    });

    it('keeps the finish time while the video plays, and moves it on while it is paused', async () => {
      const page = openSavedPage(savedPage, WATCH_URL);
      page.video.load({ duration: 1000 });
      page.video.seek(250);
      await startChrono();

      page.video.play();
      vi.advanceTimersByTime(60_000);
      expect(queryPlayerBadge()).toBe('· ends 3:12 PM');

      page.video.pause();
      vi.advanceTimersByTime(5 * 60_000);
      expect(queryPlayerBadge()).toBe('· ends 3:17 PM');
    });

    it("changes nothing in YouTube's time display but adding the badge", async () => {
      const page = openSavedPage(savedPage, WATCH_URL);
      const rendered = page.timeDisplay.outerHTML;
      page.video.load({ duration: 1000 });
      await startChrono();
      page.video.play();
      vi.advanceTimersByTime(60_000);

      expect(queryPlayerBadge()).not.toBeNull();
      expect(withoutPlayerBadge(page.timeDisplay)).toBe(rendered);
      expect(await reportedFailures()).not.toContain('badge');
    });
  });

  describe("when the player's layout isn't recognised", () => {
    it.each<[string, string, (timeDisplay: Element) => void]>([
      [
        'the times are no longer in their wrapper',
        'watch-legacy',
        (timeDisplay) => timeDisplay.querySelector('.ytp-time-wrapper')!.classList.replace('ytp-time-wrapper', 'ytp-time-box'),
      ],
      [
        'the time display has no duration',
        'watch-delhi',
        (timeDisplay) => timeDisplay.querySelector('.ytp-time-duration')!.remove(),
      ],
      [
        'the times are written straight into the wrapper',
        'watch-delhi',
        (timeDisplay) => {
          const contents = timeDisplay.querySelector('.ytp-time-contents')!;
          contents.replaceWith(...contents.childNodes);
        },
      ],
      [
        'the time display has no separator',
        'watch-legacy',
        (timeDisplay) => timeDisplay.querySelector('.ytp-time-separator')!.remove(),
      ],
    ])("shows no badge, leaves YouTube's time display untouched, and reports failed=badge when %s", async (_, savedPage, change) => {
      const page = openSavedPage(savedPage, WATCH_URL);
      change(page.timeDisplay);
      const rendered = page.timeDisplay.outerHTML;
      page.video.load({ duration: 1000 });
      page.video.seek(250);
      await startChrono();
      page.video.play();
      vi.advanceTimersByTime(60_000);

      expect(queryPlayerBadge()).toBeNull();
      expect(page.timeDisplay.outerHTML).toBe(rendered);
      expect(await reportedFailures()).toContain('badge');
      // The rest of Chrono keeps working.
      queryPanel()!.getByText('11:30 left at 1×');
    });

    it("takes the badge away when YouTube changes the player's layout under it", async () => {
      const page = openSavedPage('watch-delhi', WATCH_URL);
      page.video.load({ duration: 1000 });
      await startChrono();
      expect(queryPlayerBadge()).not.toBeNull();

      // YouTube renders its times in a box Chrono doesn't know.
      page.timeDisplay.querySelector('.ytp-time-wrapper')!.classList.replace('ytp-time-wrapper', 'ytp-time-box');
      page.timeDisplay.querySelector('.ytp-time-duration')!.textContent = '16:40';
      await settle();

      expect(queryPlayerBadge()).toBeNull();
      expect(await reportedFailures()).toContain('badge');
    });
  });

  describe('during an ad break', () => {
    it('hides while the ad plays', async () => {
      // A 20 s pre-roll, saved during a real ad break.
      const page = openSavedPage('watch-ad', AD_URL);
      page.video.load({ duration: 20 });
      page.video.play();
      await startChrono();
      vi.advanceTimersByTime(5000);

      expect(queryPlayerBadge()).toBeNull();
    });

    it('hides as an ad break starts in the middle of the video, and comes back when it ends', async () => {
      const page = openSavedPage('watch-delhi', WATCH_URL);
      page.video.load({ duration: 1000 });
      page.video.seek(250);
      await startChrono();
      expect(queryPlayerBadge()).toBe('· ends 3:12 PM');

      page.startAdBreak();
      await settle();
      expect(queryPlayerBadge()).toBeNull();
      page.video.startLoading();
      page.video.load({ duration: 30 });
      page.video.play();
      vi.advanceTimersByTime(30_000);
      expect(queryPlayerBadge()).toBeNull();

      page.endAdBreak();
      page.video.startLoading();
      page.video.load({ duration: 1000 });
      page.video.seek(250);
      await settle();
      // The ad took 30 seconds, so the video now ends 30 seconds later.
      expect(queryPlayerBadge()).toBe('· ends 3:13 PM');
    });
  });

  describe('on live content', () => {
    it('hides on a live stream', async () => {
      const page = openSavedPage('watch-live', LIVE_URL);
      page.video.load({ duration: 50_400 });
      page.video.seek(50_390);
      page.video.play();
      await startChrono();
      vi.advanceTimersByTime(5000);

      expect(queryPlayerBadge()).toBeNull();
      // Hidden because the stream is live, not because the player wasn't recognised.
      expect(await reportedFailures()).not.toContain('badge');
    });

    it('hides before a scheduled stream or premiere starts', async () => {
      openSavedPage('watch-upcoming', UPCOMING_URL);
      await startChrono();

      expect(queryPlayerBadge()).toBeNull();
      expect(await reportedFailures()).not.toContain('badge');
    });

    it('comes back when YouTube turns a live stream into a video', async () => {
      // As when a premiere ends: YouTube drops the live flag from the time display.
      const page = openSavedPage('watch-live', LIVE_URL);
      page.video.load({ duration: 1000 });
      page.video.seek(250);
      await startChrono();
      expect(queryPlayerBadge()).toBeNull();

      page.timeDisplay.classList.remove('ytp-live');
      await settle();

      expect(queryPlayerBadge()).toBe('· ends 3:12 PM');
    });

    it('hides for a video with no end', async () => {
      const page = openSavedPage('watch-delhi', WATCH_URL);
      page.video.load({ duration: Infinity });
      await startChrono();

      expect(queryPlayerBadge()).toBeNull();
    });

    it('comes back when YouTube moves from a live stream to a video', async () => {
      const live = openSavedPage('watch-live', LIVE_URL);
      live.video.load({ duration: 50_400 });
      await startChrono();

      await startNavigation(WATCH_URL);
      const page = renderSavedPage('watch-legacy');
      await finishNavigation();
      page.video.load({ duration: 1000 });
      page.video.seek(250);
      await settle();

      expect(queryPlayerBadge()).toBe('· ends 3:12 PM');
    });
  });

  describe('Clock format', () => {
    it("follows a 24-hour locale's convention on Automatic", async () => {
      vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-GB');
      await openWatchPage();

      expect(queryPlayerBadge()).toBe('· ends 15:12');
    });

    it('changes at once when the viewer picks another clock format in the popup', async () => {
      await openWatchPage();
      const popup = await openPopup();

      fireEvent.click(popup.getByRole('radio', { name: '24-hour' }));
      await settle();
      expect(queryPlayerBadge()).toBe('· ends 15:12');

      fireEvent.click(popup.getByRole('radio', { name: '12-hour' }));
      await settle();
      expect(queryPlayerBadge()).toBe('· ends 3:12 PM');
    });
  });

  describe('the "Player badge" setting', () => {
    it('is on at first', async () => {
      await openWatchPage();
      const popup = await openPopup();

      expect(popup.getByRole<HTMLInputElement>('checkbox', { name: 'Player badge' }).checked).toBe(true);
    });

    it("turned off in the popup, takes the badge away at once and leaves YouTube's time display as it was", async () => {
      const page = openSavedPage('watch-delhi', WATCH_URL);
      const rendered = page.timeDisplay.outerHTML;
      page.video.load({ duration: 1000 });
      page.video.seek(250);
      await startChrono();
      const popup = await openPopup();

      fireEvent.click(popup.getByRole('checkbox', { name: 'Player badge' }));
      await settle();

      expect(queryPlayerBadge()).toBeNull();
      expect(page.timeDisplay.outerHTML).toBe(rendered);
      // The Panel stays.
      queryPanel()!.getByText('12:30 left at 1×');
    });

    it('turned back on in the ⋮ menu, brings the badge back at once', async () => {
      await turnOffBadgeInPopup();
      const { panel } = await openWatchPage();
      expect(queryPlayerBadge()).toBeNull();

      fireEvent.click(panel.getByRole('button', { name: 'More actions' }));
      const menu = within(panel.getByRole('menu', { name: 'More actions' }));
      const item = menu.getByRole('menuitemcheckbox', { name: 'Player badge' });
      expect(item.getAttribute('aria-checked')).toBe('false');
      fireEvent.click(item);
      await settle();

      expect(queryPlayerBadge()).toBe('· ends 3:12 PM');
      expect(item.getAttribute('aria-checked')).toBe('true');
    });

    it('stays off on the next watch page', async () => {
      await turnOffBadgeInPopup();
      const page = await openWatchPage();

      await navigate(NEXT_WATCH_URL);
      page.page.video.startLoading();
      page.page.video.load({ duration: 1000 });
      await settle();

      queryPanel()!.getByText('16:40 left at 1×');
      expect(queryPlayerBadge()).toBeNull();
    });

    it("doesn't stop the badge reporting failed=badge on a layout it doesn't recognise", async () => {
      await turnOffBadgeInPopup();
      const page = openSavedPage('watch-delhi', WATCH_URL);
      page.timeDisplay.querySelector('.ytp-time-duration')!.remove();
      page.video.load({ duration: 1000 });
      await startChrono();

      expect(await reportedFailures()).toContain('badge');
    });
  });

  describe('as the viewer moves around YouTube', () => {
    it("never shows the previous video's finish time while the next one loads", async () => {
      const { page } = await openWatchPage();

      await startNavigation(NEXT_WATCH_URL);
      expect(queryPlayerBadge()).toBeNull();
      await finishNavigation();
      expect(queryPlayerBadge()).toBeNull();

      page.video.startLoading();
      page.video.load({ duration: 2000 });
      await settle();
      expect(queryPlayerBadge()).toBe('· ends 3:33 PM');
    });

    it('takes the badge out of the player when it moves to the miniplayer, and puts it back after', async () => {
      const { page } = await openWatchPage();
      const rendered = withoutPlayerBadge(page.timeDisplay);

      await startNavigation('https://www.youtube.com/');
      page.movePlayer('miniplayer');
      await finishNavigation();
      expect(document.querySelector('ytd-miniplayer .ytp-time-display')!.outerHTML).toBe(rendered);

      await startNavigation(WATCH_URL);
      page.movePlayer('watch-page');
      await finishNavigation();
      expect(queryPlayerBadge()).toBe('· ends 3:12 PM');
    });

    it('takes the badge away when the extension is updated or removed', async () => {
      const { page } = await openWatchPage();
      const rendered = withoutPlayerBadge(page.timeDisplay);

      invalidateExtensionContext();
      vi.advanceTimersByTime(1000);

      expect(page.timeDisplay.outerHTML).toBe(rendered);
    });
  });

  it('keeps showing when the sidebar isn\'t recognised and the Panel steps aside', async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL);
    page.withhold(page.sidebar);
    page.video.load({ duration: 1000 });
    page.video.seek(250);

    await startChrono();

    expect(queryPanel()).toBeNull();
    expect(queryPlayerBadge()).toBe('· ends 3:12 PM');
  });
});

/** Opens a video on the Delhi player at 4:10 of 16:40. */
async function openWatchPage() {
  const page = openSavedPage('watch-delhi', WATCH_URL);
  page.video.load({ duration: 1000 });
  page.video.seek(250);
  await startChrono();
  return { page, panel: queryPanel()! };
}

/** The viewer turns the Player badge off in the toolbar popup. */
async function turnOffBadgeInPopup(): Promise<void> {
  const popup = await openPopup();
  fireEvent.click(popup.getByRole('checkbox', { name: 'Player badge' }));
  await settle();
}
