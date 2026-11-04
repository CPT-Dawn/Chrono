// The demo's timeline. Everything is scheduled on virtual time (virtual-time.js), so a
// render is the same every time, frame for frame. The Panel is Chrono's own (dist/stage.js),
// and the cursor clicks its real buttons.
const $ = (selector) => document.querySelector(selector);
const EASE = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  decelerate: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  accelerate: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  glide: 'cubic-bezier(0.45, 0, 0.15, 1)',
  spring: 'linear(0, 0.004 1%, 0.019 2.2%, 0.079 5%, 0.161 7.8%, 0.464 17%, 0.557 20.2%, 0.637 23.5%, 0.706 26.8%, 0.767 30.2%, 0.817 33.8%, 0.860 37.5%, 0.899 42%, 0.929 46.8%, 0.953 52.2%, 0.971 58.5%, 0.991 73.8%, 1)',
};
const at = (seconds, fn) => setTimeout(fn, seconds * 1000);
const play = (el, keyframes, duration, { easing = EASE.standard, delay = 0 } = {}) =>
  el.animate(keyframes, { duration, easing, delay, fill: 'both' });
const fadeIn = (el, duration = 600, easing = EASE.standard) => play(el, [{ opacity: 0 }, { opacity: 1 }], duration, { easing });
const fadeOut = (el, duration = 500, easing = EASE.accelerate) => play(el, [{ opacity: 1 }, { opacity: 0 }], duration, { easing });
const rise = (el, { duration = 1000, y = 28, blur = 14 } = {}) =>
  play(el, [
    { opacity: 0, transform: `translateY(${y}px)`, filter: `blur(${blur}px)` },
    { opacity: 1, transform: 'none', filter: 'blur(0px)' },
  ], duration, { easing: EASE.decelerate });
const sink = (el, { duration = 520, y = -14 } = {}) =>
  play(el, [
    { opacity: 1, transform: 'none', filter: 'blur(0px)' },
    { opacity: 0, transform: `translateY(${y}px)`, filter: 'blur(10px)' },
  ], duration, { easing: EASE.accelerate });

