import { fireEvent, within } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryPanel, reportedFailures, settle, startChrono } from './harness/chrono';
import { finishNavigation, navigate, openSavedPage, type SavedPage, startNavigation } from './harness/youtube';

const SETTLERS = 'PLa1F2ddGya_8Pn07ZxzgxFRw5iQbovXZv';
/** The second of the eight "Settlers" videos, 15:27 long. */
const SETTLERS_2 = `https://www.youtube.com/watch?v=cDli6QjNna0&list=${SETTLERS}`;

/**
 * Opens a saved watch page in a playlist with its video loaded and Chrono running, and
 * expands the Panel's details.
 */
async function openPlaylist(name: string, url: string, video: { duration: number; position: number }) {
  const page = openSavedPage(name, url);
  page.video.load({ duration: video.duration });
  page.video.seek(video.position);
  await startChrono();
  const panel = queryPanel()!;
  fireEvent.click(panel.getByRole('button', { name: 'Details' }));
  return { page, panel };
}

/** The Playlist scope as the viewer sees it, or null when the Panel shows none. */
function queryPlaylistScope() {
  const scope = queryPanel()?.queryByRole('group', { name: 'Playlist' });
  return scope ? { element: scope, ...within(scope) } : null;
}

function playlistScope() {
  const scope = queryPlaylistScope();
  if (!scope) throw new Error('The Panel shows no Playlist scope');
  return scope;
}

/** The Playlist scope's speed table rows, as a screen reader announces them. */
function playlistRows(): (string | null)[] {
  const table = within(playlistScope().getByRole('group', { name: 'Playlist speed table' }));
  return table.getAllByRole('button').map((row) => row.getAttribute('aria-label'));
}

/** The target entry input. */
function targetInput(): HTMLInputElement {
  return playlistScope().getByRole('spinbutton', { name: 'Up to video' }) as HTMLInputElement;
}

function setTarget(value: string): void {
  const input = targetInput();
  input.value = value;
  fireEvent.change(input);
}

