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
import { MAX_SPEED, MIN_SPEED, roundToSpeedStep } from '@/time-model';
import {
  type PlayerPlace,
  type Reading,
  readPage,
  readPlayerSpeed,
  setPlayerSpeed,
  watchPlayerAnnounced,
  watchPlayerSpeed,
} from '@/youtube/adapter';

const MESSAGES = {
  /** Page → content: the page script has loaded. */
  ready: 'chrono:speed-ready',
  /**
   * Content → page: report the player's speed now and whenever it changes. Carries the
   * content script's id, a number.
   */
  connect: 'chrono:speed-connect',
  /** Content → page: the content script with this id has stopped. */
  disconnect: 'chrono:speed-disconnect',
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
  /**
   * The ids of the content scripts connected. An extension update can leave a stopped
   * content script in the page beside the new one.
   */
  const connected = new Set<number>();
  /**
   * What stops waiting for the player's speed API, while a content script is connected
   * and the API isn't recognised.
   */
  let awaitingApi: AbortController | undefined;

  // On a playlist page, the speed is the player's wherever YouTube keeps it. On a watch
  // page it is only the watch page's own player's.
  const place = (): PlayerPlace => (readPage(doc.location).kind === 'playlist' ? 'anywhere' : 'watch-page');

  /** The player's last speed outside an ad break. */
  let contentSpeed: number | undefined;

  const report = () => {
    const where = place();
    const reading = readPlayerSpeed(doc, where);
    if (!reading.recognised) {
      send(doc, MESSAGES.unrecognised);
      awaitApi();
      return;
    }
    stopAwaitingApi();
    const { speed, adBreak } = reading.value;
    if (!adBreak) contentSpeed = speed;
    // An ad's speed isn't the viewer's. On a playlist page, where nothing pauses for the
    // ad, the last speed outside one stands, if there was one.
    if (adBreak && where === 'anywhere') {
      if (contentSpeed !== undefined) send(doc, MESSAGES.speed, contentSpeed);
      return;
    }
    send(doc, MESSAGES.speed, speed);
  };

  // YouTube can bring the API in without any video event, so the page half looks again
  // whenever YouTube announces its player, until the API is recognised.
  const awaitApi = () => {
    if (awaitingApi) return;
    awaitingApi = new AbortController();
    watchPlayerAnnounced(doc, () => readPlayerSpeed(doc, place()).recognised && report(), awaitingApi.signal);
  };
  const stopAwaitingApi = () => {
    awaitingApi?.abort();
    awaitingApi = undefined;
  };
  signal.addEventListener('abort', stopAwaitingApi);

  doc.addEventListener(
    MESSAGES.connect,
    (event) => {
      const id = numberIn(event);
      if (id === undefined) return;
      connected.add(id);
      report();
    },
    { signal },
  );
  doc.addEventListener(
    MESSAGES.disconnect,
    (event) => {
      const id = numberIn(event);
      if (id === undefined) return;
      connected.delete(id);
      if (connected.size === 0) stopAwaitingApi();
    },
    { signal },
  );
  watchPlayerSpeed(doc, place, () => connected.size > 0 && report(), signal);
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
  const id = Math.random();
  const connect = () => send(doc, MESSAGES.connect, id);
  doc.addEventListener(MESSAGES.ready, connect, { signal });
  connect();
  signal.addEventListener('abort', () => send(doc, MESSAGES.disconnect, id));

  return {
    set(speed) {
      send(doc, MESSAGES.set, toYouTubeSpeed(speed));
    },
  };
}

/** A speed YouTube's menu can show: within 0.25×–2×, in 0.05× steps. */
function toYouTubeSpeed(speed: number): number {
  return roundToSpeedStep(Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed)));
}