// ---- The mark, drawn: a track that runs in and wraps into the clock ring --------------
const SVG = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}
function drawStroke(path, duration, easing, delay = 0) {
  const length = path.getTotalLength();
  path.style.strokeDasharray = `${length} ${length}`;
  return play(path, [{ strokeDashoffset: length }, { strokeDashoffset: 0 }], duration, { easing, delay });
}
function buildMark(svg, { cx, cy, r, stroke, dot, lead, fadeTo, id }) {
  const top = cy - r;
  const a = Math.PI / 3;
  const px = cx - r * Math.sin(a), py = cy - r * Math.cos(a);
  const defs = svgEl('defs', {});
  defs.innerHTML = `<linearGradient id="${id}t" gradientUnits="userSpaceOnUse" x1="${lead ?? 0}" y1="0" x2="${fadeTo}" y2="0"><stop offset="0" stop-color="#f5f5f4" stop-opacity="0"/><stop offset="1" stop-color="#f5f5f4"/></linearGradient>
    <radialGradient id="${id}h"><stop offset="0" stop-color="#ff0033" stop-opacity=".6"/><stop offset=".35" stop-color="#ff0033" stop-opacity=".18"/><stop offset="1" stop-color="#ff0033" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}l"><stop offset="0" stop-color="#fff" stop-opacity=".07"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
  svg.append(defs);
  const glow = svgEl('circle', { cx, cy, r: r * 2.4, fill: `url(#${id}l)` });
  const halo = svgEl('circle', { cx: px, cy: py, r: dot * 4.4, fill: `url(#${id}h)` });
  const track = svgEl('path', {
    d: `${lead !== null ? `M ${lead} ${top} L ${cx} ${top}` : `M ${cx} ${top}`} A ${r} ${r} 0 1 1 ${px} ${py}`,
    fill: 'none', stroke: lead !== null ? `url(#${id}t)` : '#f5f5f4', 'stroke-width': stroke, 'stroke-linecap': 'round',
  });
  const hand1 = svgEl('path', { d: `M ${cx} ${cy} L ${cx} ${cy - 0.52 * r}`, fill: 'none', stroke: '#f5f5f4', 'stroke-width': stroke, 'stroke-linecap': 'round' });
  const hand2 = svgEl('path', { d: `M ${cx} ${cy} L ${cx + 0.376 * r} ${cy + 0.235 * r}`, fill: 'none', stroke: '#f5f5f4', 'stroke-width': stroke, 'stroke-linecap': 'round' });
  const playhead = svgEl('circle', { cx: px, cy: py, r: dot, fill: '#ff0033' });
  for (const el of [halo, playhead]) el.style.transformOrigin = `${px}px ${py}px`;
  svg.append(glow, halo, track, hand1, hand2, playhead);
  for (const el of [glow, halo, track, hand1, hand2, playhead]) el.style.opacity = '0';
  return {
    draw(trackMs = 1800) {
      fadeIn(glow, 1400);
      track.style.opacity = '1';
      drawStroke(track, trackMs, EASE.inOut);
      at(trackMs / 1000 - 0.35, () => {
        hand1.style.opacity = hand2.style.opacity = '1';
        drawStroke(hand1, 420, EASE.decelerate);
        drawStroke(hand2, 420, EASE.decelerate, 120);
      });
      at(trackMs / 1000 - 0.1, () => {
        playhead.style.opacity = '1';
        play(playhead, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], 700, { easing: EASE.spring });
        play(halo, [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1)' }], 1100, { easing: EASE.decelerate });
      });
    },
  };
}

// ---- Camera over the watch page ---------------------------------------------------------
const world = $('#world');
let cam = { s: 1, x: 0, y: 0 };
const camTransform = (c) => `translate(${c.x}px, ${c.y}px) scale(${c.s})`;
/** Moves the camera so world point (wx, wy) lands at screen point (sx, sy), at scale s. */
function camera(s, wx, wy, sx, sy, duration, easing = EASE.inOut) {
  const next = { s, x: sx - wx * s, y: sy - wy * s };
  play(world, [{ transform: camTransform(cam) }, { transform: camTransform(next) }], Math.max(1, duration), { easing });
  cam = next;
}

// ---- Cursor ----------------------------------------------------------------------------
const cursor = $('#cursor');
const cursorArrow = cursor.querySelector('svg');
let pointer = { x: 1780, y: 1140 };
const place = (p) => `translate(${p.x - 6}px, ${p.y - 4}px)`;
function moveTo(target, duration = 850) {
  const p = typeof target === 'function' ? target() : target;
  play(cursor, [{ transform: place(pointer) }, { transform: place(p) }], duration, { easing: EASE.glide });
  pointer = p;
}
function centre(el, dx = 0, dy = 0) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2 + dx, y: r.top + r.height / 2 + dy };
}
function press(action) {
  play(cursorArrow, [{ transform: 'scale(1)' }, { transform: 'scale(.82)', offset: 0.35 }, { transform: 'scale(1)' }], 300);
  cursor.classList.remove('pressing');
  void cursor.offsetWidth;
  cursor.classList.add('pressing');
  at(0.09, action);
}

// ---- The Panel ---------------------------------------------------------------------------
const stage = createStage({ duration: 888, position: 218, speed: 1.5, theme: 'dark', settings: { panelStartsExpanded: false } });
$('#slot').append(stage.element);
const root = stage.element.shadowRoot;
const q = (selector) => root.querySelector(selector);
const faster = () => q('button[aria-label="Faster"]');
const slower = () => q('button[aria-label="Slower"]');
const toggle = () => q('.toggle');
const row = (text) => [...root.querySelectorAll('.speed-table')][0] && [...[...root.querySelectorAll('.speed-table')][0].querySelectorAll('.speed-row')].find((b) => b.querySelector('.speed-row-speed').textContent === text);
const targetSelect = () => q('.target-control select');
const finishInputs = () => [...q('.target-control').querySelectorAll('input')].filter((i) => i.offsetParent);
const apply = () => q('.target-apply');

let position = 218;
let playing = false;
setInterval(() => {
  if (!playing) return;
  position += stage.speed;
  stage.setPosition(position);
}, 1000);

// ---- Speed range ---------------------------------------------------------------------------
const range = $('#range');
const RW = 700;
const rx = (speed) => ((speed - 0.25) / 3.75) * RW;
range.innerHTML = `<div class="track"><div class="over" style="left:${rx(2)}px;right:0"></div></div>
  <div class="fill"></div><div class="wall" style="left:${rx(2)}px"></div>
  <span class="note" style="right:${RW - rx(2) + 16}px">YouTube’s menu stops at <b>2×</b></span>
  <span class="note" style="left:${rx(2) + 16}px">Chrono goes to <b>4×</b></span>
  ${[1, 2, 3, 4].map((s) => `<span class="tick" style="left:${rx(s)}px">${s}×</span>`).join('')}
  <div class="head"></div>`;
