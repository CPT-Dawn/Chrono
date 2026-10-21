import { describe, expect, it } from 'vitest';
import { unnestLinks } from '../scripts/nested-links';

// Saving a page from a real browser writes YouTube's script-built nested links as they
// stand, which no parser can read back. The trim script rewrites them before parsing.
describe('unnestLinks', () => {
  it('rewrites a link inside a link as a span with the same attributes', () => {
    const { html, rewritten } = unnestLinks(
      '<a id=wc-endpoint href="/watch?v=1"><div><a id="thumbnail" href=\'/watch?v=1\'>x</a></div></a>',
    );
    expect(html).toBe(
      '<a id=wc-endpoint href="/watch?v=1"><div><span id="thumbnail" href=\'/watch?v=1\'>x</span></div></a>',
    );
    expect(rewritten).toBe(1);
  });

  it('leaves sibling links alone', () => {
    const input = '<a href="/a">a</a><a href="/b">b</a><A HREF="/c">c</A>';
    expect(unnestLinks(input)).toEqual({ html: input, rewritten: 0 });
  });

  it('rewrites every link in a doubly nested link, closing tags included', () => {
    const { html, rewritten } = unnestLinks('<a href="/1"><a href="/2"><a href="/3">3</a></a></a><a href="/4">4</a>');
    expect(html).toBe('<a href="/1"><span href="/2"><span href="/3">3</span></span></a><a href="/4">4</a>');
    expect(rewritten).toBe(2);
  });

  it('ignores tags in comments, scripts and attribute values', () => {
    const input =
      '<a title="<a href=x>" alt=it\'s href="/1"><!-- <a> --><script>"<a></a>"</script><abbr>b</abbr></a><a href="/2"></a>';
    expect(unnestLinks(input)).toEqual({ html: input, rewritten: 0 });
  });

  it('treats a template inside a link as a fresh start, as browsers do', () => {
    const input = '<a href="/1"><template><a href="/2"></a></template></a>';
    expect(unnestLinks(input)).toEqual({ html: input, rewritten: 0 });
  });
});
