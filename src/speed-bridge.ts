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
import { type Reading, readPlayerSpeedApi } from '@/youtube/adapter';

/** YouTube's speed range. */
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 2;

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
    const player = readPlayerSpeedApi(doc);
    if (player.recognised) send(doc, MESSAGES.speed, player.value.getPlaybackRate());
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
  // YouTube applies every speed change to its video, whichever control made it. Listening
  // on the document catches the video even after YouTube swaps it for another.
  doc.addEventListener(
    'ratechange',
    (event) => {
      const player = readPlayerSpeedApi(doc);
      if (connected && player.recognised && player.value.contains(event.target as Node)) report();
    },
    { capture: true, signal },
  );
  doc.addEventListener(
    MESSAGES.set,
    (event) => {
      const speed = numberIn(event);
      const player = readPlayerSpeedApi(doc);
      if (speed !== undefined && player.recognised) player.value.setPlaybackRate(speed);
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
 * with an unrecognised reading while the player's speed API can't be reached.
 */
export function connectSpeedBridge(
  doc: Document,
  onSpeed: (speed: Reading<number>) => void,
  signal: AbortSignal,
): SpeedBridge {
  let answered = false;
  const answer = (speed: Reading<number>) => {
    answered = true;
    onSpeed(speed);
  };
  const connect = () => {
    answered = false;
    send(doc, MESSAGES.connect);
    // Events are delivered synchronously, so a loaded page script has answered by now.
    // If it hasn't loaded yet, it announces itself when it does.
    if (!answered) onSpeed({ recognised: false, failed: 'speed' });
  };

  doc.addEventListener(
    MESSAGES.speed,
    (event) => {
      const speed = numberIn(event);
      if (speed !== undefined) answer({ recognised: true, value: speed });
    },
    { signal },
  );
  doc.addEventListener(MESSAGES.unrecognised, () => answer({ recognised: false, failed: 'speed' }), { signal });
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
  return Math.round(clamped * 20) / 20;
}
