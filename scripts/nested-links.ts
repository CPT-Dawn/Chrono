// HTML can't hold a link inside a link, but YouTube builds some entries that way from
// script, and a browser saving the page writes them nested anyway. Any parser reading that
// back closes the outer link early and moves everything after it. unnestLinks rewrites
// each <a> opened inside another <a> as a <span> with the same attributes, closing tag
// included, so the saved page parses into the tree the browser showed.
//
// It reads the markup as text, so it assumes the links' tags are balanced, as they are in
// a page saved from the live DOM.

// Elements whose content is text, not tags.
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext']);

export function unnestLinks(source: string): { html: string; rewritten: number } {
  const out: string[] = [];
  // One list of open links per template, since a template's content starts afresh.
  // true marks a link rewritten as a span.
  const scopes: boolean[][] = [[]];
  let rewritten = 0;
  let copied = 0;
  let i = 0;

  while ((i = source.indexOf('<', i)) !== -1) {
    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4);
      i = end === -1 ? source.length : end + 3;
      continue;
    }
    const tag = /^<(\/?)([a-zA-Z][^\s/>]*)/.exec(source.slice(i, i + 64));
    if (!tag) {
      i++;
      continue;
    }
    const closing = tag[1] === '/';
    const name = tag[2]!.toLowerCase();
    const end = tagEnd(source, i + tag[0].length);
    const links = scopes.at(-1)!;

    if (name === 'a') {
      const nested = closing ? links.pop() === true : links.push(links.length > 0) > 1;
      if (nested) {
        out.push(source.slice(copied, i), closing ? '</span' : '<span');
        copied = i + tag[0].length;
        if (!closing) rewritten++;
      }
    } else if (name === 'template') {
      if (closing) {
        if (scopes.length > 1) scopes.pop();
      } else {
        scopes.push([]);
      }
    } else if (!closing && RAW_TEXT.has(name)) {
      const close = new RegExp(`</${name}`, 'ig');
      close.lastIndex = end;
      i = close.exec(source)?.index ?? source.length;
      continue;
    }
    i = end;
  }
  out.push(source.slice(copied));
  return { html: out.join(''), rewritten };
}

// The index just past the tag's closing '>', skipping quoted attribute values. A quote
// opens a value only straight after '=', so an unquoted value may hold one.
function tagEnd(source: string, from: number): number {
  let quote: string | undefined;
  let afterEquals = false;
  for (let i = from; i < source.length; i++) {
    const ch = source[i]!;
    if (quote) {
      if (ch === quote) quote = undefined;
    } else if (afterEquals && (ch === '"' || ch === "'")) {
      quote = ch;
    } else if (ch === '>') {
      return i + 1;
    }
    if (!/\s/.test(ch)) afterEquals = !quote && ch === '=';
  }
  return source.length;
}
