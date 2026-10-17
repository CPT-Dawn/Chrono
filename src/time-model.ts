// Pure time maths. Vocabulary follows GLOSSARY.md: remaining is always watch time.

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
  /** The content time of each entry YouTube has loaded; undefined when it shows none. */
  entryLengths: (number | undefined)[];
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
  /** When YouTube has loaded only part of the playlist: how many entries were counted, of how many. */
  partial?: { counted: number; of: number };
}

/**
 * The Playlist summary, or undefined for a playlist with nothing in it. YouTube leaves
 * unavailable entries out of the list but not out of its count, so once the whole list
 * has loaded, the entries missing from it are the unavailable ones. Before then, the
 * summary can only say how far it got.
 */
export function playlistSummary({ entryCount, entryLengths, moreToLoad, speed }: PlaylistPageState): PlaylistSummary | undefined {
  if (entryCount === 0) return undefined;
  const lengths = entryLengths.filter((length) => length !== undefined);
  const contentTime = lengths.reduce((sum, length) => sum + length, 0);
  const loaded = entryLengths.length;
  const partial = moreToLoad && loaded < entryCount;
  const hidden = partial ? 0 : Math.max(0, entryCount - loaded);
  // At 1× the watch time is the content time, which the summary already says.
  const knownSpeed = speed !== undefined && Number.isFinite(speed) && speed > 0 && !sameSpeed(speed, 1);
  return {
    contentTime,
    atSpeed: knownSpeed ? { watchTime: contentTime / speed, speed } : undefined,
    unavailable: loaded - lengths.length + hidden,
    partial: partial ? { counted: loaded, of: entryCount } : undefined,
  };
}

function timesAtSpeed(contentLeft: number, speed: number, now: Date): TimesAtSpeed {
  const remaining = contentLeft / speed;
  return { remaining, finishTime: new Date(now.getTime() + remaining * 1000), speed };
}
