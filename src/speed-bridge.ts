// The Speed bridge. Chrono's speed is YouTube's player speed, so YouTube's menu, its
// shortcuts and hold-for-2× stay in sync with Chrono. Only a script in the page's own
// context can reach YouTube's player, so this module has two halves that talk through
// events on the document:
//
// - `servePlayerSpeed` runs in the page's context and talks to YouTube's player;
// - `connectSpeedBridge` runs in the content script and gives Chrono the speed.
//
// Firefox hides objects that cross between page scripts and content scripts, so every
// message carries a plain number or nothing.
import { type Reading, readPlayerSpeed, setPlayerSpeed, watchPlayerSpeed } from '@/youtube/adapter';

/** YouTube's speed range. */
const MIN_SPEED = 0.25;
const MAX_SPEED = 2;
/** YouTube's speed menu works in 0.05× steps: 20 to each 1×. */
const STEPS_PER_SPEED = 20;

const MESSAGES = {
  /** Page → content: the page script has loaded. */
  ready: 'chrono:speed-ready',
  /** Content → page: report the player's speed now and whenever it changes. */
  connect: 'chrono:speed-connect',
  /** Page → content: the player's speed, a number. */
  speed: 'chrono:speed',
  /** Page → content: the player's speed API isn't recognised. */
  unrecognised: 'chrono:speed-unrecognised',
  /** Content → page: set the player's speed to a number. */
  set: 'chrono:speed-set',
} as const;

function send(doc: Document, type: string, detail?: number): void {
  doc.dispatchEvent(new CustomEvent(type, { detail }));
}

function numberIn(event: Event): number | undefined {
  const detail = (event as CustomEvent<unknown>).detail;
  return typeof detail === 'number' && Number.isFinite(detail) ? detail : undefined;
}

/**
 * The page half: answers the content script with YouTube's player speed and applies the
 * speeds it asks for. Returns a function that stops it.
 */
export function servePlayerSpeed(doc: Document): () => void {
  const stop = new AbortController();
  const { signal } = stop;
  let connected = false;

  const report = () => {
    const speed = readPlayerSpeed(doc);
    if (speed.recognised) send(doc, MESSAGES.speed, speed.value);
    else send(doc, MESSAGES.unrecognised);
  };

  doc.addEventListener(
    MESSAGES.connect,
    () => {
      connected = true;
      report();
    },
    { signal },
  );
  watchPlayerSpeed(doc, () => connected && report(), signal);
  doc.addEventListener(
    MESSAGES.set,
    (event) => {
      const speed = numberIn(event);
      if (speed !== undefined) setPlayerSpeed(doc, speed);
    },
    { signal },
  );

  send(doc, MESSAGES.ready);
  return () => stop.abort();
}

export interface SpeedBridge {
  /** Sets YouTube's speed, clamped to YouTube's range and rounded to 0.05× steps. */
  set(speed: number): void;
}

/**
 * The content half: calls `onSpeed` with YouTube's speed now and after every change, or
 * with an unrecognised reading while YouTube's player has no speed API Chrono knows.
 * Until the page half has loaded, `onSpeed` isn't called.
 */
export function connectSpeedBridge(
  doc: Document,
  onSpeed: (speed: Reading<number>) => void,
  signal: AbortSignal,
): SpeedBridge {
  doc.addEventListener(
    MESSAGES.speed,
    (event) => {
      const speed = numberIn(event);
      if (speed !== undefined) onSpeed({ recognised: true, value: speed });
    },
    { signal },
  );
  doc.addEventListener(MESSAGES.unrecognised, () => onSpeed({ recognised: false, failed: 'speed' }), { signal });
  // The browser doesn't promise which script runs first. If the page half is already
  // running, it answers now; if not, it announces itself when it starts.
  const connect = () => send(doc, MESSAGES.connect);
  doc.addEventListener(MESSAGES.ready, connect, { signal });
  connect();

  return {
    set(speed) {
      send(doc, MESSAGES.set, toYouTubeSpeed(speed));
    },
  };
}

/** A speed YouTube's menu can show: within 0.25×–2×, in 0.05× steps. */
function toYouTubeSpeed(speed: number): number {
  const clamped = Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
  return Math.round(clamped * STEPS_PER_SPEED) / STEPS_PER_SPEED;
}
