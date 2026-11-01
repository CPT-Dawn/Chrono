import { fireEvent, within } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryPanel, queryPlayerBadge, reportedFailures, settle, startChrono, withoutPlayerBadge } from './harness/chrono';
import { finishNavigation, openSavedPage, renderSavedPage, startNavigation } from './harness/youtube';

const WATCH_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
/**
 * The real ad break in watch-ad.html: a 15 s ad before the first video, 18:04 long, of a
 * 140-entry playlist.
 */
const AD_URL = 'https://www.youtube.com/watch?v=kBdlM6hNDAE&list=PLxCzCOWd7aiFAN6I8CuViBuCdJgiOkT2Y';
const AD_LENGTH = 15;
const VIDEO_LENGTH = 1084;

const LIVE_URL = 'https://www.youtube.com/watch?v=56llPN9tS88';
const UPCOMING_URL = 'https://www.youtube.com/watch?v=UleiRdWFG7o';

/** The Panel is up, but shows no remaining or finish time. */
function expectNoTimes(): void {
  expect(queryPanel()!.queryAllByText(/left at|ends/)).toHaveLength(0);
}

/**
 * The 8 chapters YouTube fills watch-ad.html's video in with once the ad has ended. The page
 * was saved during the ad, so it holds the chapter list only as an empty shell, and the
 * progress bar has the ad's one segment. Titles are placeholders.
 */
const AD_VIDEO_CHAPTERS = [0, 95, 210, 360, 500, 640, 800, 950].map((start, i) => ({
  title: `Part ${i + 1}`,
  start,
}));

