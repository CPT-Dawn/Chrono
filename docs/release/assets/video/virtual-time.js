// Virtual time for frame-perfect capture. Injected before any page script: Date,
// performance.now, timers and requestAnimationFrame all read one virtual clock, and every
// Web Animation and CSS transition (shadow roots included) is paused and advanced by hand.
// The recorder calls window.__step(ms) between frames; nothing moves on its own.
(() => {
  const EPOCH = new Date(2026, 10, 4, 17, 23, 23).getTime(); // 5:23:23 PM local: "Ends 5:30 PM" at 1.5×, as in the captures, and "Done by 5:30" needs exactly 1.75×
  let T = 0;

  const RealDate = Date;
  class VirtualDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(EPOCH + T);
      else super(...args);
    }
    static now() {
      return EPOCH + T;
    }
  }
  window.Date = VirtualDate;
  performance.now = () => T;

  let nextId = 1;
  const timers = new Map();
  window.setTimeout = (fn, ms = 0, ...args) => {
    const id = nextId++;
    timers.set(id, { at: T + Math.max(0, Number(ms) || 0), fn, args });
    return id;
  };
  window.setInterval = (fn, ms = 0, ...args) => {
    const id = nextId++;
    const every = Math.max(1, Number(ms) || 0);
    timers.set(id, { at: T + every, fn, args, every });
    return id;
  };
  window.clearTimeout = window.clearInterval = (id) => timers.delete(id);

  let frames = [];
  window.requestAnimationFrame = (fn) => {
    const id = nextId++;
    frames.push({ id, fn });
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    frames = frames.filter((frame) => frame.id !== id);
  };

  const tracked = new Set();
  function everyAnimation() {
    const found = new Set(document.getAnimations());
    const walk = (root) => {
      for (const element of root.querySelectorAll('*')) {
        if (!element.shadowRoot) continue;
        for (const animation of element.shadowRoot.getAnimations()) found.add(animation);
        walk(element.shadowRoot);
      }
    };
    walk(document);
    return found;
  }
  function adopt() {
    for (const animation of everyAnimation()) {
      if (tracked.has(animation)) continue;
      tracked.add(animation);
      if (animation.playState === 'running') animation.pause();
    }
  }
  function run(fn, args) {
    try {
      fn(...args);
    } catch (error) {
      console.error(error);
    }
  }

  window.__now = () => T;
  window.__step = (ms) => {
    adopt();
    const end = T + ms;
    for (;;) {
      let due;
      for (const [id, timer] of timers) if (timer.at <= end && (!due || timer.at < due[1].at)) due = [id, timer];
      if (!due) break;
      const [id, timer] = due;
      T = Math.max(T, timer.at);
      if (timer.every) timer.at += timer.every;
      else timers.delete(id);
      run(timer.fn, timer.args);
      adopt();
    }
    T = end;
    for (const animation of tracked) {
      if (animation.playState === 'finished' || animation.playState === 'idle') {
        tracked.delete(animation);
        continue;
      }
      if (animation.playState === 'running') animation.pause();
      const endTime = animation.effect?.getComputedTiming().endTime ?? 0;
      const time = (Number(animation.currentTime) || 0) + ms;
      if (Number.isFinite(endTime) && time >= endTime) {
        animation.finish();
        tracked.delete(animation);
      } else {
        animation.currentTime = time;
      }
    }
    const due = frames;
    frames = [];
    for (const frame of due) run(frame.fn, [T]);
    adopt();
  };
})();
