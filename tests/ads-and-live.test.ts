import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryPanel, reportedFailures, settle, startChrono } from './harness/chrono';
import { finishNavigation, openSavedPage, renderSavedPage, startNavigation } from './harness/youtube';

const WATCH_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';

const LIVE_URL = 'https://www.youtube.com/watch?v=56llPN9tS88';
const UPCOMING_URL = 'https://www.youtube.com/watch?v=UleiRdWFG7o';

/** The Panel is up, but shows no remaining or finish time. */
function expectNoTimes(): void {
  expect(queryPanel()!.queryAllByText(/left at|ends/)).toHaveLength(0);
}

describe('Ad breaks', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 17, 15, 0, 0) });
  });

  it('shows "Paused for ad", and no remaining or finish time for the ad itself', async () => {
    // YouTube plays the ad in the watch page's own video element.
    const page = openSavedPage('watch-ad', WATCH_URL);
    page.video.load({ duration: 15 });
    page.video.play();
    await startChrono();

    vi.advanceTimersByTime(5000);

    queryPanel()!.getByText('Paused for ad');
    expectNoTimes();
  });

  it('resumes with the video\'s times when the ad ends', async () => {
    const page = openSavedPage('watch-ad', WATCH_URL);
    page.video.load({ duration: 15 });
    page.video.play();
    await startChrono();
    vi.advanceTimersByTime(15_000);

    // After the ad, YouTube loads the video into the same element.
    page.endAdBreak();
    page.video.startLoading();
    page.video.load({ duration: 1000 });
    page.video.seek(250);
    await settle();

    const panel = queryPanel()!;
    expect(panel.queryByText('Paused for ad')).toBeNull();
    panel.getByText('12:30 left at 1×');
    panel.getByText('ends 3:12 PM');
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
    panel.getByText('12:30 left at 1×');
    // The ad took 30 seconds, so the video now ends 30 seconds later.
    panel.getByText('ends 3:13 PM');
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
      const page = openSavedPage('watch-ad', WATCH_URL);
      page.withhold(page.ads);
      page.video.load({ duration: 1000 });
      page.video.seek(250);
      await startChrono();

      const panel = queryPanel()!;
      expect(panel.queryByText('Paused for ad')).toBeNull();
      panel.getByText('12:30 left at 1×');
      expect(await reportedFailures()).toContain('ads');
    });

    it("doesn't stay paused when the markup stops making sense in the middle of an ad", async () => {
      const page = openSavedPage('watch-ad', WATCH_URL);
      page.video.load({ duration: 1000 });
      page.video.seek(250);
      await startChrono();
      queryPanel()!.getByText('Paused for ad');

      page.withhold(page.ads);
      await settle();

      const panel = queryPanel()!;
      expect(panel.queryByText('Paused for ad')).toBeNull();
      panel.getByText('12:30 left at 1×');
      expect(await reportedFailures()).toContain('ads');
    });

    it("doesn't report failed=ads on a page whose ad markup is recognised", async () => {
      const page = openSavedPage('watch-ad', WATCH_URL);
      page.video.load({ duration: 15 });
      await startChrono();
      page.endAdBreak();
      await settle();

      expect(await reportedFailures()).not.toContain('ads');
    });
  });

  it("shows the video's times when YouTube moves from the ad page to the video page", async () => {
    const adPage = openSavedPage('watch-ad', WATCH_URL);
    adPage.video.load({ duration: 15 });
    adPage.video.play();
    await startChrono();

    const page = renderSavedPage('watch-delhi');
    page.video.load({ duration: 1000 });
    page.video.seek(250);
    await settle();

    const panel = queryPanel()!;
    expect(panel.queryByText('Paused for ad')).toBeNull();
    panel.getByText('12:30 left at 1×');
    panel.getByText('ends 3:12 PM');
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
    panel.getByText('12:30 left at 1×');

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
    ['watch-ad', WATCH_URL],
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
