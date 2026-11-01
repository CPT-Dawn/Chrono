import { fireEvent, within } from '@testing-library/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { countPanels, queryPanel, queryPlayerBadge, reportedFailures, settle, startChrono } from './harness/chrono';
import { openSavedPage } from './harness/youtube';

/**
 * The recording of a 1:56:12 live stream, opened with its chat replay, as the third entry
 * of a 2,480-entry playlist of which YouTube loaded the first 202.
 */
const RECORDING = 'https://www.youtube.com/watch?v=Mw8AY0SvT30&list=PL9E9945kkf2AoDFiFrz3UNO0wv5NFh_5q&index=3';
const LENGTH = 6972;

async function openRecording({ position = 1000 } = {}) {
  const page = openSavedPage('watch-stream-recording', RECORDING);
  page.video.load({ duration: LENGTH });
  page.video.seek(position);
  await startChrono();
  return page;
}

describe('Stream recording', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 17, 15, 0, 0) });
  });

  it('shows remaining and finish times, not "Live"', async () => {
    await openRecording();

    // 6,972 s long, 1,000 s in: 5,972 s left, ending at 4:39:32 PM.
    const panel = queryPanel()!;
    expect(panel.queryByText('Live')).toBeNull();
    panel.getByText('1:39:32 left');
    panel.getByText('Ends 4:39 PM · at 1×');
    expect(queryPlayerBadge()).toBe('/ ends 4:39 PM');
    expect(await reportedFailures()).toEqual([]);
  });

  it('puts one Panel above the panels, not in or below the chat replay', async () => {
    const page = await openRecording();

    // The page opened with its chat replay showing, between the panels and the playlist.
    expect(document.querySelector('ytd-watch-flexy[live-chat-present-and-expanded]')).not.toBeNull();
    const panel = queryPanel()!.element;
    const chat = page.sidebar.querySelector(':scope > #chat-container')!;
    expect(countPanels()).toBe(1);
    expect(panel.nextElementSibling).toBe(page.sidebar.querySelector(':scope > #panels'));
    expect(chat.contains(panel)).toBe(false);
    expect(isBefore(panel, chat)).toBe(true);
  });

  it('counts the 202 entries YouTube loaded of the 2,480, and says so', async () => {
    await openRecording();
    const panel = queryPanel()!;
    fireEvent.click(panel.getByRole('button', { name: 'Details' }));

    // 5,972 s left of entry 3, then 2,831,549 s in entries 4–202, as their thumbnails say:
    // 2,837,521 s.
    const scope = within(panel.getByRole('group', { name: 'Playlist' }));
    scope.getByText('first 202 of 2,480 counted');
    scope.getByText('788:12:01 left');
    expect((scope.getByRole('spinbutton', { name: 'Up to video' }) as HTMLInputElement).max).toBe('2480');
    expect(await reportedFailures()).toEqual([]);
  });

  it('names an entry that is live now as live, not unavailable', async () => {
    // Entry 1 is live now, but comes before the playing entry. Entry 4 (1:35:47) becomes
    // live the same way: its thumbnail marked is-live-video, with no time on it.
    const page = openSavedPage('watch-stream-recording', RECORDING);
    const entry = document.querySelectorAll('ytd-playlist-panel-video-renderer')[3]!;
    const thumbnail = entry.querySelector('ytd-thumbnail')!;
    thumbnail.setAttribute('is-live-video', '');
    thumbnail.querySelector('ytd-thumbnail-overlay-time-status-renderer')!.remove();
    page.video.load({ duration: LENGTH });
    page.video.seek(1000);
    await startChrono();
    const panel = queryPanel()!;
    fireEvent.click(panel.getByRole('button', { name: 'Details' }));

    // 2,837,521 s, less entry 4's 5,747 s: 2,831,774 s.
    const scope = within(panel.getByRole('group', { name: 'Playlist' }));
    scope.getByText('first 202 of 2,480 counted · 1 live');
    expect(scope.queryByText(/unavailable/)).toBeNull();
    scope.getByText('786:36:14 left');
    expect(await reportedFailures()).toEqual([]);
  });

  it('finds its place below the video in a narrow window, with the chat replay there too', async () => {
    const page = await openRecording();

    page.setLayout('one-column');
    await settle();

    const panel = queryPanel()!.element;
    expect(countPanels()).toBe(1);
    expect(page.sidebar.contains(panel)).toBe(false);
    expect(document.querySelector('ytd-watch-flexy #chat-container')!.contains(panel)).toBe(false);
    expect(isBefore(page.video.element, panel)).toBe(true);
    expect(isBefore(panel, page.related)).toBe(true);
    queryPanel()!.getByText('1:39:32 left');
  });
});

function isBefore(a: Node, b: Node): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}
