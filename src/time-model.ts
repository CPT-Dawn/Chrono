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
  target: number | undefined;
}

/**
 * The Playlist scope: the current video's remaining plus every following entry up to and
 * including the target entry. Only entries YouTube has loaded count, and unavailable ones
 * are skipped.
 */
export function playlistScope({ video, playlist, target }: PlaylistState): PlaylistScope {
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

/** What a playlist page shows of its playlist. */
export interface PlaylistPageState {
  /** How many entries YouTube says the playlist has, counting any it hides. */
  entryCount: number;
  /**
   * The content time of each entry YouTube has loaded: undefined for an unavailable entry,
   * and unknown for an available one whose length Chrono can't read.
   */
  entryLengths: (number | 'unknown' | undefined)[];
  /** Whether YouTube has more entries to load. */
  moreToLoad: boolean;
  /** The viewer's YouTube speed, when Chrono can read it. */
  speed: number | undefined;
}

/** What the Playlist summary says. */
export interface PlaylistSummary {
  /** The content time of every available entry counted, each at full length. */
  contentTime: number;
  /** The watch time at the viewer's speed, unless the speed is unknown or 1×. */
  atSpeed?: { watchTime: number; speed: number };
  /** How many entries are unavailable: shown with no length, or hidden by YouTube. */
  unavailable: number;
  /**
   * When the summary counts only part of the playlist: how many entries were counted, of
   * how many, and whether those are the first ones, because YouTube hasn't loaded the rest.
   */
  partial?: { counted: number; of: number; first: boolean };
}

/**
 * The Playlist summary, or undefined for a playlist with nothing in it. YouTube leaves
 * unavailable entries out of the list but not out of its count, so once the whole list
 * has loaded, the entries missing from it are the unavailable ones. Before then, the
 * summary can only say how far it got. An available entry whose length Chrono can't read
 * is left out of the total, and the summary says so too.
 */
export function playlistSummary({ entryCount, entryLengths, moreToLoad, speed }: PlaylistPageState): PlaylistSummary | undefined {
  if (entryCount === 0) return undefined;
  const lengths = entryLengths.filter((length) => typeof length === 'number');
  const contentTime = lengths.reduce((sum, length) => sum + length, 0);
  const unknown = entryLengths.filter((length) => length === 'unknown').length;
  const loaded = entryLengths.length;
  const loading = moreToLoad && loaded < entryCount;
  const hidden = loading ? 0 : Math.max(0, entryCount - loaded);
  const counted = (loading ? loaded : entryCount) - unknown;
  // At 1× the watch time is the content time, which the summary already says.
  const knownSpeed = speed !== undefined && Number.isFinite(speed) && speed > 0 && !sameSpeed(speed, 1);
  return {
    contentTime,
    atSpeed: knownSpeed ? { watchTime: contentTime / speed, speed } : undefined,
    unavailable: loaded - lengths.length - unknown + hidden,
    partial: counted < entryCount ? { counted, of: entryCount, first: unknown === 0 } : undefined,
  };
}

function timesAtSpeed(contentLeft: number, speed: number, now: Date): TimesAtSpeed {
  const remaining = contentLeft / speed;
  return { remaining, finishTime: new Date(now.getTime() + remaining * 1000), speed };
}
