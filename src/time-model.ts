// Pure time maths. Vocabulary follows GLOSSARY.md: remaining is always watch time.

import type { Chapter, Playlist } from '@/youtube/adapter';

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
  /** The target the viewer set on the scope, if any. */
  target: Target | undefined;
  /** The speed that meets `target`, when there is one. */
  required: RequiredSpeed | undefined;
}

/** A constraint the viewer sets on a scope. */
export type Target =
  /** Finish the scope by this time. */
  | { kind: 'finish-time'; time: Date }
  /** The viewer has this much watch time, in seconds, for the rest of the scope. */
  | { kind: 'watch-time'; seconds: number };

/** The speed at which a scope's remaining exactly meets its target, or why there is none. */
export type RequiredSpeed =
  /** YouTube's player can play at this speed, rounded to its 0.05× steps. */
  | { kind: 'in-range'; speed: number }
  /** The target needs this speed, rounded to 0.05× steps, which is faster than YouTube's fastest. */
  | { kind: 'too-fast'; speed: number }
  /** The target needs a speed slower than YouTube's slowest. */
  | { kind: 'too-slow' }
  /** The target's finish time has already passed. */
  | { kind: 'passed' }
  /** The target gives no watch time at all. */
  | { kind: 'no-time' }
  /** The scope has nothing left to watch, so any speed meets the target. */
  | { kind: 'finished' };

/** YouTube's speed range. */
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 2;
/** YouTube's speed menu works in 0.05× steps: 20 to each 1×. */
const STEPS_PER_SPEED = 20;

