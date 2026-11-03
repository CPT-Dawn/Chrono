// Helpers for the screenshot pages. Captures are @2x, so a capture's CSS size is half its pixels.
const MARK_SVG = (ink) => `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x=".25" y=".25" width="23.5" height="23.5" rx="5.4" fill="#0f0f0f" stroke="${ink === 'dark' ? 'rgba(255,255,255,.16)' : 'none'}" stroke-width=".5"/>
  <g transform="translate(2.4 2.4) scale(0.8)" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round">
  <path d="M12 3.5A8.5 8.5 0 1 1 4.64 7.75"/><path d="M12 12V7.6M12 12l3.2 2"/><circle cx="4.64" cy="7.75" r="2.6" fill="#f03" stroke="none"/></g></svg>`;

/** The lockup: the app icon and the name. */
function lockup(theme) {
  return `<div class="lockup">${MARK_SVG(theme)}<span>Chrono</span></div>`;
}

/**
 * Place a crop of a capture: `crop` is in the capture's CSS px ({x, y, w, h}), `at` is where
 * the sheet goes on the canvas ({left, top}), `scale` enlarges it, `pad` adds page colour round it.
 */
function sheet(src, natural, crop, at, scale = 1, { pad = 0, cls = '', radius } = {}) {
  const [nw, nh] = natural.map((n) => n / 2);
  const c = crop ?? { x: 0, y: 0, w: nw, h: nh };
  const w = (c.w + pad * 2) * scale, h = (c.h + pad * 2) * scale;
  const style = Object.entries(at).map(([k, v]) => `${k}:${v}px`).join(';');
  return `<div class="sheet ${cls}" style="${style};width:${w}px;height:${h}px;${radius != null ? `border-radius:${radius}px` : ''}">
    <img src="${src}" style="width:${nw * scale}px;height:${nh * scale}px;left:${(pad - c.x) * scale}px;top:${(pad - c.y) * scale}px"></div>`;
}

/** A faint ring with the red playhead: the brand's echo behind the stage. */
function decoRing({ cx, cy, r, theme, opacity = 1 }) {
  const a = (60 * Math.PI) / 180;
  const px = cx - r * Math.sin(a), py = cy - r * Math.cos(a);
  const ink = theme === 'dark' ? `rgba(255,255,255,${0.09 * opacity})` : `rgba(15,15,15,${0.08 * opacity})`;
  return `<svg class="deco" width="1280" height="800" viewBox="0 0 1280 800">
    <defs><radialGradient id="dh"><stop offset="0" stop-color="#ff0033" stop-opacity=".35"/><stop offset="1" stop-color="#ff0033" stop-opacity="0"/></radialGradient></defs>
    <path d="M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${px} ${py}" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round"/>
    <circle cx="${px}" cy="${py}" r="34" fill="url(#dh)"/>
    <circle cx="${px}" cy="${py}" r="7" fill="#ff0033"/></svg>`;
}