describe('Ad breaks', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 17, 15, 0, 0) });
  });

  it('shows "Paused for ad", and no remaining or finish time for the ad itself', async () => {
    // YouTube plays the ad in the watch page's own video element.
    const page = openSavedPage('watch-ad', AD_URL);
    page.video.load({ duration: AD_LENGTH });
    page.video.play();
    await startChrono();

    vi.advanceTimersByTime(5000);

    queryPanel()!.getByText('Paused for ad');
    expectNoTimes();
    expect(await reportedFailures()).toEqual([]);
  });

  it('resumes with the video\'s times when the ad ends', async () => {
    const page = openSavedPage('watch-ad', AD_URL);
    page.video.load({ duration: AD_LENGTH });
    page.video.play();
    await startChrono();
    vi.advanceTimersByTime(AD_LENGTH * 1000);

    // After the ad, YouTube loads the video into the same element.
    page.endAdBreak();
    page.loadChapters(AD_VIDEO_CHAPTERS);
    page.video.startLoading();
    page.video.load({ duration: VIDEO_LENGTH });
    page.video.seek(250);
    await settle();

    const panel = queryPanel()!;
    expect(panel.queryByText('Paused for ad')).toBeNull();
    // 834 s left from 3:00:15 PM.
    panel.getByText('13:54 left');
    panel.getByText('Ends 3:14 PM · at 1×');
    expect(await reportedFailures()).toEqual([]);
  });

  it('reports nothing as failed while YouTube has yet to fill in the chapters after the ad', async () => {
    const page = openSavedPage('watch-ad', AD_URL);
    page.video.load({ duration: AD_LENGTH });
    page.video.play();
    await startChrono();
    fireEvent.click(queryPanel()!.getByRole('button', { name: 'Details' }));
    vi.advanceTimersByTime(AD_LENGTH * 1000);

    // The video loads first, with the chapter list still the ad's empty shell.
    page.endAdBreak();
    page.video.startLoading();
    page.video.load({ duration: VIDEO_LENGTH });
    page.video.seek(250);
    await settle();
    expect(queryPanel()!.queryByRole('group', { name: 'Chapter' })).toBeNull();
    expect(await reportedFailures()).toEqual([]);

    page.loadChapters(AD_VIDEO_CHAPTERS);
    page.video.seek(251);
    await settle();
    within(queryPanel()!.getByRole('group', { name: 'Chapter' })).getByText('Part 3');
    expect(await reportedFailures()).toEqual([]);
  });

  it("leaves YouTube's time display, which shows the ad's own times, as it was", async () => {
    const page = openSavedPage('watch-ad', AD_URL);
    const asSaved = page.timeDisplay.outerHTML;
    page.video.load({ duration: AD_LENGTH });
    page.video.seek(3);
    page.video.play();
    await startChrono();

    vi.advanceTimersByTime(5000);
    await settle();

    expect(page.timeDisplay.querySelector('.ytp-time-contents')!.textContent!.replace(/\s+/g, '')).toBe('0:03/0:15');
    // The Player badge waits, hidden, for the video's times.
    expect(queryPlayerBadge()).toBeNull();
    expect(withoutPlayerBadge(page.timeDisplay)).toBe(asSaved);
  });

  it('shows no Playlist scope times during the ad, and brings them back after it', async () => {
    const page = openSavedPage('watch-ad', AD_URL);
    page.video.load({ duration: AD_LENGTH });
    page.video.play();
    await startChrono();
    fireEvent.click(queryPanel()!.getByRole('button', { name: 'Details' }));

    vi.advanceTimersByTime(5000);
    await settle();
    expectNoTimes();

    vi.advanceTimersByTime((AD_LENGTH - 5) * 1000);
    page.endAdBreak();
    page.loadChapters(AD_VIDEO_CHAPTERS);
    page.video.startLoading();
    page.video.load({ duration: VIDEO_LENGTH });
    page.video.seek(250);
    await settle();

    // 834 s left of entry 1, then entries 2–140: 89,848 s as their badges say.
    const playlist = within(queryPanel()!.getByRole('group', { name: 'Playlist' }));
    playlist.getByText('25:11:22 left');
    // 250 s is in the third chapter, which ends at 360 s.
    const chapter = within(queryPanel()!.getByRole('group', { name: 'Chapter' }));
    chapter.getByText('Part 3');
    chapter.getByText('1:50 left');
    expect(await reportedFailures()).toEqual([]);
  });

  it("stays at the top of the sidebar, above YouTube's own ad slot", async () => {
    const page = openSavedPage('watch-ad', AD_URL);
    page.video.load({ duration: AD_LENGTH });
    page.video.play();
    await startChrono();
    const panel = queryPanel()!;
    expect(page.sidebar.querySelector('#related > #player-ads')).not.toBeNull();
    expect(page.sidebar.firstElementChild).toBe(panel.element);

    vi.advanceTimersByTime(AD_LENGTH * 1000);
    page.endAdBreak();
    page.video.startLoading();
    page.video.load({ duration: VIDEO_LENGTH });
    await settle();

    expect(page.sidebar.firstElementChild).toBe(queryPanel()!.element);
  });

  it('pauses for an ad in the middle of the video, and picks up where the video left off', async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL);
    page.video.load({ duration: 1000 });
    page.video.seek(250);
    await startChrono();

    page.startAdBreak();
    page.video.startLoading();
    page.video.load({ duration: 30 });
    page.video.play();
    await settle();
    queryPanel()!.getByText('Paused for ad');
    vi.advanceTimersByTime(30_000);
    expectNoTimes();

    page.endAdBreak();
    page.video.startLoading();
    page.video.load({ duration: 1000 });
    page.video.seek(250);
    await settle();

    const panel = queryPanel()!;
    expect(panel.queryByText('Paused for ad')).toBeNull();
    panel.getByText('12:30 left');
    // The ad took 30 seconds, so the video now ends 30 seconds later.
    panel.getByText('Ends 3:13 PM · at 1×');
  });

  it('pauses as soon as YouTube starts the ad break, before the ad loads', async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL);
    page.video.load({ duration: 1000 });
    await startChrono();

    page.startAdBreak();
    await settle();

    queryPanel()!.getByText('Paused for ad');
    expectNoTimes();
  });

  describe("when YouTube's ad markup isn't recognised", () => {
    it('keeps tracking the video, and reports failed=ads', async () => {
      const page = openSavedPage('watch-ad', AD_URL);
      page.withhold(page.ads);
      page.video.load({ duration: VIDEO_LENGTH });
      page.video.seek(250);
      await startChrono();

      const panel = queryPanel()!;
      expect(panel.queryByText('Paused for ad')).toBeNull();
      panel.getByText('13:54 left');
      expect(await reportedFailures()).toContain('ads');
    });

    it("doesn't stay paused when the markup stops making sense in the middle of an ad", async () => {
      const page = openSavedPage('watch-ad', AD_URL);
      page.video.load({ duration: VIDEO_LENGTH });
      page.video.seek(250);
      await startChrono();
      queryPanel()!.getByText('Paused for ad');

      page.withhold(page.ads);
      await settle();

      const panel = queryPanel()!;
      expect(panel.queryByText('Paused for ad')).toBeNull();
      panel.getByText('13:54 left');
      expect(await reportedFailures()).toContain('ads');
    });

    it("doesn't report failed=ads on a page whose ad markup is recognised", async () => {
      const page = openSavedPage('watch-ad', AD_URL);
      page.video.load({ duration: AD_LENGTH });
      await startChrono();
      page.endAdBreak();
      await settle();

      expect(await reportedFailures()).not.toContain('ads');
    });
  });

  it("shows the video's times when YouTube moves from the ad page to the video page", async () => {
    const adPage = openSavedPage('watch-ad', AD_URL);
    adPage.video.load({ duration: AD_LENGTH });
    adPage.video.play();
    await startChrono();

    const page = renderSavedPage('watch-delhi');
    page.video.load({ duration: 1000 });
    page.video.seek(250);
    await settle();

    const panel = queryPanel()!;
    expect(panel.queryByText('Paused for ad')).toBeNull();
    panel.getByText('12:30 left');
    panel.getByText('Ends 3:12 PM · at 1×');
  });
});

