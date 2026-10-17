// Building the Panel's elements.

/** A new `tag` element with the class names in `className`. */
export function create<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  return element;
}

let idCount = 0;

/** An id no other element in the page has, for linking a label to its field. */
export function uniqueId(name: string): string {
  idCount += 1;
  return `chrono-${name}-${idCount}`;
}
