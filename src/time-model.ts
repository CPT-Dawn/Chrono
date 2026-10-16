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

/** The Video scope's times, or undefined while the video's length isn't known. */
export function videoScopeTimes({ position, duration, speed, now }: VideoSnapshot): ScopeTimes | undefined {
  if (!Number.isFinite(duration)) return undefined;
  return scopeTimes(duration - position, speed, now);
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
