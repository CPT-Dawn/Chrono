// The demo video's stage: Chrono's real Panel, fed by the real time model, standing in
// for a watch page. The video's director drives it as a viewer would, by clicking the
// Panel's own buttons; this file plays YouTube's part, answering speed changes and
// targets the way watch-page.ts does.
import './browser-shim';
import { createPanel, type Panel } from '@/panel/panel';
import { DEFAULT_SETTINGS, type Settings } from '@/settings';
import { chapterScope, playlistScope, videoScope, type Target, type VideoState } from '@/time-model';
import type { Chapter, Playlist } from '@/youtube/adapter';

export interface StageOptions {
  /** Content time, in seconds. */
  duration: number;
  position: number;
  speed: number;
  chapters?: Chapter[];
  playlist?: Playlist;
  theme?: 'light' | 'dark';
  settings?: Partial<Settings>;
}

export interface Stage {
  panel: Panel;
  element: HTMLElement;
  /** The speed YouTube plays at now. */
  readonly speed: number;
  /** Moves the playhead, as playing does. */
  setPosition(position: number): void;
  /** Shows everything again with the time now. */
  refresh(): void;
}

export function createStage(options: StageOptions): Stage {
  let { duration, position, speed } = options;
  let settings: Settings = { ...DEFAULT_SETTINGS, ...options.settings };
  const targets: { video?: Target; chapter?: Target; playlist?: Target } = {};
  let targetEntry: number | undefined;

  const panel = createPanel({
    locale: 'en-US',
    settings,
    setSpeed(next) {
      speed = next;
      panel.showSpeed(speed);
      refresh();
    },
    changeSetting(key, value) {
      settings = { ...settings, [key]: value };
      panel.setSettings(settings);
      refresh();
    },
    setPlaylistTargetEntry(entry) {
      targetEntry = entry;
      refresh();
    },
    setTarget(scope, target) {
      targets[scope] = target;
      refresh();
    },
    openLink() {},
  });

  function refresh() {
    const now = new Date();
    const video: VideoState = { position, duration, speed, now, adBreak: false, live: false };
    panel.showVideo(videoScope(video, targets.video), now);
    panel.showChapter(options.chapters ? chapterScope(options.chapters, video, targets.chapter) : undefined, now);
    panel.showPlaylist(playlistScope({ video, playlist: options.playlist, targetEntry, target: targets.playlist }), now);
  }

  panel.setTheme(options.theme ?? 'dark');
  panel.setPlacement('sidebar');
  panel.showSpeed(speed);
  refresh();

  return {
    panel,
    element: panel.element,
    get speed() {
      return speed;
    },
    setPosition(next) {
      position = next;
      refresh();
    },
    refresh,
  };
}

(globalThis as unknown as { createStage: typeof createStage }).createStage = createStage;
