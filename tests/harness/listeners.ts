// Event listeners as the browser keeps them: one per target, type, listener and phase. The
// viewer can't see them; tests count them to check Chrono stops listening when it should.

interface Listener {
  target: EventTarget;
  type: string;
  listener: EventListenerOrEventListenerObject;
  capture: boolean;
}

function usesCapture(options?: boolean | EventListenerOptions): boolean {
  return typeof options === 'boolean' ? options : Boolean(options?.capture);
}

export class ListenerRegistry {
  #listeners: Listener[] = [];

  /** Notes a listener added to `target`, which an abort signal in `options` removes again. */
  add(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void {
    const signal = typeof options === 'object' ? options.signal : undefined;
    if (signal?.aborted) return;
    const entry = { target, type, listener, capture: usesCapture(options) };
    if (this.#indexOf(entry) === -1) this.#listeners.push(entry);
    signal?.addEventListener('abort', () => this.#forget(entry));
  }

  /** Notes a listener removed from `target`. */
  remove(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void {
    this.#forget({ target, type, listener, capture: usesCapture(options) });
  }

  get count(): number {
    return this.#listeners.length;
  }

  #indexOf({ target, type, listener, capture }: Listener): number {
    return this.#listeners.findIndex(
      (l) => l.target === target && l.type === type && l.listener === listener && l.capture === capture,
    );
  }

  #forget(entry: Listener): void {
    const index = this.#indexOf(entry);
    if (index !== -1) this.#listeners.splice(index, 1);
  }
}