describe('Playlist scope', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 17, 15, 0, 0) });
  });

  it("counts the current video's remaining and every following entry, as watch time", async () => {
    // 500 s left of video 2, then videos 3–8: 32:08 + 28:37 + 46:16 + 32:30 + 47:22 + 13:46
    // = 12,039 s. 12,539 s of content in all.
    await openPlaylist('watch-playlist', SETTLERS_2, { duration: 927, position: 427 });

    const scope = playlistScope();
    scope.getByText('3:28:59 left at 1×');
    // Once for the scope, once in its speed table's 1× row.
    expect(scope.getAllByText('ends 6:28 PM')).toHaveLength(2);
    expect(playlistRows()).toEqual([
      '1×: 3:28:59 left, ends 6:28 PM',
      '1.25×: 2:47:12 left, ends 5:47 PM',
      '1.5×: 2:19:20 left, ends 5:19 PM',
      '1.75×: 1:59:26 left, ends 4:59 PM',
      '2×: 1:44:30 left, ends 4:44 PM',
    ]);
  });

  describe('target entry', () => {
    /** The third "Settlers" video, 32:08 long. */
    const SETTLERS_3 = `https://www.youtube.com/watch?v=AynMJ5CkGEQ&list=${SETTLERS}&index=3`;

    /** YouTube plays the next video in the playlist, the third, without a reload. */
    async function playNextEntry(page: SavedPage) {
      await startNavigation(SETTLERS_3);
      page.selectPlaylistEntry(3);
      page.video.startLoading();
      page.video.load({ duration: 1928 });
      page.video.seek(928);
      await finishNavigation();
    }

    it('is the last entry to begin with', async () => {
      await openPlaylist('watch-playlist', SETTLERS_2, { duration: 927, position: 427 });

      expect(targetInput().value).toBe('8');
      expect(targetInput().min).toBe('2');
      expect(targetInput().max).toBe('8');
    });

    it('counts only up to the entry the viewer chooses', async () => {
      await openPlaylist('watch-playlist', SETTLERS_2, { duration: 927, position: 427 });

      setTarget('4');

      // 500 s left of video 2, then 32:08 + 28:37: 4,145 s.
      playlistScope().getByText('1:09:05 left at 1×');
      expect(playlistRows()[0]).toBe('1×: 1:09:05 left, ends 4:09 PM');
    });

    it('can be the current entry, which counts only what is left of it', async () => {
      await openPlaylist('watch-playlist', SETTLERS_2, { duration: 927, position: 427 });

      setTarget('2');

      playlistScope().getByText('8:20 left at 1×');
    });

    it("won't take an entry earlier than the current one", async () => {
      await openPlaylist('watch-playlist', SETTLERS_2, { duration: 927, position: 427 });
      setTarget('5');

      setTarget('1');

      expect(targetInput().value).toBe('5');
      // 500 s, then 32:08 + 28:37 + 46:16: 6,921 s.
      playlistScope().getByText('1:55:21 left at 1×');
    });

    it("won't take an entry past the end of the playlist", async () => {
      await openPlaylist('watch-playlist', SETTLERS_2, { duration: 927, position: 427 });

      setTarget('9');

      expect(targetInput().value).toBe('8');
      playlistScope().getByText('3:28:59 left at 1×');
    });

    it('stays when YouTube plays the next video in the same playlist', async () => {
      const { page } = await openPlaylist('watch-playlist', SETTLERS_2, { duration: 927, position: 427 });
      setTarget('4');

      await playNextEntry(page);

      expect(targetInput().value).toBe('4');
      expect(targetInput().min).toBe('3');
      // 1,000 s left of video 3, then 28:37: 2,717 s.
      playlistScope().getByText('45:17 left at 1×');
    });

    it('clears when the viewer leaves the playlist', async () => {
      const { page } = await openPlaylist('watch-playlist', SETTLERS_2, { duration: 927, position: 427 });
      setTarget('4');

      // A video outside the playlist, then back into the playlist.
      await navigate('https://www.youtube.com/watch?v=aqz-KE-bpKQ');
      expect(queryPlaylistScope()).toBeNull();
      await startNavigation(SETTLERS_2);
      page.video.startLoading();
      page.video.load({ duration: 927 });
      page.video.seek(427);
      await finishNavigation();

      expect(targetInput().value).toBe('8');
      playlistScope().getByText('3:28:59 left at 1×');
    });
  });

  describe('is honest about what it can count', () => {
    /** The first video of the 317-video "Blender Today LIVE" playlist, 1:48:08 long. */
    const LONG = 'https://www.youtube.com/watch?v=oMeecNng9TM&list=PLa1F2ddGya_87HJ72v_IgKUTNLIXSMfvB';

    it('counts only the entries YouTube has loaded of a long playlist, and says so', async () => {
      // YouTube loaded 200 of the playlist's 317 entries. 6,000 s left of video 1, then
      // 896,936 s in entries 2–200: 902,936 s.
      await openPlaylist('watch-playlist-long', LONG, {
        duration: 6488,
        position: 488,
      });

      const scope = playlistScope();
      scope.getByText('first 200 of 317 counted');
      scope.getByText('250:48:56 left at 1×');
      expect(targetInput().max).toBe('317');
    });

    it("doesn't say it's partial when the target entry is among those loaded", async () => {
      await openPlaylist('watch-playlist-long', LONG, {
        duration: 6488,
        position: 488,
      });

      setTarget('2');

      // 6,000 s, then 1:32:44.
      playlistScope().getByText('3:12:44 left at 1×');
      expect(playlistScope().queryByText(/counted/)).toBeNull();
    });

    it('skips unavailable entries and counts them', async () => {
      // YouTube hid 8 of the 24 entries as unavailable and lists the other 16. 100 s left of
      // video 1, then 1,542 s in entries 2–16: 1,642 s.
      await openPlaylist('watch-playlist-unavailable', 'https://www.youtube.com/watch?v=NlMYWuGUZlM&list=PL9249A44A70958524', {
        duration: 217,
        position: 117,
      });

      const scope = playlistScope();
      scope.getByText('8 unavailable');
      scope.getByText('27:22 left at 1×');
      expect(scope.queryByText(/counted/)).toBeNull();
      expect(targetInput().max).toBe('16');
    });

    it("doesn't count the hidden unavailable entries when the scope stops short of the end", async () => {
      // YouTube says how many it hid, but not where they are.
      await openPlaylist('watch-playlist-unavailable', 'https://www.youtube.com/watch?v=NlMYWuGUZlM&list=PL9249A44A70958524', {
        duration: 217,
        position: 117,
      });

      setTarget('5');

      expect(playlistScope().queryByText(/unavailable/)).toBeNull();
    });

    it('shows no Playlist scope in a Mix, which has no end', async () => {
      await openPlaylist('watch-playlist-mix', 'https://www.youtube.com/watch?v=kJQP7kiw5Fk&list=RDkJQP7kiw5Fk', {
        duration: 282,
        position: 82,
      });

      expect(queryPlaylistScope()).toBeNull();
      // The rest of the Panel carries on.
      queryPanel()!.getByText('3:20 left at 1×');
      expect(reportedFailures()).toEqual([]);
    });

    it('says why there is no estimate while Shuffle is on', async () => {
      await openPlaylist('watch-playlist-shuffle', `https://www.youtube.com/watch?v=BIRCCQHz-B8&list=${SETTLERS}`, {
        duration: 1103,
        position: 603,
      });

      const scope = playlistScope();
      scope.getByText('Shuffle is on, so no playlist estimate');
      expect(scope.queryByText(/left at/)).toBeNull();
      expect(scope.queryByRole('spinbutton')).toBeNull();
    });

    it("counts each entry once when YouTube keeps the playlist page's own list in the page too", async () => {
      // The viewer came from the playlist page, which YouTube keeps hidden with its own
      // (newer) markup for the same eight videos. 500 s left of video 1, then videos 2–8:
      // 12,966 s. 13,466 s in all.
      await openPlaylist('watch-playlist-after-playlist-page', `https://www.youtube.com/watch?v=BIRCCQHz-B8&list=${SETTLERS}&pp=iAQB`, {
        duration: 1103,
        position: 603,
      });

      playlistScope().getByText('3:44:26 left at 1×');
      expect(targetInput().max).toBe('8');
    });
  });

  it('hides quietly, and reports failed=playlist, when the playlist panel is markup Chrono doesn\'t know', async () => {
    const page = openSavedPage('watch-playlist', SETTLERS_2);
    // YouTube changes how its panel numbers the entries.
    for (const position of page.playlistPanel.querySelectorAll('.index-message')) position.remove();
    page.video.load({ duration: 927 });
    page.video.seek(427);
    await startChrono();
    const panel = queryPanel()!;
    fireEvent.click(panel.getByRole('button', { name: 'Details' }));

    expect(queryPlaylistScope()).toBeNull();
    panel.getByText('8:20 left at 1×');
    expect(reportedFailures()).toEqual(['playlist']);
  });

  it("hides quietly, and reports failed=playlist, when it can't read the entries' lengths", async () => {
    const page = openSavedPage('watch-playlist', SETTLERS_2);
    // YouTube starts writing lengths in words.
    for (const length of page.playlistPanel.querySelectorAll('ytd-thumbnail-overlay-time-status-renderer :is(badge-shape, #text)')) {
      length.textContent = '18 minutes';
    }
    page.video.load({ duration: 927 });
    page.video.seek(427);
    await startChrono();
    fireEvent.click(queryPanel()!.getByRole('button', { name: 'Details' }));

    expect(queryPlaylistScope()).toBeNull();
    expect(reportedFailures()).toEqual(['playlist']);
  });

  it("hides quietly, and reports failed=playlist, when it can't find the Shuffle button", async () => {
    const page = openSavedPage('watch-playlist', SETTLERS_2);
    // YouTube replaces its Shuffle button with one Chrono doesn't know, beside the Loop button.
    page.playlistPanel.querySelector('ytd-toggle-button-renderer')!.remove();
    page.video.load({ duration: 927 });
    page.video.seek(427);
    await startChrono();
    fireEvent.click(queryPanel()!.getByRole('button', { name: 'Details' }));

    expect(queryPlaylistScope()).toBeNull();
    expect(reportedFailures()).toEqual(['playlist']);
  });

  it('appears once YouTube renders its playlist panel, after the rest of the watch page', async () => {
    const page = openSavedPage('watch-playlist', SETTLERS_2);
    const restore = page.withhold(page.playlistPanel);
    page.video.load({ duration: 927 });
    page.video.seek(427);
    await startChrono();
    fireEvent.click(queryPanel()!.getByRole('button', { name: 'Details' }));
    expect(queryPlaylistScope()).toBeNull();

    restore();
    await settle();

    playlistScope().getByText('3:28:59 left at 1×');
    expect(reportedFailures()).toEqual([]);
  });

  it('shows nothing, and reports nothing, on a video outside any playlist', async () => {
    const page = openSavedPage('watch-delhi', 'https://www.youtube.com/watch?v=aqz-KE-bpKQ');
    page.video.load({ duration: 1000 });
    await startChrono();
    fireEvent.click(queryPanel()!.getByRole('button', { name: 'Details' }));

    expect(queryPlaylistScope()).toBeNull();
    expect(reportedFailures()).toEqual([]);
  });

  it('hides during an ad, when the video element plays the ad', async () => {
    const { page } = await openPlaylist('watch-playlist', SETTLERS_2, { duration: 927, position: 427 });

    page.startAdBreak();
    page.video.startLoading();
    page.video.load({ duration: 30 });
    await settle();

    expect(queryPlaylistScope()).toBeNull();
  });

  it('picks up entries YouTube loads into its panel', async () => {
    const { page } = await openPlaylist('watch-playlist', SETTLERS_2, { duration: 927, position: 427 });
    const items = page.playlistPanel.querySelector('#items')!;

    // YouTube drops the last entry and puts it back, as it does when it re-renders.
    const last = items.lastElementChild!;
    last.remove();
    await settle();
    playlistScope().getByText('3:15:13 left at 1×');
    items.append(last);
    await settle();

    playlistScope().getByText('3:28:59 left at 1×');
  });

  describe('"Show Playlist scope" setting', () => {
    async function toggleSetting() {
      const panel = queryPanel()!;
      const menuButton = panel.getByRole('button', { name: 'More actions' });
      if (menuButton.getAttribute('aria-expanded') !== 'true') fireEvent.click(menuButton);
      fireEvent.click(panel.getByRole('menuitemcheckbox', { name: 'Show Playlist scope' }));
      await settle();
    }

    it('is on to begin with', async () => {
      await openPlaylist('watch-playlist', SETTLERS_2, { duration: 927, position: 427 });
      fireEvent.click(queryPanel()!.getByRole('button', { name: 'More actions' }));

      const item = queryPanel()!.getByRole('menuitemcheckbox', { name: 'Show Playlist scope' });
      expect(item.getAttribute('aria-checked')).toBe('true');
    });

    it('hides and shows the scope at once', async () => {
      await openPlaylist('watch-playlist', SETTLERS_2, { duration: 927, position: 427 });

      await toggleSetting();
      expect(queryPlaylistScope()).toBeNull();
      queryPanel()!.getByText('8:20 left at 1×');

      await toggleSetting();
      playlistScope().getByText('3:28:59 left at 1×');
    });
  });
});
