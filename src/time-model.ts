// Pure time maths. Vocabulary follows GLOSSARY.md: remaining is always watch time.

import type { Chapter } from '@/youtube/adapter';

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

/** What the Chapter scope shows: the chapter the playhead is in. */
export interface ChapterScope {
  title: string;
  times: ScopeTimes;
}

/**
 * The Chapter scope, given the video's chapters in order, or undefined when the video has
 * none or its times aren't known.
 */
export function chapterScope(chapters: readonly Chapter[], { position, duration, speed, now }: VideoSnapshot): ChapterScope | undefined {
  if (![duration, position, speed].every(Number.isFinite) || speed <= 0) return undefined;
  const last = chapters.at(-1);
  // Chapters that don't fit in the video are another video's.
  if (!last || last.start >= duration) return undefined;
  const index = Math.max(0, chapters.findLastIndex((chapter) => chapter.start <= position));
  const end = chapters[index + 1]?.start ?? duration;
  return { title: chapters[index]!.title, times: scopeTimes(Math.max(0, end - position), speed, now) };
}

/** A scope's times, given the content time it has left. */
function scopeTimes(contentLeft: number, speed: number, now: Date): ScopeTimes {
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