const fill = range.querySelector('.fill'), head = range.querySelector('.head');
let shownSpeed = 1.5;
function showRange(speed, duration = 420) {
  play(fill, [{ width: `${rx(shownSpeed)}px` }, { width: `${rx(speed)}px` }], duration, { easing: EASE.spring });
  play(head, [{ left: `${rx(shownSpeed)}px` }, { left: `${rx(speed)}px` }], duration, { easing: EASE.spring });
  shownSpeed = speed;
}

// ---- Typing ------------------------------------------------------------------------------
function type(input, text, start) {
  [...text].forEach((_, i) => {
    at(start + i * 0.16, () => {
      input.value = text.slice(0, i + 1);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
}

// ---- The open's mark and the end card's icon ---------------------------------------------------
const openMark = buildMark($('#open-art'), { cx: 960, cy: 400, r: 150, stroke: 13, dot: 22, lead: -20, fadeTo: 560, id: 'o' });
const endSvg = $('#end-mark');
endSvg.innerHTML = '<rect width="24" height="24" rx="5.5" fill="#0f0f0f" stroke="rgba(255,255,255,.14)" stroke-width=".2"/>';
const endGroup = svgEl('g', { transform: 'translate(2.4 2.4) scale(0.8)' });
endSvg.append(endGroup);
const endMark = buildMark(endGroup, { cx: 12, cy: 12, r: 8.5, stroke: 2.4, dot: 2.6, lead: null, fadeTo: 0, id: 'e' });

window.DURATION = 61.0;
window.START = () => {
  const scene = (id) => $(`#s-${id}`);
  camera(1.3333, 0, 36, 0, 0, 1);
  play(cursor, [{ transform: place(pointer) }, { transform: place(pointer) }], 1);

  // 0 · Open
  at(0, () => { scene('open').style.opacity = '1'; fadeOut($('#fade'), 900, EASE.standard); });
  at(0.25, () => openMark.draw(1900));
  at(2.35, () => rise($('#open-name'), { duration: 1200, y: 34 }));
  at(2.75, () => rise($('#open-tag'), { duration: 1100 }));
  at(4.6, () => play(scene('open'), [{ opacity: 1, transform: 'none', filter: 'blur(0px)' }, { opacity: 0, transform: 'scale(1.04)', filter: 'blur(10px)' }], 650, { easing: EASE.accelerate }));

  // 1 · Hook
  at(5.1, () => { scene('hook').style.opacity = '1'; rise($('#hook-1'), { duration: 1100 }); });
  at(6.5, () => rise($('#hook-2'), { duration: 1100 }));
  at(8.7, () => { sink($('#hook-1')); sink($('#hook-2'), { duration: 520, y: -10 }); });

  // 2 · Watch page: finish time
  at(9.25, () => { fadeIn(scene('watch'), 800); playing = true; });
  at(10.1, () => {
    camera(2.0, 1028, 68, 1000, 448, 1700);
    play($('#dim'), [{ opacity: 0 }, { opacity: 0.66 }], 1700, { easing: EASE.inOut });
    play($('#scrim'), [{ opacity: 0 }, { opacity: 1 }], 1300, { delay: 400 });
  });
  at(11.4, () => rise($('#cap-finish')));
  at(12.7, () => { fadeIn(cursor, 300); moveTo(() => centre(faster()), 1000); });
  at(13.9, () => press(() => faster().click()));
  at(14.8, () => press(() => faster().click()));
  at(15.7, () => moveTo(() => centre(slower()), 520));
  at(16.4, () => press(() => slower().click()));

  // 3 · Speed table
  at(17.2, () => moveTo(() => centre(toggle()), 650));
  at(17.9, () => sink($('#cap-finish')));
  at(18.0, () => press(() => toggle().click()));
  at(18.15, () => camera(1.85, 1028, 68, 1010, 160, 1000, EASE.standard));
  at(18.6, () => rise($('#cap-speeds')));
  at(19.5, () => moveTo(() => centre(row('2×'), -160), 750));
  at(20.4, () => press(() => row('2×').click()));
  at(21.1, () => moveTo(() => centre(row('1.25×'), -150), 650));
  at(21.9, () => press(() => row('1.25×').click()));
  at(22.6, () => moveTo(() => centre(row('1.5×'), -140), 500));
  at(23.3, () => press(() => row('1.5×').click()));

  // 4 · Targets
  at(24.0, () => sink($('#cap-speeds')));
  at(24.1, () => moveTo(() => centre(targetSelect()), 800));
  at(25.0, () => press(() => {
    const select = targetSelect();
    select.value = 'finish-time';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }));
  at(25.3, () => rise($('#cap-target')));
  at(26.0, () => moveTo(() => centre(finishInputs()[1]), 700));
  at(26.8, () => press(() => {
    const minute = finishInputs()[1];
    minute.focus();
    // "Done by 5:30": the clock (virtual-time.js) is set so this needs exactly 1.75×,
    // from which + steps through 2×, 2.25×, 2.5×… for the next scene.
    minute.value = '';
    minute.dispatchEvent(new Event('input', { bubbles: true }));
    type(minute, '30', 0.35);
  }));
  at(28.9, () => moveTo(() => centre(apply()), 750));
  at(29.8, () => press(() => apply().click()));

  // 5 · Past 2×
  at(31.3, () => sink($('#cap-target')));
  at(31.4, () => moveTo(() => centre(toggle()), 700));
  at(32.2, () => press(() => toggle().click()));
  at(32.35, () => { camera(2.0, 1028, 68, 990, 300, 900, EASE.standard); play($('#dim'), [{ opacity: 0.66 }, { opacity: 0.9 }], 900); });
  at(32.7, () => rise($('#cap-past')));
  at(33.0, () => { shownSpeed = stage.speed; showRange(stage.speed, 1); rise(range, { duration: 900, y: 20, blur: 10 }); });
  at(33.4, () => moveTo(() => centre(faster()), 700));
  [34.2, 34.85, 35.5, 36.15, 36.8].forEach((t) => at(t, () => press(() => { faster().click(); showRange(stage.speed); })));
  at(37.9, () => { fadeOut(cursor, 300); sink($('#cap-past')); sink(range); });
  at(38.2, () => { fadeOut(scene('watch'), 700, EASE.standard); playing = false; });

  // 6 · Playlists
  at(38.6, () => fadeIn(scene('playlist'), 800));
  at(38.9, () => { rise($('#pl-card'), { duration: 1100, y: 40, blur: 12 }); play($('#pl-card'), [{ translate: '0 0' }, { translate: '0 -14px' }], 4600, { easing: 'linear' }); });
  at(39.1, () => rise($('#cap-playlist')));
  at(39.3, () => { rise($('#pl-scope'), { duration: 1100, y: 40, blur: 12 }); play($('#pl-scope'), [{ translate: '0 0' }, { translate: '0 -24px' }], 4200, { easing: 'linear' }); });
  at(40.3, () => play($('#pl-hi'), [{ opacity: 0, transform: 'scale(1.04)' }, { opacity: 1, transform: 'scale(1)' }], 600, { easing: EASE.decelerate }));
  at(43.2, () => { sink($('#cap-playlist')); fadeOut(scene('playlist'), 650, EASE.standard); });

  // 7 · Player badge
  at(43.7, () => fadeIn(scene('badge'), 700));
  at(43.8, () => { rise($('#badge-sheet'), { duration: 1200, y: 40, blur: 12 }); play($('#badge-img'), [{ transform: 'scale(1)' }, { transform: 'scale(1.32)' }], 4800, { easing: EASE.inOut }); });
  at(44.1, () => rise($('#cap-badge')));
  at(48.1, () => { sink($('#cap-badge')); fadeOut(scene('badge'), 650, EASE.standard); });

  // 8 · Privacy
  at(48.7, () => { scene('privacy').style.opacity = '1'; rise($('#claim-1'), { duration: 1000 }); });
  at(49.35, () => rise($('#claim-2'), { duration: 1000 }));
  at(50.0, () => rise($('#claim-3'), { duration: 1000 }));
  at(50.8, () => rise($('#claim-sub'), { duration: 900, y: 12, blur: 6 }));
  at(52.6, () => fadeOut(scene('privacy'), 600));

  // 9 · End card
  at(53.2, () => { scene('end').style.opacity = '1'; play($('#end-mark'), [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], 900, { easing: EASE.decelerate }); endMark.draw(1100); });
  at(53.7, () => rise($('#end-name'), { duration: 1100, y: 30 }));
  at(54.0, () => rise($('#end-tag'), { duration: 1000 }));
  at(54.4, () => rise($('#end-stores'), { duration: 1000, y: 16, blur: 8 }));
  at(54.7, () => rise($('#end-url'), { duration: 900, y: 10, blur: 6 }));
  at(59.3, () => fadeIn($('#fade'), 1300, EASE.standard));
};
