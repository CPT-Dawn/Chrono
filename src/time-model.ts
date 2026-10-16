// Pure time maths. Vocabulary follows GLOSSARY.md: remaining is always watch time.

export interface VideoSnapshot {
  /** Playhead position, in seconds of content time. */
  position: number;
  /** Length of the video, in seconds of content time. */
  duration: number;
  speed: number;
  now: Date;
}

export interface ScopeTimes {
  /** Watch time left, in seconds: content time left ÷ speed. */
  remaining: number;
  /** Now plus remaining. */
  finishTime: Date;
  speed: number;
}

/** The Video scope's times, or undefined while the video's length isn't known. */
export function videoScopeTimes({ position, duration, speed, now }: VideoSnapshot): ScopeTimes | undefined {
  if (!Number.isFinite(duration)) return undefined;
  const remaining = (duration - position) / speed;
  return { remaining, finishTime: new Date(now.getTime() + remaining * 1000), speed };
}
