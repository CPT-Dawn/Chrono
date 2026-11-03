// Chrono's mark as a timeline: a track enters from the left, runs level, and wraps into the
// clock ring (300° clockwise from twelve), ending at the red playhead. Same geometry as
// src/icons.ts MARK, scaled. Usage: ringSVG({w, h, cx, cy, r, stroke, dot, lead, ...})
window.ringSVG = function ({ w, h, cx, cy, r, stroke, dot, lead = 0, color = '#f5f5f4', fadeTo = 0.55, halo = true, hands = true, rings = true, id = 'g' }) {
  const top = cy - r;
  const a = (60 * Math.PI) / 180;
  const px = cx - r * Math.sin(a), py = cy - r * Math.cos(a);
  const h1 = [cx, cy - 0.52 * r], h2 = [cx + 0.376 * r, cy + 0.235 * r];
  const track = lead >= 0 ? `M ${lead} ${top} L ${cx} ${top} ` : `M ${cx} ${top} `;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;inset:0">
  <defs>
    <linearGradient id="${id}t" gradientUnits="userSpaceOnUse" x1="${lead}" y1="0" x2="${cx * fadeTo + lead * (1 - fadeTo)}" y2="0">
      <stop offset="0" stop-color="${color}" stop-opacity="0"/><stop offset="1" stop-color="${color}" stop-opacity="1"/>
    </linearGradient>
    <radialGradient id="${id}h"><stop offset="0" stop-color="#ff0033" stop-opacity=".55"/><stop offset=".35" stop-color="#ff0033" stop-opacity=".16"/><stop offset="1" stop-color="#ff0033" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}l"><stop offset="0" stop-color="#fff" stop-opacity=".075"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id}d" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff2b55"/><stop offset="1" stop-color="#e8002e"/></linearGradient>
  </defs>
  <circle cx="${cx}" cy="${cy}" r="${r * 2.1}" fill="url(#${id}l)"/>
  ${rings ? `<circle cx="${cx}" cy="${cy}" r="${r * 1.32}" fill="none" stroke="${color}" stroke-opacity=".06" stroke-width="1"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 1.7}" fill="none" stroke="${color}" stroke-opacity=".035" stroke-width="1"/>` : ''}
  ${halo ? `<circle cx="${px}" cy="${py}" r="${dot * 4.2}" fill="url(#${id}h)"/>` : ''}
  <path d="${track}A ${r} ${r} 0 1 1 ${px} ${py}" fill="none" stroke="url(#${id}t)" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>
  ${hands ? `<path d="M ${cx} ${cy} L ${h1[0]} ${h1[1]} M ${cx} ${cy} L ${h2[0]} ${h2[1]}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"/>` : ''}
  <circle cx="${px}" cy="${py}" r="${dot}" fill="url(#${id}d)"/>
</svg>`;
};
// A track that runs all the way in from x=lead must stay solid where it meets the ring, so
// the gradient is anchored on the lead and ends before the ring's left edge.
