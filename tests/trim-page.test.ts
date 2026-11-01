import { describe, expect, it } from 'vitest';
import { rewriteNestedLinks, trimPage } from '../scripts/saved-page';

function panelEntry(n: number): string {
  return `<ytd-playlist-panel-video-renderer>
    <a id="wc-endpoint" href="/watch?v=${n}&amp;list=PL1">
      <ytd-thumbnail><a id="thumbnail" href="/watch?v=${n}&amp;list=PL1"><span>1:0${n}</span></a></ytd-thumbnail>
      <span id="video-title">Entry ${n}</span>
    </a>
  </ytd-playlist-panel-video-renderer>`;
}

const PANEL_CAPTURE = `<!DOCTYPE html>
<html><head><title>Watch</title></head><body>
<ytd-playlist-panel-renderer><div id="items">${[1, 2, 3].map(panelEntry).join('\n')}</div></ytd-playlist-panel-renderer>
</body></html>`;

function readBack(page: string): Document {
  return new DOMParser().parseFromString(page, 'text/html');
}

describe('Rewriting nested links before parsing', () => {
  it('saves a link inside a link as a <span> with the same attributes', () => {
    const html = '<a id="wc-endpoint" href="/watch?v=1"><b>1</b><a id="thumbnail" href="/watch?v=1">x</a></a>';

    expect(rewriteNestedLinks(html)).toEqual({
      html: '<a id="wc-endpoint" href="/watch?v=1"><b>1</b><span id="thumbnail" href="/watch?v=1">x</span></a>',
      rewritten: 1,
    });
  });

  it('leaves links side by side as links', () => {
    const html = '<p><a href="/a">A</a> <A HREF="/b">B</A><a href="/c"></a></p>';

    expect(rewriteNestedLinks(html)).toEqual({ html, rewritten: 0 });
  });

  it('saves every link below the outermost as a <span>, however deep', () => {
    const html = '<a id="1"><a id="2"><a id="3">deep</a></a><a id="4">next</a></a><a id="5">after</a>';

    expect(rewriteNestedLinks(html)).toEqual({
      html: '<a id="1"><span id="2"><span id="3">deep</span></span><span id="4">next</span></a><a id="5">after</a>',
      rewritten: 3,
    });
  });

  it('ignores links in comments, scripts and attribute values', () => {
    const html = [
      '<a href="/x" title="<a href=/y>">',
      '<!-- <a href="/in-comment"> -->',
      '<script>document.write("<a href=/in-script>")</script>',
      '<abbr>not a link</abbr>',
      '</a>',
    ].join('');

    expect(rewriteNestedLinks(html)).toEqual({ html, rewritten: 0 });
  });
});

describe('Trimming a browser capture into a saved page', () => {
  it('keeps every playlist-panel entry in its list when entries hold nested links', () => {
    const { page, nestedLinks } = trimPage(PANEL_CAPTURE);

    const doc = readBack(page);
    expect(nestedLinks).toBe(3);
    expect(doc.querySelectorAll('#items > ytd-playlist-panel-video-renderer')).toHaveLength(3);
    expect(doc.querySelectorAll('#items #video-title')).toHaveLength(3);
    expect(doc.querySelector('ytd-thumbnail > span#thumbnail')?.getAttribute('href')).toBe('/watch?v=1&list=PL1');
  });

  it("says in its leading comment where and when SingleFile saved the page, and how links were kept", () => {
    const capture = PANEL_CAPTURE.replace(
      '<html>',
      `<html><!--
 Page saved with SingleFile
 url: https://www.youtube.com/watch?v=XCtYg1Hj3YI&list=PLxCzCOWd7aiEbY0sZVAi7zxvI7zBhBqZb
 saved date: Tue Oct 21 2026 14:03:11 GMT+0530 (India Standard Time)
-->`,
    );

    const { page } = trimPage(capture);

    expect(page.split('\n<html')[0]).toBe(`<!DOCTYPE html>
<!--
  Saved with SingleFile from https://www.youtube.com/watch?v=XCtYg1Hj3YI&list=PLxCzCOWd7aiEbY0sZVAi7zxvI7zBhBqZb
  on Tue Oct 21 2026 14:03:11 GMT+0530 (India Standard Time).
  HTML can't hold a link inside a link, and YouTube builds playlist entries that way from
  script, so each link nested in another was saved as a <span> with the same attributes.
-->`);
  });

  it("drops SingleFile's data-sf-* attributes and inline data: URIs", () => {
    const capture = `<html><body data-sf-scroll="0">
      <video poster="data:image/jpeg;base64,AAAA" class="video-stream" data-sf-video-src="x"></video>
      <img src=" DATA:image/png;base64,BBBB" alt="Thumb" data-sf-ow="1">
      <div style="color: red; background-image: url(&quot;data:image/png;base64,CCCC&quot;); width: 2px" id="box"></div>
      <a href="/watch?v=1" data-sf-original-href="/w">Link</a>
    </body></html>`;

    const { page } = trimPage(capture);

    expect(page).not.toMatch(/data:/i);
    expect(page).not.toMatch(/data-sf-/);
    const doc = readBack(page);
    expect(doc.querySelector('video')?.className).toBe('video-stream');
    expect(doc.querySelector('img')?.getAttribute('alt')).toBe('Thumb');
    expect(doc.querySelector('#box')?.getAttribute('style')).toBe('color: red; width: 2px');
    expect(doc.querySelector('a')?.getAttribute('href')).toBe('/watch?v=1');
  });

  it('keeps what YouTube hid on screen: the hidden attribute and the sf-hidden class', () => {
    const capture = `<html><body>
      <div id="ad-badge" hidden>Sponsored</div>
      <span id="skip" class="ytp-skip sf-hidden">Skip</span>
    </body></html>`;

    const doc = readBack(trimPage(capture).page);

    expect(doc.querySelector('#ad-badge')?.hasAttribute('hidden')).toBe(true);
    expect(doc.querySelector('#skip')?.className).toBe('ytp-skip sf-hidden');
  });

  it("drops the query of ad click-tracking links, which carries the ad impression's tracking ids", () => {
    const capture = `<html><body>
      <a id="ad" href="https://www.googleadservices.com/pagead/aclk?sa=L&amp;ai=CZ-MP&amp;adurl=https://ad.example/">Visit</a>
      <div id="pixel" data-url="https://ad.doubleclick.net/ddm/trackclk/N123?dc_trk_aid=1#x"></div>
      <a id="own" href="https://www.youtube.com/watch?v=1&amp;pp=sAgC">Video</a>
    </body></html>`;

    const doc = readBack(trimPage(capture).page);

    expect(doc.querySelector('#ad')?.getAttribute('href')).toBe('https://www.googleadservices.com/pagead/aclk?redacted');
    expect(doc.querySelector('#pixel')?.getAttribute('data-url')).toBe('https://ad.doubleclick.net/ddm/trackclk/N123?redacted');
    expect(doc.querySelector('#own')?.getAttribute('href')).toBe('https://www.youtube.com/watch?v=1&pp=sAgC');
  });

  it('writes no leading comment when there is nothing to say', () => {
    const { page } = trimPage('<html><body><a href="/a">A</a></body></html>');

    expect(page.startsWith('<!DOCTYPE html>\n<html>')).toBe(true);
  });
});
