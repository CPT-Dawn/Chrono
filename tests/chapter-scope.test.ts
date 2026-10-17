import { fireEvent, within } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryPanel, reportedFailures, settle, startChrono } from './harness/chrono';
import { openPopup } from './harness/popup';
import {
  finishNavigation,
  navigate,
  openSavedPage,
  renderSavedPage,
  type SavedPage,
  startNavigation,
} from './harness/youtube';

// 3Blue1Brown's "But what is a neural network?", 18:40 long, with 12 chapters. Among them:
// "Introducing layers" from 3:35 to 5:31, then "Why layers?" from 5:31 to 8:38. Both pages
// were saved in Oct 2026; the legacy one from a session whose Delhi experiment flags
// (delhi_modern_web_player and the rest) were turned off.
const CHAPTERS_URL = 'https://www.youtube.com/watch?v=aircAruvnKk';
const DURATION = 1120;
// Big Buck Bunny, which has no chapters.
const NO_CHAPTERS_URL = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';

/** Opens a saved page with chapters at `position` seconds and expands the Panel's details. */
async function openChapters(name: string, position: number) {
  const page = openSavedPage(name, CHAPTERS_URL);
  page.video.load({ duration: DURATION });
  page.video.seek(position);
  await startChrono();
  const panel = queryPanel()!;
  fireEvent.click(panel.getByRole('button', { name: 'Details' }));
  return { page, panel, chapter: () => readChapterScope(panel.element) };
}

/**
 * What the Panel's Chapter scope says outside its target and speed table, line by line, and the table's
 * rows as a screen reader announces them. Null when the Panel shows no Chapter scope.
 */
function readChapterScope(panelElement: HTMLElement) {
  const panel = within(panelElement.shadowRoot as unknown as HTMLElement);
  const element = panel.queryByRole('group', { name: 'Chapter' });
  if (!element) return null;
  const scope = within(element);
  const table = scope.getByRole('group', { name: 'Chapter speed table' });
  const target = scope.getByRole('group', { name: 'Chapter target' });
  return {
    summary: scope
      .getAllByText(/./)
      .filter((line) => !table.contains(line) && !target.contains(line))
      .map((line) => line.textContent),
    rows: within(table).getAllByRole('button').map((row) => row.getAttribute('aria-label')),
  };
}

