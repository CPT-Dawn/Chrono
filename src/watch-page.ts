import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createPanel } from '@/panel/panel';
import { videoScopeTimes } from '@/time-model';
import { readActiveVideo, readPageKind, readSidebarMount } from '@/youtube/adapter';

/** Shows the Panel on the current watch page and keeps it up to date. */
export function startWatchPage(ctx: ContentScriptContext): void {
  if (readPageKind(location) !== 'watch') return;
  if (mount(ctx)) return;
  // YouTube renders the watch page after the content script starts. Wait for it with
  // no timeout, because YouTube can take any amount of time.
  const observer = new MutationObserver(() => {
    if (mount(ctx)) observer.disconnect();
  });
  observer.observe(document, { childList: true, subtree: true });
  ctx.onInvalidated(() => observer.disconnect());
}

/** Mounts the Panel if YouTube has rendered what it needs. Returns whether it did. */
function mount(ctx: ContentScriptContext): boolean {
  const video = readActiveVideo(document);
  const sidebar = readSidebarMount(document);
  if (!video.recognised || !sidebar.recognised) return false;

  const panel = createPanel(navigator.language);
  sidebar.value.prepend(panel.element);

  const update = () => {
    const now = new Date();
    const times = videoScopeTimes({
      position: video.value.currentTime,
      duration: video.value.duration,
      speed: video.value.playbackRate,
      now,
    });
    panel.showVideo(times, now);
  };
  for (const type of ['durationchange', 'timeupdate', 'ratechange']) {
    video.value.addEventListener(type, update, { signal: ctx.signal });
  }
  // The finish time moves with the clock even when the video doesn't.
  ctx.setInterval(update, 1000);
  update();
  return true;
}
