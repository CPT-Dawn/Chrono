import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { clearDiagnostics, failedParts, noteReading } from '@/diagnostics';
import { answerPageReports, openLink } from '@/link-requests';
import { linkWantsPage, type PageReport } from '@/links';
import { createPanel, type Panel } from '@/panel/panel';
import { createPlayerBadge, type PlayerBadge } from '@/player-badge/player-badge';
import { connectSpeedBridge } from '@/speed-bridge';
import {
  type ChapterScope,
  chapterScope,
  type PlaylistScope,
  playlistScope,
  type Target,
  type VideoScope,
  type VideoSnapshot,
  type VideoState,
  videoScope,
} from '@/time-model';
import { changeSetting, readSettings, watchSettings } from '@/settings';
import {
  type Page,
  type Playlist,
  type Reading,
  readActiveVideo,
  readAdBreak,
  readChapters,
  readLive,
  readMediaSource,
  readPage,
  readPlayerVariant,
  readPlaylist,
  readSidebarMount,
  readTheme,
  readTimeDisplayMount,
  watchNavigation,
  watchPlayerState,
  watchPlaylist,
  watchTheme,
} from '@/youtube/adapter';

/** What YouTube's player says about the video it is playing. */
type PlayerState = Pick<VideoState, 'adBreak' | 'live'>;

/** The video's events that can change what the Panel shows. */
const VIDEO_EVENTS = ['durationchange', 'timeupdate', 'seeking', 'ratechange', 'play', 'pause'];

/**
 * Keeps one Panel and one Player badge on the watch page, up to date, and only there.
 * Chrono waits, with no timeouts, until the viewer has seen the tab and YouTube has
 * rendered the video and the sidebar (for the Panel) or the player's time display (for the
 * badge). It follows YouTube's navigation and video swaps without a reload, and on every
 * other page it removes both and stops everything they used.
 */
