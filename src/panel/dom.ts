// Building the Panel's elements.

/** A new `tag` element with the class names in `className`. */
export function create<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  return element;
}
