import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createPanel, type Panel } from '@/panel/panel';
import { connectSpeedBridge } from '@/speed-bridge';
import { videoScopeTimes } from '@/time-model';
import { changeSetting, readSettings, watchSettings } from '@/settings';
import { panelExpanded } from '@/ui-state';
import {
  readActiveVideo,
  readMediaSource,
  readPage,
  readSidebarMount,
  readTheme,
  watchNavigation,
  watchTheme,
} from '@/youtube/adapter';

/** The video's events that can change what the Panel shows. */
const VIDEO_EVENTS = ['durationchange', 'timeupdate', 'seeking', 'ratechange', 'play', 'pause'];

/**
 * Keeps one Panel on the watch page, up to date, and only there. Chrono waits, with no
 * timeouts, until the viewer has seen the tab and YouTube has rendered the video and the
 * sidebar. It follows YouTube's navigation and video swaps without a reload, and on every
 * other page it removes the Panel and stops everything the Panel used.
 */
export async function startWatchPage(ctx: ContentScriptContext): Promise<void> {
  // Read while YouTube is still rendering, so the Panel appears the way the viewer left it,
  // or else the way their settings say it starts.
  const [initialSettings, remembered] = await Promise.all([readSettings(), panelExpanded.getValue()]);
  let settings = initialSettings;
  let expanded = remembered ?? settings.panelStartsExpanded;
  if (ctx.isInvalid) return;
  // A tab opened in the background waits until the viewer first looks at it.
  let seen = document.visibilityState === 'visible';
  let panel: Panel | undefined;
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

  // YouTube renders, re-renders and swaps parts of the watch page whenever it likes, so
  // Chrono looks again after every change to the page.
  const observer = new MutationObserver(() => refresh());

  /**
   * Puts the Panel where the page says it belongs, following the page's current video.
   * It updates the Panel only when it moves it or follows another video: the rest of the
   * time, video events and the clock do.
   */
  function refresh(): void {
    if (isOrphaned()) return;
    if (!seen || readPage(location).kind !== 'watch') {
      stop();
      return;
    }
    observer.observe(document, { childList: true, subtree: true });
    const video = readActiveVideo(document);
    const sidebar = readSidebarMount(document);
    if (!video.recognised || !sidebar.recognised) {
      removePanel();
      return;
    }

    panel ??= createPanel({
      locale: navigator.language,
      settings,
      expanded,
      onExpandedChange: (value) => {
        expanded = value;
        void panelExpanded.setValue(value);
      },
      setSpeed: (speed) => speedBridge.set(speed),
      changeSetting: (key, value) => void changeSetting(key, value),
    });
    if (!themeWatch) {
      themeWatch = new AbortController();
      panel.setTheme(readTheme(document));
      watchTheme(document, (theme) => panel?.setTheme(theme), themeWatch.signal);
    }
    // The finish time moves with the clock even when the video doesn't, though nobody
    // sees it move in a hidden tab.
    setClock(document.visibilityState === 'visible');
    const { container, firstBlock, placement } = sidebar.value;
    const moved = firstBlock
      ? panel.element.nextElementSibling !== firstBlock
      : panel.element.parentNode !== container || panel.element !== container.firstElementChild;
    if (moved) {
      if (firstBlock) firstBlock.before(panel.element);
      else container.prepend(panel.element);
    }
    panel.setPlacement(placement);
    const switched = followed?.video !== video.value;
    if (switched) follow(video.value);
    if (moved || switched) render();
  }

  /**
   * Whether the extension has been updated, disabled or removed. Chrome leaves this script
   * running, cut off from the extension; asking the context notices, and stops everything.
   */
  function isOrphaned(): boolean {
    return ctx.isInvalid;
  }

  /** Removes the Panel and stops everything it uses. */
  function removePanel(): void {
    panel?.element.remove();
    panel = undefined;
    setClock(false);
    followed?.listening.abort();
    followed = undefined;
    themeWatch?.abort();
    themeWatch = undefined;
  }

  /** Removes the Panel and stops watching the page until YouTube navigates to a watch page. */
  function stop(): void {
    observer.disconnect();
    removePanel();
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
    followed = { video, listening };
  }

  function render(): void {
    if (isOrphaned() || !panel || !followed) return;
    const { video } = followed;
    const page = readPage(location);
    const now = new Date();
    const times =
      !navigating && page.kind === 'watch' && ownerOf(video, page.videoId) === page.videoId
        ? videoScopeTimes({ position: video.currentTime, duration: video.duration, speed: playerSpeed ?? video.playbackRate, now })
        : undefined;
    panel.showVideo(times, now);
    panel.showSpeed(playerSpeed);
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
      playerSpeed = speed.recognised ? speed.value : undefined;
      render();
    },
    ctx.signal,
  );
  watchSettings((value) => {
    settings = value;
    panel?.setSettings(value);
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
  ctx.onInvalidated(stop);
  refresh();
}