describe('Chapter scope', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 17, 15, 0, 0) });
  });

  it.each(['watch-chapters-delhi', 'watch-chapters-legacy'])(
    "shows the current chapter's title, remaining and finish time on %s",
    async (name) => {
      // 4:10 into the video, 81 s before "Introducing layers" ends.
      const { chapter } = await openChapters(name, 250);

      expect(chapter()?.summary).toEqual(['Chapter', 'Introducing layers', '1:21 left at 1×', 'ends 3:01 PM']);
    },
  );

  it('switches to the next chapter when the viewer seeks across a chapter boundary', async () => {
    const { page, chapter } = await openChapters('watch-chapters-delhi', 250);

    // 5:40: 178 s before "Why layers?" ends at 8:38.
    page.video.seek(340);

    expect(chapter()?.summary).toEqual(['Chapter', 'Why layers?', '2:58 left at 1×', 'ends 3:02 PM']);
  });

  it('switches as the playhead plays into the next chapter', async () => {
    const { page, chapter } = await openChapters('watch-chapters-delhi', 329);

    page.video.play();
    vi.advanceTimersByTime(3000);

    // 5:32: 1 s into "Why layers?", which has 186 s left.
    expect(chapter()?.summary).toEqual(['Chapter', 'Why layers?', '3:06 left at 1×', 'ends 3:03 PM']);
  });

  it("shows the chapter's speed table, at the viewer's speed", async () => {
    const { page, chapter } = await openChapters('watch-chapters-legacy', 250);

    page.player.setSpeed(1.5);

    // 81 s of "Introducing layers" left.
    expect(chapter()).toEqual({
      summary: ['Chapter', 'Introducing layers', '0:54 left at 1.5×', 'ends 3:00 PM'],
      rows: [
        '1×: 1:21 left, ends 3:01 PM',
        '1.25×: 1:05 left, ends 3:01 PM',
        '1.5×: 0:54 left, ends 3:00 PM',
        '1.75×: 0:47 left, ends 3:00 PM',
        '2×: 0:41 left, ends 3:00 PM',
      ],
    });
  });

  it("applies a row of the chapter's speed table through YouTube's player", async () => {
    const { page, panel } = await openChapters('watch-chapters-delhi', 250);
    const table = within(panel.getByRole('group', { name: 'Chapter speed table' }));

    fireEvent.click(table.getByRole('button', { name: /^2×/ }));

    expect(page.player.speed).toBe(2);
    panel.getByText('7:15 left at 2×');
  });

  it('shows no Chapter scope on a video without chapters', async () => {
    const page = openSavedPage('watch-delhi', NO_CHAPTERS_URL);
    page.video.load({ duration: 1000 });
    page.video.seek(250);
    await startChrono();
    const panel = queryPanel()!;
    fireEvent.click(panel.getByRole('button', { name: 'Details' }));

    expect(readChapterScope(panel.element)).toBeNull();
    panel.getByRole('group', { name: 'Speed table' });
    expect(await reportedFailures()).not.toContain('chapters');
  });

  it('shows no Chapter scope while the details are collapsed', async () => {
    const { panel, chapter } = await openChapters('watch-chapters-delhi', 250);

    fireEvent.click(panel.getByRole('button', { name: 'Details' }));

    expect(chapter()).toBeNull();
  });

  it('follows YouTube to a video without chapters and back', async () => {
    const { chapter } = await openChapters('watch-chapters-delhi', 250);

    await startNavigation(NO_CHAPTERS_URL);
    const other = renderSavedPage('watch-delhi');
    await finishNavigation();
    other.video.load({ duration: 1000 });
    other.video.seek(250);
    await settle();
    expect(chapter()).toBeNull();

    await startNavigation(CHAPTERS_URL);
    const back = renderSavedPage('watch-chapters-delhi');
    await finishNavigation();
    back.video.load({ duration: DURATION });
    back.video.seek(340);
    await settle();
    expect(chapter()?.summary).toEqual(['Chapter', 'Why layers?', '2:58 left at 1×', 'ends 3:02 PM']);
  });

  it("never shows the previous video's chapters while YouTube is still replacing them", async () => {
    const { page, chapter } = await openChapters('watch-chapters-delhi', 250);

    // YouTube moves to the next video in the same page, and loads it into the same
    // player, before it replaces the list of chapters beside it. The next video is longer,
    // so the old chapters would fit in it.
    await navigate(NO_CHAPTERS_URL);
    page.video.startLoading();
    page.video.load({ duration: 2000 });
    page.video.seek(250);
    await settle();

    expect(chapter()).toBeNull();
  });

  it('hides during an ad, and comes back with the video when the ad ends', async () => {
    const { page, chapter } = await openChapters('watch-chapters-delhi', 250);

    page.startAdBreak();
    page.video.startLoading();
    page.video.load({ duration: 30 });
    page.video.play();
    await settle();
    expect(chapter()).toBeNull();

    page.endAdBreak();
    page.video.startLoading();
    page.video.load({ duration: DURATION });
    page.video.seek(250);
    await settle();
    expect(chapter()?.summary).toContain('Introducing layers');
  });

  describe("when YouTube's chapter markup isn't recognised", () => {
    /** The rest of the Panel works as on any video. */
    async function expectPanelWorks(page: SavedPage) {
      const panel = queryPanel()!;
      panel.getByText('14:30 left at 1×');
      panel.getByRole('group', { name: 'Speed table' });
      fireEvent.click(panel.getByRole('button', { name: 'Faster' }));
      await settle();
      expect(page.player.speed).toBe(1.25);
    }

    it('hides the Chapter scope and reports failed=chapters when the list of chapters is missing', async () => {
      const page = openSavedPage('watch-chapters-delhi', CHAPTERS_URL);
      page.withhold(page.chapters);
      page.video.load({ duration: DURATION });
      page.video.seek(250);
      await startChrono();
      fireEvent.click(queryPanel()!.getByRole('button', { name: 'Details' }));

      expect(readChapterScope(queryPanel()!.element)).toBeNull();
      expect(await reportedFailures()).toContain('chapters');
      await expectPanelWorks(page);
    });

    it.each([
      ['their titles are gone', (chapters: Element) => chapters.querySelectorAll('.macro-markers').forEach((t) => t.remove())],
      ['their links no longer say where they start', (chapters: Element) => {
        for (const link of chapters.querySelectorAll('a#endpoint')) link.setAttribute('href', '/watch?v=aircAruvnKk');
      }],
      ['one is missing', (chapters: Element) => chapters.querySelector('ytd-macro-markers-list-item-renderer:nth-child(3)')!.remove()],
    ])('hides the Chapter scope and reports failed=chapters when %s', async (_, alter) => {
      const page = openSavedPage('watch-chapters-legacy', CHAPTERS_URL);
      alter(page.chapters);
      page.video.load({ duration: DURATION });
      page.video.seek(250);
      await startChrono();
      fireEvent.click(queryPanel()!.getByRole('button', { name: 'Details' }));

      expect(readChapterScope(queryPanel()!.element)).toBeNull();
      expect(await reportedFailures()).toContain('chapters');
      await expectPanelWorks(page);
    });

    it("hides the Chapter scope and reports failed=chapters when the progress bar's chapters are missing", async () => {
      const page = openSavedPage('watch-chapters-delhi', CHAPTERS_URL);
      page.withhold(page.chapterSegments);
      page.video.load({ duration: DURATION });
      page.video.seek(250);
      await startChrono();
      fireEvent.click(queryPanel()!.getByRole('button', { name: 'Details' }));

      expect(readChapterScope(queryPanel()!.element)).toBeNull();
      expect(await reportedFailures()).toContain('chapters');
      await expectPanelWorks(page);
    });

    it("doesn't report failed=chapters once YouTube has rendered the chapters", async () => {
      const page = openSavedPage('watch-chapters-delhi', CHAPTERS_URL);
      const putBack = page.withhold(page.chapters);
      page.video.load({ duration: DURATION });
      page.video.seek(250);
      await startChrono();
      fireEvent.click(queryPanel()!.getByRole('button', { name: 'Details' }));

      putBack();
      page.video.seek(251);

      expect(readChapterScope(queryPanel()!.element)?.summary).toContain('Introducing layers');
      expect(await reportedFailures()).not.toContain('chapters');
    });
  });

  describe('"Show Chapter scope" setting', () => {
    it('is on at first, in the popup and the ⋮ menu', async () => {
      const popup = await openPopup();
      const { panel, chapter } = await openChapters('watch-chapters-delhi', 250);
      fireEvent.click(panel.getByRole('button', { name: 'More actions' }));

      expect(popup.getByRole<HTMLInputElement>('checkbox', { name: 'Show Chapter scope' }).checked).toBe(true);
      expect(panel.getByRole('menuitemcheckbox', { name: 'Show Chapter scope' }).getAttribute('aria-checked')).toBe('true');
      expect(chapter()).not.toBeNull();
    });

    it('turned off and on in the popup, hides and shows the Chapter scope in an open Panel', async () => {
      const { chapter } = await openChapters('watch-chapters-delhi', 250);
      const popup = await openPopup();
      const setting = popup.getByRole('checkbox', { name: 'Show Chapter scope' });

      fireEvent.click(setting);
      await settle();
      expect(chapter()).toBeNull();

      fireEvent.click(setting);
      await settle();
      expect(chapter()?.summary).toEqual(['Chapter', 'Introducing layers', '1:21 left at 1×', 'ends 3:01 PM']);
    });

    it('turned off in the ⋮ menu, hides the Chapter scope and stays off for the next watch page', async () => {
      const { panel, chapter } = await openChapters('watch-chapters-delhi', 250);
      const popup = await openPopup();

      fireEvent.click(panel.getByRole('button', { name: 'More actions' }));
      fireEvent.click(panel.getByRole('menuitemcheckbox', { name: 'Show Chapter scope' }));
      await settle();

      expect(chapter()).toBeNull();
      expect(popup.getByRole<HTMLInputElement>('checkbox', { name: 'Show Chapter scope' }).checked).toBe(false);
      const next = await openChapters('watch-chapters-legacy', 250);
      expect(next.chapter()).toBeNull();
    });
  });
});
