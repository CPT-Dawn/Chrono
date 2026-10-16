// The YouTube side of Seam 1: a saved YouTube page loaded into happy-dom, with a video
// element that behaves like a real one under Vitest's fake clock.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface SavedPage {
  /** The page's main video, driven the way YouTube's player drives it. */
  video: FakeVideo;
  /** YouTube's player, whose speed API is faked unless the page opened without one. */
  player: FakePlayer;
  /** YouTube's sidebar column on a watch page. */
  sidebar: Element;
  /**
   * Takes an element out of the page, as if YouTube hadn't rendered it yet.
   * Returns a function that puts it back where it was.
   */
  withhold(element: Element): () => void;
}

export interface PageOptions {
  /** Whether YouTube's player exposes the speed API Chrono knows. Defaults to true. */
  playerApi?: boolean;
}

/** Loads `tests/pages/<name>.html` as the current document, at `url`. */
export function openSavedPage(name: string, url: string, { playerApi = true }: PageOptions = {}): SavedPage {
  const html = readFileSync(join(import.meta.dirname, `../pages/${name}.html`), 'utf8');
  history.replaceState(null, '', url);
  const saved = new DOMParser().parseFromString(html, 'text/html');
  document.documentElement.remove();
  document.appendChild(document.importNode(saved.documentElement, true));

  const video = new FakeVideo(required('ytd-watch-flexy #movie_player video'));
  return {
    video,
    player: new FakePlayer(required('ytd-watch-flexy #movie_player'), video, playerApi),
    sidebar: required('ytd-watch-flexy #secondary-inner'),
    withhold(element) {
      const parent = element.parentNode!;
      const next = element.nextSibling;
      element.remove();
      return () => parent.insertBefore(element, next);
    },
  };
}

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Saved page has no ${selector}`);
  return element;
}

/** How often a playing video fires `timeupdate`, as in Chrome and Firefox. */
const TIMEUPDATE_MS = 250;

/**
 * A video element whose length, position and speed the test controls. Setting them fires
 * the same events a browser fires, and while playing the position advances with the
 * (fake) clock.
 */
export class FakeVideo {
  #duration = NaN;
  #position = 0;
  #speed = 1;
  #paused = true;
  #ticker: ReturnType<typeof setInterval> | undefined;

  constructor(readonly element: HTMLVideoElement) {
    const video = this;
    Object.defineProperties(element, {
      duration: { configurable: true, get: () => video.#duration },
      paused: { configurable: true, get: () => video.#paused },
      currentTime: {
        configurable: true,
        get: () => video.#position,
        set(value: number) {
          video.#position = value;
          video.#fire('seeking', 'seeked', 'timeupdate');
        },
      },
      playbackRate: {
        configurable: true,
        get: () => video.#speed,
        set(value: number) {
          video.#speed = value;
          video.#fire('ratechange');
        },
      },
      play: { configurable: true, value: () => Promise.resolve(video.play()) },
      pause: { configurable: true, value: () => video.pause() },
    });
  }

  /** The video's metadata has loaded, so its length is known. */
  load({ duration }: { duration: number }): void {
    this.#duration = duration;
    this.#fire('loadedmetadata', 'durationchange');
  }

  seek(position: number): void {
    this.element.currentTime = position;
  }

  setSpeed(speed: number): void {
    this.element.playbackRate = speed;
  }

  play(): void {
    if (!this.#paused) return;
    this.#paused = false;
    this.#fire('play', 'playing');
    this.#ticker = setInterval(() => {
      this.#position = Math.min(this.#duration, this.#position + (TIMEUPDATE_MS / 1000) * this.#speed);
      this.#fire('timeupdate');
      if (this.#position >= this.#duration) {
        this.pause();
        this.#fire('ended');
      }
    }, TIMEUPDATE_MS);
  }

  pause(): void {
    if (this.#paused) return;
    this.#paused = true;
    clearInterval(this.#ticker);
    this.#fire('pause');
  }

  #fire(...types: string[]): void {
    for (const type of types) this.element.dispatchEvent(new Event(type));
  }
}

/**
 * YouTube's player element and the part of its API that reads and sets speed. Like
 * YouTube's, it applies its speed to the video element.
 */
export class FakePlayer {
  #speed = 1;

  constructor(
    readonly element: Element,
    readonly video: FakeVideo,
    api: boolean,
  ) {
    if (!api) return;
    Object.defineProperties(element, {
      getPlaybackRate: { configurable: true, value: () => this.#speed },
      setPlaybackRate: { configurable: true, value: (speed: number) => this.setSpeed(speed) },
    });
  }

  /** The speed YouTube's own speed menu shows. */
  get speed(): number {
    return this.#speed;
  }

  /** Changes speed the way YouTube's speed menu and its Shift+< / Shift+> shortcuts do. */
  setSpeed(speed: number): void {
    this.#speed = speed;
    this.video.setSpeed(speed);
  }
}
