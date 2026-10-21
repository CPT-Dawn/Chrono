import { fireEvent, within } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { countPanels, queryPanel, queryPlayerBadge, reportedFailures, settle, startChrono } from './harness/chrono';
import { openSavedPage, type SavedPage } from './harness/youtube';

/**
 * The first video of a 2,474-video playlist: the 4:42:15 recording of a live stream, with
 * its chat replay open beside it.
 */
const RECORDING_URL = 'https://www.youtube.com/watch?v=BeTkAjAfl18&list=PL9E9945kkf2AoDFiFrz3UNO0wv5NFh_5q';
const RECORDING = { duration: 16_935 };

/** Opens the stream recording with its video loaded at `position` and Chrono running. */
async function openRecording(position = 1000) {
  const page = openSavedPage('watch-stream-recording', RECORDING_URL);
  page.video.load(RECORDING);
  page.video.seek(position);
  await startChrono();
  return page;
}

describe('A recording of a live stream, with chat replay', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 17, 15, 0, 0) });
  });

  it('shows remaining and finish times like any video, not "Live"', async () => {
    await openRecording();

    const panel = queryPanel()!;
    expect(panel.queryByText('Live')).toBeNull();
    // 15,935 s left of 16,935 s.
    panel.getByText('4:25:35 left at 1×');
    panel.getByText('ends 7:25 PM');
    expect(queryPlayerBadge()).toBe('· ends 7:25 PM');
  });

  it('recognises every part of the page it reads', async () => {
    await openRecording();

    expect(await reportedFailures()).toEqual([]);
  });

  it('puts one Panel at the top of the sidebar, above the chat replay', async () => {
    const page = await openRecording();

    expect(countPanels()).toBe(1);
    const panel = queryPanel()!.element;
    expect(page.sidebar.firstElementChild).toBe(panel);
    expect(panel.nextElementSibling).toBe(document.querySelector('ytd-watch-flexy #panels'));
    expectAboveChat(panel);
  });

  it('moves below the video in a narrow window, still above the chat replay, and back again', async () => {
    const page = await openRecording();

    page.setLayout('one-column');
    await settle();

    expect(countPanels()).toBe(1);
    let panel = queryPanel()!.element;
    expectBelowVideo(page, panel);
    expectAboveChat(panel);

    page.setLayout('two-columns');
    await settle();

    expect(countPanels()).toBe(1);
    panel = queryPanel()!.element;
    expect(page.sidebar.firstElementChild).toBe(panel);
    expectAboveChat(panel);
  });

  it('appears below the video, above the chat replay, on a page that opens in a narrow window', async () => {
    const page = openSavedPage('watch-stream-recording', RECORDING_URL);
    page.video.load(RECORDING);
    page.setLayout('one-column');

    await startChrono();

    expect(countPanels()).toBe(1);
    const panel = queryPanel()!.element;
    expectBelowVideo(page, panel);
    expectAboveChat(panel);
  });

  it('counts the 200 loaded entries in the Playlist scope, and says how many of 2,474 it counted', async () => {
    await openRecording();
    const panel = queryPanel()!;
    fireEvent.click(panel.getByRole('button', { name: 'Details' }));

    // YouTube loaded 200 of the playlist's 2,474 entries. 15,935 s left of video 1, then
    // 2,857,141 s in entries 2–200: 2,873,076 s.
    const scope = within(panel.getByRole('group', { name: 'Playlist' }));
    scope.getByText('first 200 of 2,474 counted');
    scope.getByText('798:04:36 left at 1×');
    expect((scope.getByRole('spinbutton', { name: 'Up to video' }) as HTMLInputElement).max).toBe('2474');
  });
});

/** The Panel is above YouTube's engagement panels and its chat replay, not inside either. */
function expectAboveChat(panel: Element): void {
  const panels = document.querySelector('ytd-watch-flexy #panels')!;
  const chat = document.querySelector('ytd-watch-flexy #chat-container')!;
  expect(isBefore(panel, panels)).toBe(true);
  expect(isBefore(panel, chat)).toBe(true);
  expect(panels.contains(panel) || chat.contains(panel)).toBe(false);
}

/** The Panel is out of the sidebar, between the video and the related videos. */
function expectBelowVideo(page: SavedPage, panel: Element): void {
  expect(page.sidebar.contains(panel)).toBe(false);
  expect(isBefore(page.video.element, panel)).toBe(true);
  expect(isBefore(panel, page.related)).toBe(true);
}

function isBefore(a: Node, b: Node): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}