describe('Live content', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 17, 15, 0, 0) });
  });

  it('shows "Live" with no finish time on a live stream, and keeps the speed controls', async () => {
    // A rewindable stream: the video element's length is the part YouTube keeps.
    const page = openSavedPage('watch-live', LIVE_URL);
    page.video.load({ duration: 50_400 });
    page.video.seek(50_390);
    page.video.play();
    await startChrono();

    vi.advanceTimersByTime(5000);

    const panel = queryPanel()!;
    panel.getByText('Live');
    expectNoTimes();
    panel.getByRole('button', { name: 'Faster' });
    panel.getByRole('button', { name: 'Slower' });
  });

  it('changes speed on a live stream', async () => {
    const page = openSavedPage('watch-live', LIVE_URL);
    page.video.load({ duration: 50_400 });
    await startChrono();

    const panel = queryPanel()!;
    panel.getByRole('button', { name: 'Slower' }).click();
    await settle();

    expect(page.player.speed).toBe(0.75);
    panel.getByText('0.75×');
    panel.getByText('Live');
    expectNoTimes();
  });

  it('stays "Live" when the viewer rewinds the stream', async () => {
    const page = openSavedPage('watch-live', LIVE_URL);
    page.video.load({ duration: 50_400 });
    page.video.seek(50_390);
    await startChrono();

    page.video.seek(40_000);

    queryPanel()!.getByText('Live');
    expectNoTimes();
  });

  it('shows "Live" with no finish time before a scheduled stream or premiere starts', async () => {
    // Until it starts, YouTube loads nothing into the video element.
    openSavedPage('watch-upcoming', UPCOMING_URL);
    await startChrono();

    const panel = queryPanel()!;
    panel.getByText('Live');
    expectNoTimes();
    panel.getByRole('button', { name: 'Faster' });
  });

  it("shows \"Live\" for a video with no end, even when YouTube's live markup isn't recognised", async () => {
    const page = openSavedPage('watch-live', LIVE_URL);
    page.withhold(page.timeDisplay);
    page.video.load({ duration: Infinity });
    await startChrono();

    queryPanel()!.getByText('Live');
    expectNoTimes();
    expect(await reportedFailures()).toContain('live');
  });

  it('follows YouTube from a live stream to a video and back', async () => {
    const live = openSavedPage('watch-live', LIVE_URL);
    live.video.load({ duration: 50_400 });
    await startChrono();

    await startNavigation(WATCH_URL);
    const page = renderSavedPage('watch-delhi');
    await finishNavigation();
    page.video.load({ duration: 1000 });
    page.video.seek(250);
    await settle();
    let panel = queryPanel()!;
    expect(panel.queryByText('Live')).toBeNull();
    panel.getByText('12:30 left');

    await startNavigation(LIVE_URL);
    const next = renderSavedPage('watch-live');
    await finishNavigation();
    next.video.load({ duration: 50_400 });
    await settle();
    panel = queryPanel()!;
    panel.getByText('Live');
    expectNoTimes();
  });
});

describe('Lengths that make no sense', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 17, 15, 0, 0) });
  });

  /** The Panel shows no NaN, Infinity or negative number anywhere. */
  function expectNoNonsense(): void {
    expect(queryPanel()!.queryAllByText(/NaN|Infinity|-\d/)).toHaveLength(0);
  }

  it.each([
    ['watch-delhi', WATCH_URL],
    ['watch-ad', AD_URL],
    ['watch-live', LIVE_URL],
    ['watch-upcoming', UPCOMING_URL],
  ])('never shows NaN, Infinity or a negative time on %s', async (name, url) => {
    const page = openSavedPage(name, url);
    await startChrono();

    for (const duration of [NaN, Infinity, 0, 1000]) {
      page.video.startLoading();
      page.video.load({ duration });
      // YouTube's player sometimes reports a position past the video's end.
      page.video.seek(duration === 1000 ? 1001 : 30);
      await settle();
      expectNoNonsense();
      page.video.play();
      vi.advanceTimersByTime(2000);
      await settle();
      expectNoNonsense();
    }
  });

  it('never shows NaN or Infinity when the video element reports a speed of 0', async () => {
    const page = openSavedPage('watch-delhi', WATCH_URL, { playerApi: false });
    page.video.load({ duration: 1000 });
    page.video.setSpeed(0);
    await startChrono();

    expectNoNonsense();
  });
});