/** `speed` rounded to the nearest of YouTube's 0.05× steps. */
export function roundToSpeedStep(speed: number): number {
  return Math.round(speed * STEPS_PER_SPEED) / STEPS_PER_SPEED;
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

/** What the Video scope shows, given the video's state and the viewer's target for it. */
export function videoScope(state: VideoState, target?: Target): VideoScope {
  if (state.adBreak) return { kind: 'ad-break' };
  // A browser gives a stream with no end an infinite length.
  if (state.live || state.duration === Infinity) return { kind: 'live' };
  const times = videoScopeTimes(state, target);
  return times ? { kind: 'times', times } : { kind: 'unknown' };
}

/** The Video scope's times, or undefined while the video's length isn't known. */
export function videoScopeTimes(
  { position, duration, speed, now }: VideoSnapshot,
  target?: Target,
): ScopeTimes | undefined {
  if (![duration, position, speed].every(Number.isFinite) || speed <= 0) return undefined;
  // YouTube's player sometimes reports a position past the video's end.
  return scopeTimes(Math.max(0, duration - position), speed, now, target);
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
      /** The number of the last entry the scope counts: the target entry. */
      targetEntry: number;
      /** The latest possible target entry. */
      last: number;
      /**
       * When the scope runs past the entries YouTube has loaded: the last loaded entry's
       * number, and how many entries the playlist has.
       */
      partial: { counted: number; total: number } | undefined;
      /** How many unavailable entries the scope skips. */
      unavailable: number;
    };

export interface PlaylistState {
  video: VideoState;
  /** The playlist `video` plays in, if any. Its selected entry is `video`. */
  playlist: Playlist | undefined;
  /** The entry number the viewer chose to count up to, if any. The last entry otherwise. */
  targetEntry: number | undefined;
  /** The viewer's target for the scope, if any. */
  target?: Target;
}

/**
 * The Playlist scope: the current video's remaining plus every following entry up to and
 * including the target entry. Only entries YouTube has loaded count, and unavailable ones
 * are skipped.
 */
export function playlistScope({ video, playlist, targetEntry, target }: PlaylistState): PlaylistScope {
  const scope = videoScope(video);
  if (!playlist || playlist.kind === 'mix' || scope.kind !== 'times') return { kind: 'none' };
  if (playlist.shuffle) return { kind: 'shuffle' };
  const { entries, total, hiddenUnavailable } = playlist;
  const playing = entries.findIndex((entry) => entry.selected);
  if (playing === -1) return { kind: 'none' };

  const current = entries[playing]!.number;
  const lastLoaded = entries.at(-1)!.number;
  const loaded = entries.length + hiddenUnavailable;
  // YouTube doesn't number the entries it hides, so they don't count towards the last number.
  const last = loaded >= total ? lastLoaded : Math.max(lastLoaded, total - hiddenUnavailable);
  const until = Math.min(Math.max(targetEntry ?? last, current), last);
  const following = entries.slice(playing + 1).filter((entry) => entry.number <= until);
  const contentLeft =
    Math.max(0, video.duration - video.position) +
    following.reduce((sum, entry) => sum + (entry.duration ?? 0), 0);
  return {
    kind: 'times',
    times: scopeTimes(contentLeft, video.speed, video.now, target),
    current,
    targetEntry: until,
    last,
    partial: until > lastLoaded ? { counted: lastLoaded, total } : undefined,
    // YouTube says only how many entries it hid, not where they are, so the scope counts
    // them when it runs to the end of the playlist.
    unavailable:
      following.filter((entry) => entry.duration === undefined).length + (until === last ? hiddenUnavailable : 0),
  };
}

/** What the Chapter scope shows: the chapter the playhead is in. */
export interface ChapterScope {
  title: string;
  times: ScopeTimes;
}

/**
 * The Chapter scope, given the video's chapters in order and the viewer's target for it, or
 * undefined when the video has none or its times aren't known.
 */
export function chapterScope(
  chapters: readonly Chapter[],
  { position, duration, speed, now }: VideoSnapshot,
  target?: Target,
): ChapterScope | undefined {
  if (![duration, position, speed].every(Number.isFinite) || speed <= 0) return undefined;
  const last = chapters.at(-1);
  // Chapters that don't fit in the video are another video's.
  if (!last || last.start >= duration) return undefined;
  const index = Math.max(0, chapters.findLastIndex((chapter) => chapter.start <= position));
  const end = chapters[index + 1]?.start ?? duration;
  return { title: chapters[index]!.title, times: scopeTimes(Math.max(0, end - position), speed, now, target) };
}

/** A scope's times, given the content time it has left and the viewer's target for it. */
function scopeTimes(contentLeft: number, speed: number, now: Date, target: Target | undefined): ScopeTimes {
  const isCommon = TABLE_SPEEDS.some((common) => sameSpeed(common, speed));
  const speeds = isCommon ? TABLE_SPEEDS : [...TABLE_SPEEDS, speed].sort((a, b) => a - b);
  return {
    ...timesAtSpeed(contentLeft, speed, now),
    speedTable: speeds.map((rowSpeed) => ({
      ...timesAtSpeed(contentLeft, rowSpeed, now),
      current: sameSpeed(rowSpeed, speed),
    })),
    target,
    required: target && requiredSpeed(contentLeft, target, now),
  };
}

/** The speed at which `contentLeft` seconds of content take exactly the watch time `target` allows. */
function requiredSpeed(contentLeft: number, target: Target, now: Date): RequiredSpeed {
  const available = target.kind === 'finish-time' ? (target.time.getTime() - now.getTime()) / 1000 : target.seconds;
  if (available <= 0) return { kind: target.kind === 'finish-time' ? 'passed' : 'no-time' };
  if (contentLeft <= 0) return { kind: 'finished' };
  // A speed that rounds into YouTube's range is one YouTube can play, near enough.
  const speed = roundToSpeedStep(contentLeft / available);
  if (speed > MAX_SPEED) return { kind: 'too-fast', speed };
  if (speed < MIN_SPEED) return { kind: 'too-slow' };
  return { kind: 'in-range', speed };
}

/** How long ago a clock time can be and still mean today, a time that has just passed. */
const RECENT_PAST_MS = 60 * 60_000;

/**
 * The time a finish-time target means when the viewer enters only a clock time: the next
 * time the clock shows `hours`:`minutes`, unless it showed it within the last hour. So at
 * 3 PM, 4:00 AM means tomorrow morning and 2:30 PM means a time that has just passed.
 */
export function upcomingClockTime(hours: number, minutes: number, now: Date): Date {
  const time = new Date(now);
  time.setHours(hours, minutes, 0, 0);
  if (time.getTime() < now.getTime() - RECENT_PAST_MS) time.setDate(time.getDate() + 1);
  return time;
}

function timesAtSpeed(contentLeft: number, speed: number, now: Date): TimesAtSpeed {
  const remaining = contentLeft / speed;
  return { remaining, finishTime: new Date(now.getTime() + remaining * 1000), speed };
}
