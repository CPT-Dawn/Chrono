import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { clearDiagnostics, noteReading } from '@/diagnostics';
import { createPlaylistSummary, type PlaylistSummaryLine } from '@/playlist-summary/playlist-summary';
import { readSettings, watchSettings } from '@/settings';
import { connectSpeedBridge } from '@/speed-bridge';
import { playlistSummary } from '@/time-model';
import {
  createPlaylistPageReader,
  type PlaylistPage,
  type Reading,
  readPage,
  watchNavigation,
  watchPlaylistPage,
} from '@/youtube/adapter';

/**
 * Keeps one Playlist summary under a playlist page's stats, up to date as YouTube loads
 * more entries, and only there. It reads what YouTube has put on the page and nothing
 * else: Chrono never fetches YouTube's data and never scrolls the page to load more.
 */
export async function startPlaylistPage(ctx: ContentScriptContext): Promise<void> {
  let settings = await readSettings();
  if (ctx.isInvalid) return;
  let line: PlaylistSummaryLine | undefined;
  /** YouTube's player speed, while the Speed bridge can reach it. */
  let playerSpeed: number | undefined;
  /** What reads the page, and what stops Chrono watching it, while on a playlist page. */
  let visit: { read: (doc: Document) => Reading<PlaylistPage>; watching: AbortController } | undefined;

  /** Shows the summary the page calls for, or none. */
  function refresh(): void {
    if (ctx.isInvalid) return;
    // With the setting off, Chrono leaves playlist pages alone, as it does every other page.
    if (readPage(location).kind !== 'playlist' || !settings.playlistSummary) {
      stop();
      return;
    }
    if (!visit) {
      const watching = new AbortController();
      watchPlaylistPage(document, refresh, watching.signal);
      visit = { read: createPlaylistPageReader(), watching };
    }
    const page = visit.read(document);
    noteReading('summary', page);
    const summary = page.recognised && playlistSummary({ ...page.value, speed: playerSpeed });
    if (!page.recognised || !summary) {
      removeLine();
      return;
    }
    line ??= createPlaylistSummary(navigator.language);
    // One more row of the stats, after YouTube's own.
    const { stats } = page.value;
    if (line.element.parentNode !== stats || stats.lastElementChild !== line.element) stats.append(line.element);
    line.show(summary);
  }

  function removeLine(): void {
    line?.element.remove();
    line = undefined;
  }

  /**
   * Removes the summary and stops watching the page, until YouTube navigates to a playlist
   * page or the viewer turns the summary back on.
   */
  function stop(): void {
    visit?.watching.abort();
    visit = undefined;
    removeLine();
    clearDiagnostics('playlist');
  }

  connectSpeedBridge(
    document,
    (speed) => {
      playerSpeed = speed.recognised ? speed.value : undefined;
      refresh();
    },
    ctx.signal,
  );
  watchSettings((value) => {
    settings = value;
    refresh();
  }, ctx.signal);
  watchNavigation(document, { started() {}, finished: refresh }, ctx.signal);
  ctx.onInvalidated(stop);
  refresh();
}
