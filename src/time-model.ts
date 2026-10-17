// Pure time maths. Vocabulary follows GLOSSARY.md: remaining is always watch time.
import type { Playlist } from '@/youtube/adapter';

export interface VideoSnapshot {
  /** Playhead position, in seconds of content time. */
  position: number;
  /** Length of the video, in seconds of content time. */
  duration: number;
  speed: number;
  now: Date;
}

/** A scope's remaining and finish time at one speed. */
export interface TimesAtSpeed {
  /** Watch time left, in seconds: content time left ÷ speed. */
  remaining: number;
  /** Now plus remaining. */
  finishTime: Date;
  speed: number;
}

/** A row of a scope's speed table. */
export interface SpeedTableRow extends TimesAtSpeed {
  /** Whether this row is the current speed. */
  current: boolean;
}

/** A scope's times at the current speed, and its speed table. */
export interface ScopeTimes extends TimesAtSpeed {
  /** Rows from slowest to fastest. */
  speedTable: SpeedTableRow[];
}

/** The common speeds every speed table shows. */
const TABLE_SPEEDS = [1, 1.25, 1.5, 1.75, 2];

/**
 * Whether two speeds are the same speed. YouTube's player can report a speed with
 * floating-point noise, such as 1.2500000000000002 for 1.25×.
 */
function sameSpeed(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

export interface VideoState extends VideoSnapshot {
  /** Whether YouTube is playing an ad in the video element instead of the video. */
  adBreak: boolean;
  /** Whether YouTube's player says the video is live, or a premiere still to start. */
  live: boolean;
}

/** What the Video scope shows. */
export type VideoScope =
  | { kind: 'times'; times: ScopeTimes }
  /** An ad is playing: the video element's times are the ad's, so nothing is worked out. */
  | { kind: 'ad-break' }
  /** The video has no fixed end, so it has no remaining or finish time. */
  | { kind: 'live' }
  /** The video's times aren't known yet. */
  | { kind: 'unknown' };

/** What the Video scope shows, given the video's state. */
export function videoScope(state: VideoState): VideoScope {
  if (state.adBreak) return { kind: 'ad-break' };
  // A browser gives a stream with no end an infinite length.
  if (state.live || state.duration === Infinity) return { kind: 'live' };
  const times = videoScopeTimes(state);
  return times ? { kind: 'times', times } : { kind: 'unknown' };
}

/** The Video scope's times, or undefined while the video's length isn't known. */
export function videoScopeTimes({ position, duration, speed, now }: VideoSnapshot): ScopeTimes | undefined {
  if (![duration, position, speed].every(Number.isFinite) || speed <= 0) return undefined;
  // YouTube's player sometimes reports a position past the video's end.
  return scopeTimes(Math.max(0, duration - position), speed, now);
}

/** What the Playlist scope shows. */
export type PlaylistScope =
  /** No playlist, a Mix, or nothing to work out while the Video scope has no times. */
  | { kind: 'none' }
  /** YouTube plays the entries in an order nobody knows yet, so there is no estimate. */
  | { kind: 'shuffle' }
  | {
      kind: 'times';
      times: ScopeTimes;
      /** The number of the entry YouTube is playing: the earliest possible target entry. */
      current: number;
      /** The number of the last entry the scope counts. */
      target: number;
      /** The latest possible target entry. */
      last: number;
      /** When the scope runs past the entries YouTube has loaded: how many are counted, of how many. */
      partial: { counted: number; total: number } | undefined;
      /** How many unavailable entries the scope skips. */
      unavailable: number;
    };

export interface PlaylistState {
  video: VideoState;
  /** The video in the address, which the playlist's playing entry must be. */
  videoId: string;
  playlist: Playlist | undefined;
  /** The entry number the viewer chose to count up to, if any. The last entry otherwise. */
  target: number | undefined;
}

/**
 * The Playlist scope: the current video's remaining plus every following entry up to and
 * including the target entry. Only entries YouTube has loaded count, and unavailable ones
 * are skipped.
 */
export function playlistScope({ video, videoId, playlist, target }: PlaylistState): PlaylistScope {
  const scope = videoScope(video);
  if (!playlist || playlist.kind === 'mix' || scope.kind !== 'times') return { kind: 'none' };
  if (playlist.shuffle) return { kind: 'shuffle' };
  const { entries, total, hiddenUnavailable } = playlist;
  const playing = entries.findIndex((entry) => entry.selected);
  // Just after YouTube moves to another video, its panel may still show the previous one.
  if (playing === -1 || entries[playing]!.videoId !== videoId) return { kind: 'none' };

  const current = entries[playing]!.number;
  const lastLoaded = entries.at(-1)!.number;
  const loaded = entries.length + hiddenUnavailable;
  // YouTube doesn't number the entries it hides, so they don't count towards the last number.
  const last = loaded >= total ? lastLoaded : Math.max(lastLoaded, total - hiddenUnavailable);
  const until = Math.min(Math.max(target ?? last, current), last);
  const following = entries.slice(playing + 1).filter((entry) => entry.number <= until);
  const contentLeft =
    Math.max(0, video.duration - video.position) +
    following.reduce((sum, entry) => sum + (entry.duration ?? 0), 0);
  return {
    kind: 'times',
    times: scopeTimes(contentLeft, video.speed, video.now),
    current,
    target: until,
    last,
    partial: until > lastLoaded ? { counted: loaded, total } : undefined,
    unavailable: following.filter((entry) => entry.duration === undefined).length + hiddenUnavailable,
  };
}

/** A scope's times, given the content time it has left. Any scope can use it. */
export function scopeTimes(contentLeft: number, speed: number, now: Date): ScopeTimes {
  const isCommon = TABLE_SPEEDS.some((common) => sameSpeed(common, speed));
  const speeds = isCommon ? TABLE_SPEEDS : [...TABLE_SPEEDS, speed].sort((a, b) => a - b);
  return {
    ...timesAtSpeed(contentLeft, speed, now),
    speedTable: speeds.map((rowSpeed) => ({
      ...timesAtSpeed(contentLeft, rowSpeed, now),
      current: sameSpeed(rowSpeed, speed),
    })),
  };
}

function timesAtSpeed(contentLeft: number, speed: number, now: Date): TimesAtSpeed {
  const remaining = contentLeft / speed;
  return { remaining, finishTime: new Date(now.getTime() + remaining * 1000), speed };
}