export async function startWatchPage(ctx: ContentScriptContext): Promise<void> {
  // Read while YouTube is still rendering, so the Panel appears the way the viewer left it.
  let settings = await readSettings();
  if (ctx.isInvalid) return;
  // A tab opened in the background waits until the viewer first looks at it.
  let seen = document.visibilityState === 'visible';
  let panel: Panel | undefined;
  let badge: PlayerBadge | undefined;
  /** The time display's duration, which the Player badge goes right after while it shows. */
  let badgeAnchor: Element | undefined;
  /** The once-a-second tick that keeps the finish time moving with the clock. */
  let clock: ReturnType<typeof setInterval> | undefined;
  /** The video the Panel describes, and what stops Chrono listening to it. */
  let followed: { video: HTMLVideoElement; listening: AbortController } | undefined;
  /**
   * Which video the video element's media belongs to. YouTube loads the next video into
   * the same element a little after it changes the address, so for a moment the address
   * names the next video while the element still plays the previous one. Chrono keeps
   * this after it leaves a watch page, because the element outlives the page.
   */
  let media: { video: HTMLVideoElement; source: string; videoId: string } | undefined;
  /**
   * Whether YouTube is navigating, when the address and the video may not agree yet. The
   * Panel shows no times then, and new media waits until the address has settled. In Oct
   * 2026 YouTube finished every navigation it started, even ones that failed offline.
   */
  let navigating = false;
  /** What stops the Panel following YouTube's theme. */
  let themeWatch: AbortController | undefined;
  /** YouTube's player speed, while the Speed bridge can reach it. */
  let playerSpeed: number | undefined;
  /** What the player said about its video when the Panel was last updated. */
  let shownPlayerState: PlayerState | undefined;
  /**
   * The playlist as Chrono last read it, at which address. The Panel updates several times
   * a second, so Chrono reads the playlist again only when YouTube changes its panel or
   * the address.
   */
  let playlistCache: { href: string; reading: Reading<Playlist | undefined> } | undefined;
  /**
   * The entry the viewer chose to count the Playlist scope up to and the target they set on
   * the Playlist scope, in which playlist. They last while the viewer stays in that
   * playlist, and are never stored.
   */
  let playlistTargets: { listId: string; entry?: number; target?: Target } | undefined;
  /**
   * The targets the viewer set on the Video and Chapter scopes, for which video, and the
   * Chapter target for which chapter, by its start. They clear when the Panel moves to
   * another video, the Chapter target when playback enters another chapter, and they are
   * never stored.
   */
  let videoTargets: { videoId: string; video?: Target; chapter?: { start: number; target: Target } } | undefined;
  /** The video the Panel last described, which a new Video or Chapter target is for. */
  let shownVideoId: string | undefined;
  /** The start of the chapter the Panel last described, which a new Chapter target is for. */
  let shownChapterStart: number | undefined;

  // YouTube renders, re-renders and swaps parts of the watch page whenever it likes, so
  // Chrono looks again after every change to the page.
  const observer = new MutationObserver(() => refresh());

  /**
   * Puts the Panel and the Player badge where the page says they belong, following the
   * page's current video. It updates them only when it moves one or follows another video:
   * the rest of the time, video events and the clock do.
   */
  function refresh(): void {
    if (isOrphaned()) return;
    if (!seen || readPage(location).kind !== 'watch') {
      stop();
      return;
    }
    observer.observe(document, { childList: true, subtree: true });
    const video = readActiveVideo(document);
    noteReading('video', video);
    if (!video.recognised) {
      removeSurfaces();
      return;
    }
    // The Panel and the Player badge each step aside alone when their part of the page
    // isn't recognised.
    const panelMoved = placePanel();
    const badgeMoved = placeBadge();
    if (!panel && !badge) {
      removeSurfaces();
      return;
    }
    // The finish time moves with the clock even when the video doesn't, though nobody
    // sees it move in a hidden tab.
    setClock(document.visibilityState === 'visible');
    const switched = followed?.video !== video.value;
    if (switched) follow(video.value);
    if (panelMoved || badgeMoved || switched) render();
  }

  /**
   * Puts the Panel above the sidebar's blocks, or removes it when the sidebar isn't
   * recognised. Returns whether it moved.
   */
  function placePanel(): boolean {
    const sidebar = readSidebarMount(document);
    noteReading('sidebar', sidebar);
    if (!sidebar.recognised) {
      removePanel();
      return false;
    }
    panel ??= createPanel({
      locale: navigator.language,
      settings,
      setSpeed: (speed) => speedBridge.set(speed),
      changeSetting: (key, value) => void changeSetting(key, value),
      setPlaylistTargetEntry(entry) {
        setPlaylistTargets({ entry });
      },
      setTarget(scope, target) {
        if (scope === 'playlist') {
          setPlaylistTargets({ target });
          return;
        }
        if (!shownVideoId) return;
        if (videoTargets?.videoId !== shownVideoId) videoTargets = { videoId: shownVideoId };
        if (scope === 'video') videoTargets.video = target;
        if (scope === 'chapter' && shownChapterStart !== undefined) {
          videoTargets.chapter = target && { start: shownChapterStart, target };
        }
        render();
      },
      openLink: (link) => void openLink(link, linkWantsPage(link) ? readPageReport() : undefined),
    });
    if (!themeWatch) {
      themeWatch = new AbortController();
      panel.setTheme(readTheme(document));
      watchTheme(document, (theme) => panel?.setTheme(theme), themeWatch.signal);
    }
    const { container, firstBlock, placement } = sidebar.value;
    const moved = firstBlock
      ? panel.element.nextElementSibling !== firstBlock
      : panel.element.parentNode !== container || panel.element !== container.firstElementChild;
    if (moved) {
      if (firstBlock) firstBlock.before(panel.element);
      else container.prepend(panel.element);
    }
    panel.setPlacement(placement);
    return moved;
  }

  /**
   * Readies the Player badge for the time display's duration, or removes it when the
   * viewer has turned it off or the player's layout isn't recognised. Then Chrono adds
   * nothing to the player at all. Returns whether the badge is new or moved.
   */
  function placeBadge(): boolean {
    const mount = readTimeDisplayMount(document);
    // A layout Chrono doesn't recognise is worth reporting even while the badge is off.
    noteReading('badge', mount);
    if (!mount.recognised || !settings.playerBadge) {
      removeBadge();
      return false;
    }
    const created = !badge;
    badge ??= createPlayerBadge(navigator.language);
    badgeAnchor = mount.value.duration;
    return attachBadge() || created;
  }

  /**
   * Puts the Player badge right after the time display's duration while it shows a finish
   * time, and takes it out while it shows none: during an ad break, when YouTube's times
   * are the ad's, the time display stays exactly as YouTube made it. Returns whether it
   * moved.
   */
  function attachBadge(): boolean {
    if (!badge || !badgeAnchor) return false;
    const shown = !badge.element.hidden;
    const attached = badgeAnchor.nextElementSibling === badge.element;
    if (shown === attached) return false;
    if (shown) badgeAnchor.after(badge.element);
    else badge.element.remove();
    return true;
  }

  /**
   * Whether the extension has been updated, disabled or removed. Chrome leaves this script
   * running, cut off from the extension; asking the context notices, and stops everything.
   */
  function isOrphaned(): boolean {
    return ctx.isInvalid;
  }

  /** Removes the Panel and stops it following YouTube's theme. */
  function removePanel(): void {
    panel?.element.remove();
    panel = undefined;
    themeWatch?.abort();
    themeWatch = undefined;
    playlistCache = undefined;
  }

  /** Takes the Player badge out of the player, leaving YouTube's time display as it was. */
  function removeBadge(): void {
    badge?.element.remove();
    badge = undefined;
    badgeAnchor = undefined;
  }

  /** Removes the Panel and the Player badge, and stops everything they use. */
  function removeSurfaces(): void {
    removePanel();
    removeBadge();
    setClock(false);
    followed?.listening.abort();
    followed = undefined;
  }

  /**
   * Removes everything Chrono shows and stops watching the page until YouTube navigates to
   * a watch page.
   */
  function stop(): void {
    observer.disconnect();
    removeSurfaces();
    playlistTargets = undefined;
    videoTargets = undefined;
    clearDiagnostics('watch');
  }

  /** Changes what the viewer chose for the Playlist scope of the playlist the Panel shows. */
  function setPlaylistTargets(change: { entry?: number; target?: Target }): void {
    const reading = playlistCache?.reading;
    if (reading?.recognised && reading.value) {
      const listId = reading.value.id;
      playlistTargets = { ...(playlistTargets?.listId === listId ? playlistTargets : {}), listId, ...change };
    }
    render();
  }

  function setClock(running: boolean): void {
    if (running) {
      clock ??= setInterval(render, 1000);
    } else {
      clearInterval(clock);
      clock = undefined;
    }
  }

  function follow(video: HTMLVideoElement): void {
    followed?.listening.abort();
    const listening = new AbortController();
    for (const type of VIDEO_EVENTS) video.addEventListener(type, render, { signal: listening.signal });
    // YouTube starts and ends an ad break without always firing a video event.
    watchPlayerState(document, playerStateChanged, listening.signal);
    watchPlaylist(document, playlistChanged, listening.signal);
    followed = { video, listening };
  }

  function render(): void {
    if (isOrphaned() || !followed || (!panel && !badge)) return;
    const { video } = followed;
    const page = readPage(location);
    const now = new Date();
    const state = readPlayerState();
    shownPlayerState = state;
    /** The video the Panel describes, while the address and the video agree on it. */
    const videoId =
      !navigating && page.kind === 'watch' && ownerOf(video, page.videoId) === page.videoId ? page.videoId : undefined;
    const snapshot: VideoSnapshot = {
      position: video.currentTime,
      duration: video.duration,
      speed: playerSpeed ?? video.playbackRate,
      now,
    };
    // Moving to another video clears the targets set on the previous one.
    if (videoId && videoTargets && videoTargets.videoId !== videoId) videoTargets = undefined;
    shownVideoId = videoId;
    const videoState: VideoState | undefined = videoId ? { ...snapshot, ...state } : undefined;
    const scope: VideoScope = videoState ? videoScope(videoState, videoTargets?.video) : { kind: 'unknown' };
    panel?.showVideo(scope, now);
    // During an ad or on live content there is no chapter to speak of either.
    const chapter = videoId && scope.kind === 'times' ? currentChapter(videoId, snapshot) : undefined;
    shownChapterStart = chapter?.start;
    panel?.showChapter(chapter, now);
    panel?.showPlaylist(currentPlaylistScope(videoState, page), now);
    panel?.showSpeed(playerSpeed);
    badge?.show(scope, now, settings.clockFormat);
    attachBadge();
  }

  /**
   * The chapter of `videoId` that the playhead is in, when YouTube's chapters can be read.
   * Chrono reads them even while the Chapter scope is hidden, so that a report says
   * whether it could.
   */
  function currentChapter(videoId: string, snapshot: VideoSnapshot): ChapterScope | undefined {
    const chapters = readChapters(document, videoId);
    noteReading('chapters', chapters);
    if (!chapters.recognised) return undefined;
    let scope = chapterScope(chapters.value, snapshot, videoTargets?.chapter?.target);
    // Entering another chapter clears the target set on the previous one.
    if (scope && videoTargets?.chapter && videoTargets.chapter.start !== scope.start) {
      videoTargets.chapter = undefined;
      scope = chapterScope(chapters.value, snapshot);
    }
    return scope;
  }

  /** The Playlist scope for the video in `videoState`, the video the address names. */
  function currentPlaylistScope(videoState: VideoState | undefined, page: Page): PlaylistScope {
    const reading = readCurrentPlaylist();
    noteReading('playlist', reading);
    if (!reading.recognised) return { kind: 'none' };
    // Leaving the playlist, or moving to another, forgets the target entry and the target.
    if (reading.value?.id !== playlistTargets?.listId) playlistTargets = undefined;
    if (!videoState || page.kind !== 'watch') return { kind: 'none' };
    const playlist = reading.value;
    // Just after YouTube moves to another video, its panel may still show the previous one.
    const stale =
      playlist?.kind === 'playlist' && playlist.entries.find((entry) => entry.selected)?.videoId !== page.videoId;
    return playlistScope({
      video: videoState,
      playlist: stale ? undefined : playlist,
      targetEntry: playlistTargets?.entry,
      target: playlistTargets?.target,
    });
  }

  /**
   * The playlist at the current address. A reading Chrono didn't recognise isn't kept, so
   * Chrono looks again on the next update, as when YouTube hasn't rendered its panel yet.
   */
  function readCurrentPlaylist(): Reading<Playlist | undefined> {
    if (playlistCache?.href === location.href) return playlistCache.reading;
    const reading = readPlaylist(document, location);
    playlistCache = reading.recognised ? { href: location.href, reading } : undefined;
    return reading;
  }

  /** YouTube changed its playlist panel. */
  function playlistChanged(): void {
    playlistCache = undefined;
    render();
  }

  /** What YouTube's player says about the video it is playing. */
  function readPlayerState(): PlayerState {
    const adBreak = readAdBreak(document);
    const live = readLive(document);
    noteReading('ads', adBreak);
    noteReading('live', live);
    // Markup Chrono doesn't know never pauses the Panel.
    return { adBreak: adBreak.recognised && adBreak.value, live: live.recognised && live.value };
  }

  /**
   * What "Report it" says about the page, read when the viewer asks: which player and
   * layout YouTube gave them, and what Chrono couldn't recognise. Undefined off a watch page.
   */
  function readPageReport(): PageReport | undefined {
    if (isOrphaned() || readPage(location).kind !== 'watch') return undefined;
    const player = readPlayerVariant(document);
    const sidebar = readSidebarMount(document);
    noteReading('player', player);
    noteReading('sidebar', sidebar);
    return {
      player: player.recognised ? player.value : undefined,
      layout: sidebar.recognised ? sidebar.value.placement : undefined,
      failed: failedParts(),
    };
  }

  /** YouTube changed its player, which most often means nothing to the Panel. */
  function playerStateChanged(): void {
    const state = readPlayerState();
    if (state.adBreak !== shownPlayerState?.adBreak || state.live !== shownPlayerState.live) render();
  }

  /**
   * Which video `video`'s media belongs to. Media Chrono hasn't seen before belongs to the
   * video in the address, `addressVideoId`.
   */
  function ownerOf(video: HTMLVideoElement, addressVideoId: string): string {
    const source = readMediaSource(video);
    if (media?.video !== video || media.source !== source) media = { video, source, videoId: addressVideoId };
    return media.videoId;
  }

  const speedBridge = connectSpeedBridge(
    document,
    (speed) => {
      // While the miniplayer holds YouTube's player, the watch page has no player to ask,
      // which says nothing about whether Chrono knows its speed API.
      if (speed.recognised || readPlayerVariant(document).recognised) noteReading('speed', speed);
      playerSpeed = speed.recognised ? speed.value : undefined;
      render();
    },
    ctx.signal,
  );
  watchSettings((value) => {
    settings = value;
    panel?.setSettings(value);
    // The Player badge comes and goes with its setting. Rendering again after that applies
    // the rest, such as the clock format, when nothing moved.
    refresh();
    render();
  }, ctx.signal);
  watchNavigation(
    document,
    {
      started() {
        navigating = true;
        render();
      },
      finished() {
        navigating = false;
        refresh();
        render();
      },
    },
    ctx.signal,
  );
  document.addEventListener(
    'visibilitychange',
    () => {
      seen ||= document.visibilityState === 'visible';
      refresh();
      // The clock didn't tick while the tab was hidden.
      render();
    },
    { signal: ctx.signal },
  );
  answerPageReports(readPageReport, ctx.signal);
  ctx.onInvalidated(stop);
  refresh();
}
