// Code-native SVG scene art: backgrounds, foreground occluders and props.
// All geometry derives from SCENES data (js/scenes.js); nothing here defines
// gameplay coordinates. Painters draw into a local box centred on 0,0.

import { el, INK, setTransform, setAttr, createPaw, starPath, HEART_PATH } from '../../js/characters.js';

export const W = 1600;
export const H = 900;
const SW = 6;

const r2 = (n) => Math.round(n * 100) / 100;
const ink = (extra = {}) => ({ stroke: INK, 'stroke-width': SW, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...extra });

function blob(cx, cy, rx, ry, { bumps = 9, wobble = 0.12, seed = 1 } = {}) {
  // Smooth bumpy closed path (bushes, clouds, canopies).
  const pts = [];
  for (let i = 0; i < bumps; i += 1) {
    const a = (i / bumps) * Math.PI * 2;
    const k = 1 + Math.sin(i * 2.7 + seed) * wobble;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  let d = '';
  for (let i = 0; i < bumps; i += 1) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % bumps];
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const ox = (mx - cx) * 0.32;
    const oy = (my - cy) * 0.32;
    if (i === 0) d += `M${r2(x1)} ${r2(y1)} `;
    d += `Q${r2(mx + ox)} ${r2(my + oy)} ${r2(x2)} ${r2(y2)} `;
  }
  return `${d}Z`;
}

function cloud(parent, x, y, s = 1) {
  const g = el('g', { class: 'cloud', transform: `translate(${x} ${y}) scale(${s})` }, parent);
  el('path', { d: 'M-90 20 C -110 20 -112 -12 -86 -14 C -84 -44 -40 -50 -26 -28 C -14 -60 40 -58 46 -24 C 74 -34 104 -10 88 20 Z', fill: '#fff', ...ink({ 'stroke-width': 5 }) }, g);
  el('path', { d: 'M-70 12 L60 12', stroke: '#dbe9f5', 'stroke-width': 6, 'stroke-linecap': 'round' }, g);
  return g;
}

function sun(parent, x, y) {
  const g = el('g', { class: 'sun', transform: `translate(${x} ${y})` }, parent);
  const rays = el('g', { class: 'sun-rays' }, g);
  for (let i = 0; i < 12; i += 1) {
    el('path', { d: 'M0 -84 L10 -62 L-10 -62 Z', fill: '#ffd35c', transform: `rotate(${i * 30})` }, rays);
  }
  el('circle', { r: 52, fill: '#ffe07a', ...ink() }, g);
  el('path', { d: 'M-20 6 Q 0 22 20 6', fill: 'none', stroke: INK, 'stroke-width': 4, 'stroke-linecap': 'round' }, g);
  el('circle', { cx: -16, cy: -10, r: 4.5, fill: INK }, g);
  el('circle', { cx: 16, cy: -10, r: 4.5, fill: INK }, g);
  el('circle', { cx: -30, cy: 8, r: 7, fill: '#ffab8a', opacity: 0.6 }, g);
  el('circle', { cx: 30, cy: 8, r: 7, fill: '#ffab8a', opacity: 0.6 }, g);
  return { g, rays };
}

function flowerAt(parent, x, y, color, s = 1) {
  const g = el('g', { transform: `translate(${x} ${y}) scale(${s})` }, parent);
  el('path', { d: 'M0 0 L0 30', stroke: '#3f8a3a', 'stroke-width': 5, 'stroke-linecap': 'round' }, g);
  for (let i = 0; i < 5; i += 1) el('ellipse', { cx: 0, cy: -9, rx: 6, ry: 9, fill: color, stroke: INK, 'stroke-width': 3, transform: `rotate(${i * 72})` }, g);
  el('circle', { r: 5, fill: '#ffd35c', stroke: INK, 'stroke-width': 3 }, g);
  return g;
}

function tuft(parent, x, y, color = '#5fa646', s = 1) {
  el('path', { d: `M${x - 18 * s} ${y} Q ${x - 12 * s} ${y - 22 * s} ${x - 6 * s} ${y} Q ${x} ${y - 30 * s} ${x + 6 * s} ${y} Q ${x + 12 * s} ${y - 20 * s} ${x + 18 * s} ${y} Z`, fill: color, stroke: INK, 'stroke-width': 3.5, 'stroke-linejoin': 'round' }, parent);
}

function windowFrame(parent, x, y, w, h, { sky = '#bfe6fb', frame = '#fff7e6', night = false } = {}) {
  const g = el('g', { class: 'window' }, parent);
  el('rect', { x: x - 10, y: y - 10, width: w + 20, height: h + 20, rx: 14, fill: frame, ...ink() }, g);
  el('rect', { x, y, width: w, height: h, rx: 6, fill: night ? '#3b4f8f' : sky, stroke: INK, 'stroke-width': 4 }, g);
  el('path', { d: `M${x + w / 2} ${y} L${x + w / 2} ${y + h} M${x} ${y + h / 2} L${x + w} ${y + h / 2}`, stroke: frame, 'stroke-width': 10 }, g);
  el('path', { d: `M${x + 14} ${y + 30} L${x + 40} ${y + 10} M${x + 14} ${y + 52} L${x + 58} ${y + 16}`, stroke: '#fff', 'stroke-width': 5, opacity: 0.6, 'stroke-linecap': 'round' }, g);
  return g;
}

function frame(parent, x, y, w, h, { color, art }) {
  el('rect', { x, y, width: w, height: h, rx: 6, fill: color, ...ink({ 'stroke-width': 5 }) }, parent);
  el('rect', { x: x + 10, y: y + 10, width: w - 20, height: h - 20, rx: 3, fill: '#fff8e6', stroke: INK, 'stroke-width': 3 }, parent);
  if (art === 'heart') el('path', { d: HEART_PATH, fill: '#ff8f9e', stroke: INK, 'stroke-width': 3, transform: `translate(${x + w / 2} ${y + h / 2 + 2}) scale(1.3)` }, parent);
  if (art === 'sun') el('circle', { cx: x + w / 2, cy: y + h / 2, r: Math.min(w, h) / 5, fill: '#ffd35c', stroke: INK, 'stroke-width': 3 }, parent);
  if (art === 'paw') {
    const p = createPaw(parent, { fill: '#8bc4ea', strokeWidth: 3 });
    setTransform(p, `translate(${x + w / 2} ${y + h / 2 + 4}) scale(${Math.min(w, h) / 110})`);
  }
  if (art === 'hills') el('path', { d: `M${x + 10} ${y + h - 10} Q ${x + w / 3} ${y + h / 3} ${x + w / 2} ${y + h - 20} Q ${x + w * 0.7} ${y + h / 2} ${x + w - 10} ${y + h - 10} Z`, fill: '#8dcb63', stroke: INK, 'stroke-width': 3 }, parent);
}

function gradient(defs, id, stops, vertical = true) {
  const g = el('linearGradient', { id, x1: 0, y1: 0, x2: vertical ? 0 : 1, y2: vertical ? 1 : 0 }, defs);
  stops.forEach(([offset, color]) => el('stop', { offset, 'stop-color': color }, g));
  return `url(#${id})`;
}

/* ------------------------------------------------------------------ */
/* Backgrounds. Each returns a list of ambient animators {update(t)}.  */
/* ------------------------------------------------------------------ */

function butterfly(parent, color = '#ff9ab3') {
  const g = el('g', { class: 'butterfly' }, parent);
  const wings = el('g', {}, g);
  el('path', { d: 'M0 0 C -18 -22 -30 -6 -20 4 C -28 14 -12 22 0 4 Z', fill: color, stroke: INK, 'stroke-width': 3 }, wings);
  el('path', { d: 'M0 0 C 18 -22 30 -6 20 4 C 28 14 12 22 0 4 Z', fill: color, stroke: INK, 'stroke-width': 3 }, wings);
  el('ellipse', { rx: 3, ry: 10, cy: 2, fill: INK }, g);
  return { g, wings };
}

function bird(parent) {
  const g = el('g', { class: 'bird' }, parent);
  const wing = el('path', { d: 'M-18 0 Q -9 -12 0 0 Q 9 -12 18 0', fill: 'none', stroke: INK, 'stroke-width': 4, 'stroke-linecap': 'round' }, g);
  return { g, wing };
}

function drifter(node, { x0, x1, y, period, phase = 0, bob = 0, s = 1 }) {
  return {
    update(t) {
      const k = ((t / period + phase) % 1 + 1) % 1;
      const x = x0 + (x1 - x0) * k;
      setTransform(node, `translate(${r2(x)} ${r2(y + Math.sin(t / 700 + phase * 9) * bob)}) scale(${s})`);
    },
  };
}

function flutterer(b, { cx, cy, rx, ry, period, phase = 0 }) {
  return {
    update(t) {
      const a = (t / period) * Math.PI * 2 + phase;
      const x = cx + Math.cos(a) * rx;
      const y = cy + Math.sin(a * 2) * ry;
      setTransform(b.g, `translate(${r2(x)} ${r2(y)}) scale(${Math.cos(a) > 0 ? -1 : 1} 1)`);
      setTransform(b.wings, `scale(${r2(0.35 + Math.abs(Math.sin(t / 70)) * 0.65)} 1)`);
    },
  };
}

function bgBackyard(far, near, defs, p) {
  const ambient = [];
  el('rect', { width: W, height: H, fill: gradient(defs, 'sky-backyard', [[0, p.sky], [0.55, p.skyLow]]) }, far);
  const s = sun(far, 1440, 110);
  ambient.push({ update: (t) => setTransform(s.rays, `rotate(${r2((t / 120) % 360)})`) });
  for (const [x, y, sc, per, ph] of [[200, 90, 0.9, 90000, 0], [700, 60, 1.1, 120000, 0.4], [1150, 140, 0.7, 100000, 0.75]]) {
    const c = cloud(far, x, y, sc);
    ambient.push(drifter(c, { x0: -200, x1: W + 200, y, period: per, phase: ph, s: sc }));
  }
  // distant hills and gum trees
  el('path', { d: 'M0 330 Q 200 240 420 300 Q 640 230 900 300 Q 1150 240 1350 290 Q 1500 260 1600 300 L1600 400 L0 400 Z', fill: '#b5dd8f', ...ink({ 'stroke-width': 4 }) }, far);
  for (const [x, y, s2] of [[600, 300, 1], [1020, 290, 0.8], [1260, 300, 1.1]]) {
    el('path', { d: `M${x} ${y + 30} L${x} ${y - 20}`, stroke: '#8a6a52', 'stroke-width': 10 * s2 }, far);
    el('path', { d: blob(x, y - 40 * s2, 46 * s2, 34 * s2, { bumps: 8, wobble: 0.15, seed: x }), fill: '#7fbf6a', ...ink({ 'stroke-width': 4 }) }, far);
  }
  el('path', { d: 'M330 120 L580 40 L830 120 Z', fill: '#e9785c', ...ink() }, far);
  el('rect', { x: 350, y: 118, width: 460, height: 262, fill: p.wall, ...ink() }, far);
  for (let yy = 150; yy < 380; yy += 34) el('path', { d: `M354 ${yy} L806 ${yy}`, stroke: '#e5c58a', 'stroke-width': 3 }, far);
  windowFrame(far, 516, 186, 120, 110, { sky: '#ffeec2' });
  el('rect', { x: 690, y: 210, width: 90, height: 170, rx: 8, fill: '#6f9fd8', ...ink() }, far);
  el('circle', { cx: 765, cy: 300, r: 6, fill: '#ffd35c', stroke: INK, 'stroke-width': 3 }, far);
  // veranda beam for the wind chime
  el('rect', { x: 330, y: 110, width: 520, height: 22, rx: 8, fill: p.wood, ...ink({ 'stroke-width': 5 }) }, far);
  // lawn
  el('path', { d: 'M0 370 Q 400 350 800 368 Q 1200 386 1600 362 L1600 900 L0 900 Z', fill: p.ground, ...ink() }, far);
  el('path', { d: 'M0 640 Q 500 600 900 640 Q 1300 680 1600 630 L1600 900 L0 900 Z', fill: p.groundDark, opacity: 0.35 }, far);
  // near: side fence over the cameo layer (dad peers over it)
  const fence = el('g', { class: 'fence' }, near);
  for (let x = 860; x < W + 40; x += 46) {
    el('path', { d: `M${x} 410 L${x} 318 L${x + 19} 300 L${x + 38} 318 L${x + 38} 410 Z`, fill: '#e9d2a6', ...ink({ 'stroke-width': 4 }) }, fence);
  }
  el('rect', { x: 850, y: 336, width: 800, height: 14, fill: '#d4b47e', stroke: INK, 'stroke-width': 4 }, fence);
  el('rect', { x: 850, y: 380, width: 800, height: 14, fill: '#d4b47e', stroke: INK, 'stroke-width': 4 }, fence);
  // garden bed + stepping stones
  for (const [x, y] of [[620, 600], [700, 640], [780, 690], [1040, 860], [1160, 840]]) el('ellipse', { cx: x, cy: y, rx: 34, ry: 14, fill: '#d8d2c4', stroke: INK, 'stroke-width': 4 }, near);
  for (const [x, y, c] of [[120, 420, '#ff8f9e'], [880, 430, '#ffd35c'], [960, 420, '#b9a2e8'], [1500, 430, '#ff8f6b'], [1100, 880, '#ff9ab3']]) flowerAt(near, x, y, c, 0.9);
  for (const [x, y] of [[240, 460], [430, 560], [1000, 540], [1300, 600], [1520, 720], [80, 700], [760, 800], [1220, 760]]) tuft(near, x, y, p.groundDark);
  const b = butterfly(near, '#b9a2e8');
  ambient.push(flutterer(b, { cx: 1100, cy: 260, rx: 170, ry: 40, period: 9000 }));
  const br = bird(far);
  ambient.push({ update(t) { const k = (t / 26000) % 1; setTransform(br.g, `translate(${r2(-100 + k * 1900)} ${r2(170 + Math.sin(t / 900) * 20)})`); setAttr(br.wing, 'd', Math.sin(t / 120) > 0 ? 'M-18 0 Q -9 -12 0 0 Q 9 -12 18 0' : 'M-18 -6 Q -9 4 0 0 Q 9 4 18 -6'); } });
  return ambient;
}

function bgBedroom(far, near, defs, p) {
  const ambient = [];
  el('rect', { width: W, height: H, fill: p.wall }, far);
  // wallpaper stars + stripes
  for (let x = 40; x < W; x += 120) el('rect', { x, y: 0, width: 50, height: 500, fill: '#c8d6f8', opacity: 0.55 }, far);
  for (const [x, y] of [[100, 60], [470, 90], [820, 70], [1160, 100], [1480, 60], [400, 300], [1060, 300]]) el('path', { d: starPath(14), transform: `translate(${x} ${y})`, fill: '#fff3b0', stroke: INK, 'stroke-width': 3 }, far);
  // skirting + floor
  el('rect', { x: 0, y: 492, width: W, height: 22, fill: '#fff7e6', ...ink({ 'stroke-width': 4 }) }, far);
  el('rect', { x: 0, y: 512, width: W, height: 388, fill: p.ground, ...ink({ 'stroke-width': 4 }) }, far);
  for (let x = -60; x < W + 100; x += 140) el('path', { d: `M${x} 512 L${x - 120} 900`, stroke: p.groundDark, 'stroke-width': 3, opacity: 0.6 }, far);
  // round rug
  el('ellipse', { cx: 760, cy: 760, rx: 360, ry: 92, fill: '#ff9ab3', ...ink() }, far);
  el('ellipse', { cx: 760, cy: 760, rx: 280, ry: 64, fill: '#ffc0cf', stroke: '#fff', 'stroke-width': 6, 'stroke-dasharray': '14 12' }, far);
  // window behind the left curtain
  windowFrame(far, 110, 120, 200, 240, { sky: '#a8dcf7' });
  el('circle', { cx: 160, cy: 180, r: 26, fill: '#ffe07a', stroke: INK, 'stroke-width': 3 }, far);
  // doorway for parent cameos (x ≈ .53-.67)
  el('rect', { x: 836, y: 82, width: 248, height: 430, rx: 10, fill: '#fff7e6', ...ink() }, far);
  el('rect', { x: 856, y: 100, width: 208, height: 412, fill: '#efd9b6', stroke: INK, 'stroke-width': 4 }, far);
  el('rect', { x: 856, y: 380, width: 208, height: 132, fill: '#d9b98c' }, far);
  frame(far, 900, 160, 90, 70, { color: '#7fd1c1', art: 'hills' });
  // open door leaf
  el('path', { d: 'M1064 100 L1120 120 L1120 500 L1064 512 Z', fill: '#f4b183', ...ink() }, far);
  el('circle', { cx: 1108, cy: 320, r: 7, fill: '#ffd35c', stroke: INK, 'stroke-width': 3 }, far);
  // shelf under the lamp, daybed back panel spanning the bed, mattress + pillow
  el('rect', { x: 384, y: 278, width: 102, height: 14, rx: 6, fill: p.wood, ...ink({ 'stroke-width': 4 }) }, far);
  el('path', { d: 'M300 520 L300 400 Q 300 372 330 372 L 770 372 Q 800 372 800 400 L800 520 Z', fill: '#7fd1c1', ...ink() }, far);
  for (let x = 350; x < 780; x += 70) el('circle', { cx: x, cy: 410, r: 6, fill: '#fff', opacity: 0.7 }, far);
  el('rect', { x: 290, y: 470, width: 520, height: 70, rx: 22, fill: '#fff', ...ink() }, far);
  el('ellipse', { cx: 395, cy: 466, rx: 50, ry: 26, fill: '#ffeaa8', ...ink() }, far);
  frame(far, 600, 210, 110, 90, { color: '#ffd35c', art: 'paw' });
  frame(far, 1250, 140, 80, 100, { color: '#ff9ab3', art: 'heart' });
  // mobile
  const mob = el('g', { class: 'mobile' }, far);
  el('path', { d: 'M0 0 L0 50 M-60 50 L60 50 M-60 50 L-60 80 M60 50 L60 90 M0 50 L0 100', stroke: INK, 'stroke-width': 3 }, mob);
  el('path', { d: starPath(14), transform: 'translate(-60 94)', fill: '#ffd35c', stroke: INK, 'stroke-width': 3 }, mob);
  el('circle', { cx: 60, cy: 102, r: 12, fill: '#b9a2e8', stroke: INK, 'stroke-width': 3 }, mob);
  el('path', { d: 'M-12 108 Q 0 94 12 108 Q 0 122 -12 108 Z', fill: '#7fd1c1', stroke: INK, 'stroke-width': 3 }, mob);
  ambient.push({ update: (t) => setTransform(mob, `translate(560 0) rotate(${r2(Math.sin(t / 1600) * 5)} 0 0)`) });
  // toys on floor
  for (const [x, y, c] of [[1000, 600, '#ff8f6b'], [1030, 610, '#7fd1c1'], [1015, 585, '#ffd35c']]) el('rect', { x: x - 16, y: y - 16, width: 32, height: 32, rx: 4, fill: c, stroke: INK, 'stroke-width': 4 }, near);
  return ambient;
}

function bgLounge(far, near, defs, p) {
  const ambient = [];
  el('rect', { width: W, height: H, fill: p.wall }, far);
  for (let y = 40; y < 470; y += 64) el('path', { d: `M0 ${y} L${W} ${y}`, stroke: '#f9d8b4', 'stroke-width': 18 }, far);
  el('rect', { x: 0, y: 470, width: W, height: 20, fill: '#fff4e0', ...ink({ 'stroke-width': 4 }) }, far);
  el('rect', { x: 0, y: 488, width: W, height: 412, fill: p.ground, ...ink({ 'stroke-width': 4 }) }, far);
  for (let y = 520; y < 900; y += 46) el('path', { d: `M0 ${y} L${W} ${y}`, stroke: p.groundDark, 'stroke-width': 3, opacity: 0.5 }, far);
  // big rug
  el('rect', { x: 330, y: 700, width: 760, height: 150, rx: 40, fill: p.accent, ...ink() }, far);
  el('rect', { x: 370, y: 724, width: 680, height: 102, rx: 28, fill: 'none', stroke: '#ffe9b0', 'stroke-width': 8, 'stroke-dasharray': '22 14' }, far);
  // window behind right curtain
  windowFrame(far, 1300, 110, 240, 260, { sky: '#ffd9a0' });
  el('path', { d: 'M1320 330 Q 1400 270 1460 330 Q 1500 290 1530 330 Z', fill: '#a6d98f', stroke: INK, 'stroke-width': 3 }, far);
  // pictures + clock
  frame(far, 240, 120, 150, 110, { color: '#ff8f6b', art: 'hills' });
  frame(far, 430, 150, 80, 80, { color: '#4fb3a9', art: 'heart' });
  frame(far, 760, 110, 120, 140, { color: '#ffd35c', art: 'paw' });
  const clockHand = (() => {
    const g = el('g', { transform: 'translate(1080 170)' }, far);
    el('circle', { r: 46, fill: '#fff7e6', ...ink() }, g);
    for (let i = 0; i < 12; i += 1) el('circle', { cx: 0, cy: -34, r: 3, fill: INK, transform: `rotate(${i * 30})` }, g);
    const hand = el('path', { d: 'M0 4 L0 -30', stroke: INK, 'stroke-width': 5, 'stroke-linecap': 'round' }, g);
    el('path', { d: 'M0 0 L18 0', stroke: '#ff8f6b', 'stroke-width': 5, 'stroke-linecap': 'round' }, g);
    return hand;
  })();
  ambient.push({ update: (t) => setTransform(clockHand, `rotate(${r2((t / 60) % 360)})`) });
  // plant
  el('path', { d: 'M1180 470 L1200 400 L1260 400 L1280 470 Z', fill: '#ff8f6b', ...ink() }, near);
  for (const a of [-40, -15, 10, 35]) el('path', { d: 'M1230 400 Q 1210 330 1230 300 Q 1250 330 1230 400 Z', fill: '#5fa646', stroke: INK, 'stroke-width': 4, transform: `rotate(${a} 1230 400)` }, near);
  // coffee table
  el('rect', { x: 560, y: 760, width: 260, height: 26, rx: 10, fill: p.wood, ...ink() }, near);
  el('path', { d: 'M590 786 L590 830 M790 786 L790 830', stroke: INK, 'stroke-width': 10, 'stroke-linecap': 'round' }, near);
  el('rect', { x: 620, y: 736, width: 60, height: 24, rx: 6, fill: '#7fbde8', stroke: INK, 'stroke-width': 4 }, near);
  return ambient;
}

function bgPlayground(far, near, defs, p) {
  const ambient = [];
  el('rect', { width: W, height: H, fill: gradient(defs, 'sky-playground', [[0, p.sky], [0.5, p.skyLow]]) }, far);
  const s = sun(far, 1250, 105);
  ambient.push({ update: (t) => setTransform(s.rays, `rotate(${r2((t / 140) % 360)})`) });
  for (const [x, y, sc, per, ph] of [[500, 80, 1, 110000, 0.1], [1000, 130, 0.8, 95000, 0.5], [1400, 70, 1.2, 130000, 0.8]]) {
    const c = cloud(far, x, y, sc);
    ambient.push(drifter(c, { x0: -200, x1: W + 200, y, period: per, phase: ph, s: sc }));
  }
  el('path', { d: 'M0 300 Q 260 200 520 290 Q 800 190 1100 280 Q 1350 220 1600 280 L1600 420 L0 420 Z', fill: '#bfe39b', ...ink({ 'stroke-width': 4 }) }, far);
  // distant city/park trees
  for (const [x, s2] of [[300, 1], [700, 0.8], [1180, 1.1], [1500, 0.9]]) {
    el('path', { d: `M${x} 340 L${x} 280`, stroke: '#8a6a52', 'stroke-width': 12 * s2 }, far);
    el('path', { d: blob(x, 250, 60 * s2, 50 * s2, { bumps: 9, wobble: 0.16, seed: x }), fill: '#79c06a', ...ink({ 'stroke-width': 4 }) }, far);
  }
  // tree that holds the touchable leaves prop (top-left)
  el('path', { d: 'M140 420 Q 150 330 160 230 L 176 230 Q 184 330 196 420 Z', fill: '#a8714a', ...ink({ 'stroke-width': 5 }) }, far);
  // grass and winding path where parents stroll
  el('path', { d: 'M0 350 Q 500 330 800 352 Q 1200 372 1600 340 L1600 900 L0 900 Z', fill: p.ground, ...ink() }, far);
  el('path', { d: 'M-20 420 Q 400 380 800 410 Q 1200 440 1620 400 L1620 440 Q 1200 480 800 452 Q 400 420 -20 462 Z', fill: '#f2dfae', ...ink({ 'stroke-width': 4 }) }, far);
  // swing set (behind gameplay)
  el('path', { d: 'M980 600 L1040 330 L1100 600 M1180 600 L1240 330 L1300 600 M1040 330 L1240 330', fill: 'none', stroke: '#ff6f61', 'stroke-width': 14, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, near);
  const swing = el('g', {}, near);
  el('path', { d: 'M-30 0 L-30 170 M30 0 L30 170', stroke: INK, 'stroke-width': 4 }, swing);
  el('rect', { x: -44, y: 166, width: 88, height: 16, rx: 6, fill: '#ffc93c', stroke: INK, 'stroke-width': 4 }, swing);
  ambient.push({ update: (t) => setTransform(swing, `translate(1140 334) rotate(${r2(Math.sin(t / 900) * 9)})`) });
  // sandpit
  el('path', { d: blob(830, 760, 120, 40, { bumps: 10, wobble: 0.08, seed: 3 }), fill: '#f5d78e', ...ink() }, near);
  el('path', { d: 'M800 742 L840 742 L834 770 L806 770 Z', fill: '#ff6f61', stroke: INK, 'stroke-width': 4 }, near);
  for (const [x, y] of [[100, 500], [520, 620], [960, 690], [1240, 820], [1500, 620], [700, 850], [260, 860]]) tuft(near, x, y, p.groundDark);
  for (const [x, y, c] of [[560, 500, '#ffc93c'], [1450, 560, '#ff8f9e'], [1510, 820, '#6f8cff']]) flowerAt(near, x, y, c);
  const br = bird(far);
  ambient.push({ update(t) { const k = (t / 30000 + 0.3) % 1; setTransform(br.g, `translate(${r2(1700 - k * 1900)} ${r2(150 + Math.sin(t / 800) * 18)}) scale(-1 1)`); setAttr(br.wing, 'd', Math.sin(t / 130) > 0 ? 'M-18 0 Q -9 -12 0 0 Q 9 -12 18 0' : 'M-18 -6 Q -9 4 0 0 Q 9 4 18 -6'); } });
  return ambient;
}

const BACKGROUNDS = { backyard: bgBackyard, bedroom: bgBedroom, lounge: bgLounge, playground: bgPlayground };

export function buildBackground(sceneId, palette, { far, near, defs }) {
  const fn = BACKGROUNDS[sceneId] || bgBackyard;
  return fn(far, near, defs, palette);
}

/** Optional clip rects (normalized) so cameos appear only through a window/doorway. */
export const CAMEO_CLIPS = Object.freeze({
  backyard: { atWindow: { x: 516 / W, y: 186 / H, w: 120 / W, h: 110 / H } },
  bedroom: { '*': { x: 856 / W, y: 100 / H, w: 208 / W, h: 412 / H } },
});

/* ------------------------------------------------------------------ */
/* Foreground occluders: painters fill their (w,h) box centred at 0,0. */
/* ------------------------------------------------------------------ */

const OCCLUDERS = {
  tree(g, w, h) {
    // trunk fills box; canopy spills above
    el('path', { d: blob(0, -h / 2 - 30, w * 1.05, 110, { bumps: 11, wobble: 0.12, seed: 4 }), fill: '#5fae55', ...ink() }, g);
    el('path', { d: blob(-30, -h / 2 - 40, w * 0.7, 70, { bumps: 9, wobble: 0.1, seed: 2 }), fill: '#7cc76a' }, g);
    el('path', { d: `M${-w / 2 + 4} ${h / 2} Q ${-w / 2 + 14} 0 ${-w / 2 + 20} ${-h / 2} L${w / 2 - 20} ${-h / 2} Q ${w / 2 - 14} 0 ${w / 2 - 4} ${h / 2} Q ${w / 2 + 20} ${h / 2 + 8} ${w / 2 + 26} ${h / 2 + 4} L${-w / 2 - 26} ${h / 2 + 4} Q ${-w / 2 - 20} ${h / 2 + 8} ${-w / 2 + 4} ${h / 2} Z`, fill: '#a8714a', ...ink() }, g);
    for (let y = -h / 2 + 50; y < h / 2 - 20; y += 70) el('path', { d: `M${-w / 4} ${y} q 12 16 0 32 M${w / 5} ${y + 34} q -10 14 0 28`, stroke: '#7a4e31', 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' }, g);
    el('ellipse', { cx: 6, cy: -h / 6, rx: 18, ry: 24, fill: '#5d3b25', stroke: INK, 'stroke-width': 4 }, g);
    el('path', { d: blob(0, -h / 2 + 10, w * 0.95, 60, { bumps: 9, wobble: 0.14, seed: 7 }), fill: '#5fae55', ...ink() }, g);
  },
  bush(g, w, h) {
    el('path', { d: blob(0, 6, w / 2 + 6, h / 2 + 4, { bumps: 11, wobble: 0.12, seed: 1 }), fill: '#4f9a45', ...ink() }, g);
    el('path', { d: blob(-w * 0.12, -h * 0.1, w * 0.32, h * 0.3, { bumps: 8, wobble: 0.12, seed: 3 }), fill: '#6bbb5a' }, g);
    for (const [x, y, c] of [[-0.3, -0.1, '#ff8f9e'], [0.1, -0.25, '#ffd35c'], [0.28, 0.1, '#ff8f9e'], [-0.05, 0.2, '#fff']]) flowerAt(g, x * w, y * h, c, 0.7);
  },
  cubby(g, w, h) {
    el('path', { d: `M${-w / 2 - 20} ${-h / 2 + 50} L0 ${-h / 2 - 40} L${w / 2 + 20} ${-h / 2 + 50} Z`, fill: '#ff8f6b', ...ink() }, g);
    el('rect', { x: -w / 2, y: -h / 2 + 46, width: w, height: h - 46, fill: '#ffe08a', ...ink() }, g);
    el('rect', { x: -w / 2 + 16, y: -h / 2 + 76, width: w * 0.36, height: w * 0.3, rx: 8, fill: '#9fd8f2', stroke: INK, 'stroke-width': 4 }, g);
    el('path', { d: `M${w / 2 - 70} ${h / 2} L${w / 2 - 70} ${-h / 2 + 100} Q ${w / 2 - 40} ${-h / 2 + 80} ${w / 2 - 14} ${-h / 2 + 100} L${w / 2 - 14} ${h / 2} Z`, fill: '#b9a2e8', stroke: INK, 'stroke-width': 4 }, g);
    el('path', { d: `M${-w / 2 - 6} ${h / 2} L${w / 2 + 6} ${h / 2}`, stroke: INK, 'stroke-width': 8, 'stroke-linecap': 'round' }, g);
  },
  washingLine(g, w, h) {
    el('path', { d: `M${-w / 2 - 40} ${-h / 2 - 4} L${-w / 2 - 40} ${h / 2 + 120} M${w / 2 + 40} ${-h / 2 - 4} L${w / 2 + 40} ${h / 2 + 120}`, stroke: '#9aa3b5', 'stroke-width': 10, 'stroke-linecap': 'round' }, g);
    el('path', { d: `M${-w / 2 - 44} ${-h / 2} Q 0 ${-h / 2 + 18} ${w / 2 + 44} ${-h / 2}`, fill: 'none', stroke: INK, 'stroke-width': 3 }, g);
    // two overlapping sheets
    el('path', { d: `M${-w / 2} ${-h / 2 + 4} L${w * 0.08} ${-h / 2 + 10} L${w * 0.08} ${h / 2 - 6} Q ${-w * 0.2} ${h / 2 + 10} ${-w / 2} ${h / 2} Z`, fill: '#ffd3e0', ...ink() }, g);
    el('path', { d: `M${-w / 2 + 20} ${-h / 2 + 40} L${w * 0.0} ${-h / 2 + 40} M${-w / 2 + 20} ${-h / 2 + 80} L${w * 0.0} ${-h / 2 + 80}`, stroke: '#ff9ab3', 'stroke-width': 8, 'stroke-linecap': 'round' }, g);
    el('path', { d: `M${-w * 0.08} ${-h / 2 + 10} L${w / 2} ${-h / 2 + 4} L${w / 2} ${h / 2} Q ${w * 0.2} ${h / 2 + 12} ${-w * 0.08} ${h / 2 - 4} Z`, fill: '#bde3f7', ...ink() }, g);
    for (const [x, y] of [[0.15, -0.1], [0.32, 0.12], [0.2, 0.3]]) el('circle', { cx: x * w, cy: y * h, r: 10, fill: '#fff', stroke: '#7fbde8', 'stroke-width': 3 }, g);
    for (const x of [-w / 2 + 6, -w * 0.05, w * 0.12, w / 2 - 10]) el('rect', { x: x - 4, y: -h / 2 - 6, width: 8, height: 18, rx: 2, fill: '#ffd35c', stroke: INK, 'stroke-width': 2.5 }, g);
  },
  shed(g, w, h) {
    el('path', { d: `M${-w / 2 - 16} ${-h / 2 + 30} L${w / 2 + 16} ${-h / 2} L${w / 2 + 16} ${-h / 2 + 30} L${-w / 2 - 16} ${-h / 2 + 56} Z`, fill: '#8a9bb5', ...ink() }, g);
    el('path', { d: `M${-w / 2} ${-h / 2 + 50} L${w / 2} ${-h / 2 + 26} L${w / 2} ${h / 2} L${-w / 2} ${h / 2} Z`, fill: '#c3d3a6', ...ink() }, g);
    for (let x = -w / 2 + 24; x < w / 2; x += 24) el('path', { d: `M${x} ${-h / 2 + 60} L${x} ${h / 2 - 4}`, stroke: '#a6b98a', 'stroke-width': 3 }, g);
    el('rect', { x: -w * 0.28, y: -h * 0.12, width: w * 0.56, height: h * 0.62, rx: 6, fill: '#e9785c', stroke: INK, 'stroke-width': 5 }, g);
    el('path', { d: `M${-w * 0.28} ${-h * 0.12} L${w * 0.28} ${h * 0.5} M${w * 0.28} ${-h * 0.12} L${-w * 0.28} ${h * 0.5}`, stroke: '#c4573e', 'stroke-width': 5 }, g);
    el('circle', { cx: w * 0.2, cy: h * 0.2, r: 6, fill: '#ffd35c', stroke: INK, 'stroke-width': 3 }, g);
  },
  trampoline(g, w, h) {
    // safety-net poles behind, padded rim, springs and a skirt to the grass
    for (const x of [-w / 2 + 10, w / 2 - 10]) el('path', { d: `M${x} ${-h / 2 + 20} L${x} ${-h / 2 - 90} Q ${x} ${-h / 2 - 110} ${x - Math.sign(x) * 16} ${-h / 2 - 112}`, stroke: '#ffc93c', 'stroke-width': 9, fill: 'none', 'stroke-linecap': 'round' }, g);
    el('path', { d: `M${-w / 2 + 6} ${-h / 2 + 22} L${-w / 2 + 14} ${h / 2} L${w / 2 - 14} ${h / 2} L${w / 2 - 6} ${-h / 2 + 22} Z`, fill: '#3f5fb0', ...ink() }, g);
    for (let i = -2; i <= 2; i += 1) el('path', { d: `M${i * w / 6} ${-h / 2 + 50} L${i * w / 5.6} ${h / 2 - 6}`, stroke: '#5f80d0', 'stroke-width': 14 }, g);
    let hem = `M${-w / 2 + 14} ${h / 2 - 10}`;
    for (let x = -w / 2 + 14; x < w / 2 - 20; x += 30) hem += ' q 15 12 30 0';
    el('path', { d: hem, fill: 'none', stroke: '#ffc93c', 'stroke-width': 5 }, g);
    el('ellipse', { cx: 0, cy: -h / 2 + 24, rx: w / 2 + 6, ry: 28, fill: '#6f8cff', ...ink() }, g);
    el('ellipse', { cx: 0, cy: -h / 2 + 24, rx: w / 2 - 22, ry: 17, fill: '#1f2a4d' }, g);
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * Math.PI * 2;
      const x1 = Math.cos(a) * (w / 2 - 22);
      const y1 = -h / 2 + 24 + Math.sin(a) * 17;
      el('path', { d: `M${r2(x1)} ${r2(y1)} L${r2(x1 * 1.12)} ${r2(-h / 2 + 24 + Math.sin(a) * 25)}`, stroke: '#c9d6e8', 'stroke-width': 3 }, g);
    }
    el('path', { d: `M${-w / 2 + 14} ${h / 2} L${w / 2 - 14} ${h / 2}`, stroke: INK, 'stroke-width': 6, 'stroke-linecap': 'round' }, g);
  },
  box(g, w, h) {
    el('path', { d: `M${-w / 2} ${-h / 2 + 20} L${-w / 2 - 34} ${-h / 2 - 14} L${-w / 2 + 6} ${-h / 2 - 22} L${-w / 2 + 26} ${-h / 2 + 20} Z`, fill: '#e3b57a', ...ink() }, g);
    el('path', { d: `M${w / 2} ${-h / 2 + 20} L${w / 2 + 30} ${-h / 2 - 18} L${w / 2 - 10} ${-h / 2 - 22} L${w / 2 - 26} ${-h / 2 + 20} Z`, fill: '#e3b57a', ...ink() }, g);
    el('rect', { x: -w / 2, y: -h / 2 + 18, width: w, height: h - 18, rx: 6, fill: '#d6a064', ...ink() }, g);
    el('path', { d: `M${-w / 2 + 10} ${-h / 2 + 50} L${w / 2 - 10} ${-h / 2 + 50}`, stroke: '#b98348', 'stroke-width': 5 }, g);
    el('path', { d: `M-20 ${h / 6} l14 -14 l14 14 M-6 ${h / 6 - 14} l0 34`, stroke: INK, 'stroke-width': 4, fill: 'none' }, g);
    const p = createPaw(g, { fill: '#ff8f9e', strokeWidth: 3 });
    setTransform(p, `translate(${w * 0.22} ${h * 0.18}) scale(0.45)`);
  },
  curtain(g, w, h) {
    el('rect', { x: -w / 2 - 30, y: -h / 2 - 12, width: w + 60, height: 18, rx: 9, fill: '#a8683f', ...ink({ 'stroke-width': 4 }) }, g);
    el('path', { d: `M${-w / 2} ${-h / 2} L${w / 2} ${-h / 2} Q ${w / 2 + 10} 0 ${w / 2 - 6} ${h / 2} Q ${w / 4} ${h / 2 + 12} 0 ${h / 2} Q ${-w / 4} ${h / 2 + 12} ${-w / 2 + 6} ${h / 2} Q ${-w / 2 - 10} 0 ${-w / 2} ${-h / 2} Z`, fill: '#ff9ab3', ...ink() }, g);
    for (const x of [-w / 4, 0, w / 4]) el('path', { d: `M${x} ${-h / 2 + 10} Q ${x + 8} 0 ${x} ${h / 2 - 10}`, stroke: '#e5728f', 'stroke-width': 6, fill: 'none', 'stroke-linecap': 'round' }, g);
    for (let y = -h / 2 + 50; y < h / 2 - 20; y += 90) for (const x of [-w / 3, w / 6]) el('circle', { cx: x, cy: y, r: 7, fill: '#fff3b0', stroke: INK, 'stroke-width': 2.5 }, g);
  },
  blanket(g, w, h) {
    // lumpy duvet heaped on the bed
    el('path', { d: `M${-w / 2 - 12} ${h / 2} L${-w / 2 - 4} ${-h / 2 + 34} Q ${-w * 0.3} ${-h / 2 - 6} ${-w * 0.08} ${-h / 2 + 16} Q ${w * 0.14} ${-h / 2 - 14} ${w * 0.32} ${-h / 2 + 18} Q ${w / 2 + 6} ${-h / 2 + 20} ${w / 2 + 12} ${h / 2} Z`, fill: '#b9a2e8', ...ink() }, g);
    for (let x = -w / 2 + 30; x < w / 2; x += 46) for (let y = -h / 2 + 40; y < h / 2 - 6; y += 38) el('rect', { x: x - 7, y: y - 7, width: 14, height: 14, rx: 3, fill: '#d8ccfa', transform: `rotate(45 ${x} ${y})` }, g);
    el('path', { d: `M${-w / 2 - 12} ${h / 2 - 22} Q 0 ${h / 2 - 10} ${w / 2 + 12} ${h / 2 - 22}`, fill: 'none', stroke: '#fff', 'stroke-width': 6, 'stroke-linecap': 'round', opacity: 0.8 }, g);
    el('path', { d: `M${-w / 2 - 12} ${h / 2} L${w / 2 + 12} ${h / 2}`, stroke: INK, 'stroke-width': 6 }, g);
  },
  underBed(g, w, h) {
    el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 14, fill: '#7fd1c1', ...ink() }, g);
    // valance frill
    let d = `M${-w / 2} ${-h / 2 + 20}`;
    for (let x = -w / 2; x < w / 2; x += 40) d += ` q 20 26 40 0`;
    el('path', { d, fill: 'none', stroke: '#fff', 'stroke-width': 6 }, g);
    el('path', { d: `M${-w / 2 + 6} ${h / 2} l0 18 M${w / 2 - 6} ${h / 2} l0 18`, stroke: INK, 'stroke-width': 12, 'stroke-linecap': 'round' }, g);
  },
  toyBox(g, w, h) {
    el('rect', { x: -w / 2, y: -h / 2 + 10, width: w, height: h - 10, rx: 10, fill: '#ff8f6b', ...ink() }, g);
    el('path', { d: `M${-w / 2 - 6} ${-h / 2 + 14} L${-w / 2 + 6} ${-h / 2 - 34} L${w / 2 + 18} ${-h / 2 - 50} L${w / 2 + 6} ${-h / 2 + 6}`, fill: '#ffd35c', ...ink() }, g);
    el('path', { d: `M${-w / 2} ${-h / 2 + 40} L${w / 2} ${-h / 2 + 40}`, stroke: '#ffd35c', 'stroke-width': 12 }, g);
    el('path', { d: starPath(22), transform: `translate(${-w * 0.2} ${h * 0.15})`, fill: '#fff3b0', stroke: INK, 'stroke-width': 3.5 }, g);
    el('circle', { cx: w * 0.22, cy: h * 0.15, r: 18, fill: '#7fd1c1', stroke: INK, 'stroke-width': 3.5 }, g);
  },
  stuffedToy(g, w, h) {
    // giant teddy bear
    const c = '#c98b5a';
    el('circle', { cx: -w * 0.32, cy: -h / 2 + 22, r: 26, fill: c, ...ink() }, g);
    el('circle', { cx: w * 0.32, cy: -h / 2 + 22, r: 26, fill: c, ...ink() }, g);
    el('ellipse', { cx: 0, cy: h * 0.18, rx: w / 2 + 4, ry: h * 0.34, fill: c, ...ink() }, g);
    el('ellipse', { cx: 0, cy: h * 0.22, rx: w * 0.3, ry: h * 0.22, fill: '#f0caa0' }, g);
    el('ellipse', { cx: 0, cy: -h * 0.2, rx: w * 0.46, ry: h * 0.3, fill: c, ...ink() }, g);
    el('ellipse', { cx: 0, cy: -h * 0.12, rx: w * 0.2, ry: h * 0.1, fill: '#f0caa0', stroke: INK, 'stroke-width': 4 }, g);
    el('ellipse', { cx: 0, cy: -h * 0.16, rx: 10, ry: 7, fill: INK }, g);
    el('circle', { cx: -w * 0.16, cy: -h * 0.27, r: 7, fill: INK }, g);
    el('circle', { cx: w * 0.16, cy: -h * 0.27, r: 7, fill: INK }, g);
    el('path', { d: `M${-w * 0.2} ${h * 0.0} L${w * 0.2} ${h * 0.0} L0 ${h * 0.08} Z`, fill: '#ff6f8a', stroke: INK, 'stroke-width': 3.5 }, g);
    el('ellipse', { cx: -w * 0.34, cy: h / 2 - 8, rx: 26, ry: 18, fill: c, ...ink() }, g);
    el('ellipse', { cx: w * 0.34, cy: h / 2 - 8, rx: 26, ry: 18, fill: c, ...ink() }, g);
  },
  wardrobe(g, w, h) {
    el('rect', { x: -w / 2 - 6, y: -h / 2 - 16, width: w + 12, height: 24, rx: 6, fill: '#8f5b37', ...ink({ 'stroke-width': 5 }) }, g);
    el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 8, fill: '#e8b98a', ...ink() }, g);
    el('path', { d: `M0 ${-h / 2 + 10} L0 ${h / 2 - 40}`, stroke: INK, 'stroke-width': 5 }, g);
    el('rect', { x: -w / 2 + 14, y: h / 2 - 36, width: w - 28, height: 26, rx: 5, fill: '#d9a674', stroke: INK, 'stroke-width': 4 }, g);
    el('circle', { cx: -12, cy: 0, r: 7, fill: '#ffd35c', stroke: INK, 'stroke-width': 3 }, g);
    el('circle', { cx: 12, cy: 0, r: 7, fill: '#ffd35c', stroke: INK, 'stroke-width': 3 }, g);
    el('rect', { x: -w / 2 + 16, y: -h / 2 + 26, width: w / 2 - 30, height: h * 0.35, rx: 6, fill: '#f3cda3', stroke: '#c9935f', 'stroke-width': 3 }, g);
    el('rect', { x: 14, y: -h / 2 + 26, width: w / 2 - 30, height: h * 0.35, rx: 6, fill: '#f3cda3', stroke: '#c9935f', 'stroke-width': 3 }, g);
  },
  laundryBasket(g, w, h) {
    el('path', { d: blob(0, -h / 2 + 6, w * 0.45, 26, { bumps: 8, wobble: 0.2, seed: 5 }), fill: '#ffd3e0', ...ink({ 'stroke-width': 4 }) }, g);
    el('path', { d: `M${-w / 2} ${-h / 2 + 10} L${w / 2} ${-h / 2 + 10} L${w / 2 - 12} ${h / 2} L${-w / 2 + 12} ${h / 2} Z`, fill: '#7fbde8', ...ink() }, g);
    for (let y = -h / 2 + 34; y < h / 2 - 6; y += 24) el('path', { d: `M${-w / 2 + 10} ${y} L${w / 2 - 10} ${y}`, stroke: '#4f8fc4', 'stroke-width': 5 }, g);
  },
  armchair(g, w, h) {
    el('rect', { x: -w / 2 + 10, y: -h / 2, width: w - 20, height: h * 0.7, rx: 40, fill: '#4fb3a9', ...ink() }, g);
    el('rect', { x: -w / 2, y: -h / 2 + h * 0.4, width: w, height: h * 0.5, rx: 24, fill: '#3f9a91', ...ink() }, g);
    el('rect', { x: -w / 2 - 10, y: -h / 2 + h * 0.34, width: 40, height: h * 0.5, rx: 18, fill: '#4fb3a9', ...ink() }, g);
    el('rect', { x: w / 2 - 30, y: -h / 2 + h * 0.34, width: 40, height: h * 0.5, rx: 18, fill: '#4fb3a9', ...ink() }, g);
    el('path', { d: `M${-w / 2 + 12} ${h / 2 - 12} l-4 18 M${w / 2 - 12} ${h / 2 - 12} l4 18`, stroke: INK, 'stroke-width': 10, 'stroke-linecap': 'round' }, g);
    for (const x of [-w / 6, w / 6]) el('circle', { cx: x, cy: -h / 4, r: 5, fill: '#2e7f78' }, g);
  },
  couch(g, w, h) {
    el('rect', { x: -w / 2 + 20, y: -h / 2, width: w - 40, height: h * 0.62, rx: 34, fill: '#ff8f6b', ...ink() }, g);
    for (const x of [-w / 4, w / 4]) el('rect', { x: x - w / 4 + 26, y: -h / 2 + 18, width: w / 2 - 52, height: h * 0.42, rx: 24, fill: '#ffa98a', stroke: INK, 'stroke-width': 4 }, g);
    el('rect', { x: -w / 2 + 10, y: -h / 2 + h * 0.5, width: w - 20, height: h * 0.5, rx: 18, fill: '#e9785c', ...ink() }, g);
    el('rect', { x: -w / 2 - 14, y: -h / 2 + h * 0.3, width: 50, height: h * 0.7, rx: 22, fill: '#ff8f6b', ...ink() }, g);
    el('rect', { x: w / 2 - 36, y: -h / 2 + h * 0.3, width: 50, height: h * 0.7, rx: 22, fill: '#ff8f6b', ...ink() }, g);
    el('path', { d: `M0 ${-h / 2 + h * 0.52} L0 ${h / 2 - 6}`, stroke: '#c4573e', 'stroke-width': 4 }, g);
  },
  underCouch(g, w, h) {
    el('rect', { x: -w / 2 - 14, y: -h / 2, width: w + 28, height: h, rx: 12, fill: '#c4573e', ...ink() }, g);
    let d = `M${-w / 2 - 10} ${h / 2 - 8}`;
    for (let x = -w / 2 - 10; x < w / 2 + 10; x += 22) d += ` l11 10 l11 -10`;
    el('path', { d, fill: 'none', stroke: '#ffd35c', 'stroke-width': 5 }, g);
    el('path', { d: `M${-w / 2} ${h / 2} l-4 16 M${w / 2} ${h / 2} l4 16`, stroke: INK, 'stroke-width': 10, 'stroke-linecap': 'round' }, g);
  },
  cushions(g, w, h) {
    const cols = ['#ffd35c', '#b9a2e8', '#4fb3a9'];
    [[-w * 0.2, h * 0.18, 0], [w * 0.2, h * 0.16, 1], [0, -h * 0.14, 2]].forEach(([x, y, i]) => {
      el('path', { d: `M${x - w * 0.34} ${y - h * 0.3} Q ${x} ${y - h * 0.4} ${x + w * 0.34} ${y - h * 0.3} Q ${x + w * 0.42} ${y} ${x + w * 0.34} ${y + h * 0.3} Q ${x} ${y + h * 0.4} ${x - w * 0.34} ${y + h * 0.3} Q ${x - w * 0.42} ${y} ${x - w * 0.34} ${y - h * 0.3} Z`, fill: cols[i], ...ink({ 'stroke-width': 5 }) }, g);
      el('circle', { cx: x, cy: y, r: 5, fill: INK, opacity: 0.6 }, g);
    });
  },
  cabinet(g, w, h) {
    el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 8, fill: '#a87047', ...ink() }, g);
    for (let i = 0; i < 3; i += 1) {
      const y = -h / 2 + 12 + i * (h / 3);
      el('rect', { x: -w / 2 + 12, y, width: w - 24, height: h / 3 - 18, rx: 4, fill: '#8f5b37', stroke: INK, 'stroke-width': 3 }, g);
    }
    const books = ['#ff8f6b', '#4fb3a9', '#ffd35c', '#b9a2e8', '#7fbde8'];
    books.forEach((c, i) => el('rect', { x: -w / 2 + 18 + i * 22, y: -h / 2 + 22, width: 18, height: h / 3 - 36, rx: 3, fill: c, stroke: INK, 'stroke-width': 3 }, g));
    el('circle', { cx: w / 4, cy: -h / 2 + h / 3 + 46, r: 22, fill: '#9be08f', stroke: INK, 'stroke-width': 3 }, g);
    el('rect', { x: -w / 2 + 18, y: -h / 2 + 2 * h / 3 + 16, width: w - 36, height: 8, fill: '#c98b5a' }, g);
  },
  blanketFort(g, w, h) {
    el('path', { d: `M${-w / 2 - 10} ${h / 2} L${-w / 2 + 10} ${-h / 2 + 20} Q 0 ${-h / 2 - 20} ${w / 2 - 10} ${-h / 2 + 20} L${w / 2 + 10} ${h / 2} Z`, fill: '#ffd35c', ...ink() }, g);
    for (let x = -w / 2 + 16; x < w / 2; x += 34) el('path', { d: `M${x} ${-h / 2 + 34} L${x * 1.12} ${h / 2 - 4}`, stroke: '#ff8f6b', 'stroke-width': 10 }, g);
    el('path', { d: `M${-w * 0.15} ${h / 2} Q 0 ${-h * 0.05} ${w * 0.15} ${h / 2} Z`, fill: '#a07b58', stroke: INK, 'stroke-width': 4 }, g);
    el('path', { d: `M${-w / 2 + 10} ${-h / 2 + 20} L${-w / 2 - 6} ${-h / 2 - 20} L${-w / 2 + 30} ${-h / 2 - 10}`, fill: '#ff8f6b', stroke: INK, 'stroke-width': 4 }, g);
  },
  slide(g, w, h) {
    // enclosed tower fills the box; the chute swoops out to the right
    el('path', { d: `M${w * 0.2} ${-h / 2 + 30} Q ${w * 0.55} ${-h * 0.1} ${w * 0.62} ${h * 0.3} Q ${w * 0.72} ${h / 2} ${w / 2 + 90} ${h / 2} L${w / 2 + 90} ${h / 2 - 34} Q ${w * 0.78} ${h / 2 - 40} ${w * 0.56} ${h * 0.0} Q ${w * 0.4} ${-h * 0.3} ${w * 0.2} ${-h / 2 + 30} Z`, fill: '#ffc93c', ...ink() }, g);
    el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 12, fill: '#6f8cff', ...ink() }, g);
    el('rect', { x: -w / 2 + 14, y: -h / 2 + 18, width: w - 28, height: h * 0.3, rx: 10, fill: '#9fb2ff', stroke: INK, 'stroke-width': 4 }, g);
    el('circle', { cx: 0, cy: -h / 2 + 18 + h * 0.15, r: Math.min(w, h) * 0.12, fill: '#ffc93c', stroke: INK, 'stroke-width': 4 }, g);
    for (let y = -h / 2 + h * 0.42; y < h / 2 - 10; y += 40) el('path', { d: `M${-w / 2 + 18} ${y} L${w / 2 - 18} ${y}`, stroke: '#ffc93c', 'stroke-width': 9, 'stroke-linecap': 'round' }, g);
    el('path', { d: `M${-w / 2 - 14} ${-h / 2 - 4} L${w / 2 + 14} ${-h / 2 - 4} L${w / 2 - 4} ${-h / 2 - 54} L${-w / 2 + 4} ${-h / 2 - 54} Z`, fill: '#ff6f61', ...ink() }, g);
    el('path', { d: `M${w / 2} ${-h / 2 + 24} Q ${w / 2 + 50} ${-h / 2 + 40} ${w / 2 + 70} ${-h * 0.05}`, fill: 'none', stroke: '#ffc93c', 'stroke-width': 20, 'stroke-linecap': 'round' }, g);
  },
  hill(g, w, h) {
    el('path', { d: `M${-w / 2 - 40} ${h / 2} Q ${-w / 2} ${-h / 2 - 20} 0 ${-h / 2} Q ${w / 2} ${-h / 2 - 20} ${w / 2 + 40} ${h / 2} Z`, fill: '#7cc76a', ...ink() }, g);
    for (const [x, y] of [[-0.25, 0], [0.1, -0.2], [0.3, 0.15]]) tuft(g, x * w, y * h, '#5fa646', 0.8);
    flowerAt(g, -w * 0.05, h * 0.1, '#ff8f9e', 0.7);
  },
  climbingFrame(g, w, h) {
    el('path', { d: `M${-w / 2} ${h / 2} L${-w / 2} ${-h / 2} M${w / 2} ${h / 2} L${w / 2} ${-h / 2}`, stroke: '#ff6f61', 'stroke-width': 16, 'stroke-linecap': 'round' }, g);
    el('rect', { x: -w / 2 + 4, y: -h / 2 + 20, width: w - 8, height: h - 30, rx: 12, fill: '#ffc93c', ...ink() }, g);
    const holds = ['#6f8cff', '#ff6f61', '#9be08f', '#b9a2e8'];
    for (let i = 0; i < 10; i += 1) {
      const x = -w / 2 + 30 + ((i * 53) % (w - 60));
      const y = -h / 2 + 50 + ((i * 71) % (h - 100));
      el('path', { d: blob(x, y, 13, 10, { bumps: 6, wobble: 0.2, seed: i }), fill: holds[i % 4], stroke: INK, 'stroke-width': 3 }, g);
    }
    el('rect', { x: -w / 2 - 14, y: -h / 2 - 8, width: w + 28, height: 26, rx: 8, fill: '#6f8cff', ...ink() }, g);
  },
  playhouse(g, w, h) {
    el('path', { d: `M${-w / 2 - 22} ${-h / 2 + 60} L0 ${-h / 2 - 30} L${w / 2 + 22} ${-h / 2 + 60} Z`, fill: '#6f8cff', ...ink() }, g);
    el('rect', { x: -w / 2, y: -h / 2 + 56, width: w, height: h - 56, fill: '#ff6f61', ...ink() }, g);
    el('path', { d: `M${-w * 0.2} ${h / 2} L${-w * 0.2} ${h * 0.02} Q 0 ${-h * 0.1} ${w * 0.2} ${h * 0.02} L${w * 0.2} ${h / 2} Z`, fill: '#c4473e', stroke: INK, 'stroke-width': 4 }, g);
    el('circle', { cx: 0, cy: -h / 2 + 30, r: 18, fill: '#ffeaa8', stroke: INK, 'stroke-width': 4 }, g);
    el('path', { d: `M${-w / 2 - 6} ${h / 2} L${w / 2 + 6} ${h / 2}`, stroke: INK, 'stroke-width': 8, 'stroke-linecap': 'round' }, g);
  },
  tunnel(g, w, h) {
    el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: h / 2, fill: '#6f8cff', ...ink() }, g);
    for (let x = -w / 2 + 40; x < w / 2 - 20; x += 40) el('path', { d: `M${x} ${-h / 2 + 4} Q ${x + 10} 0 ${x} ${h / 2 - 4}`, stroke: '#9fb2ff', 'stroke-width': 8, fill: 'none' }, g);
    el('ellipse', { cx: -w / 2 + h * 0.28, cy: 0, rx: h * 0.3, ry: h / 2 - 2, fill: '#ffc93c', ...ink() }, g);
    el('ellipse', { cx: -w / 2 + h * 0.28, cy: 4, rx: h * 0.18, ry: h / 2 - 22, fill: '#2b3a6e' }, g);
  },
  picnicTable(g, w, h) {
    el('rect', { x: -w / 2 - 20, y: -h / 2, width: w + 40, height: 26, rx: 8, fill: '#b07a4f', ...ink() }, g);
    // gingham tablecloth draped to the grass
    el('path', { d: `M${-w / 2 - 10} ${-h / 2 + 10} L${w / 2 + 10} ${-h / 2 + 10} L${w / 2} ${h / 2} Q 0 ${h / 2 + 12} ${-w / 2} ${h / 2} Z`, fill: '#ff8f9e', ...ink() }, g);
    for (let x = -w / 2 + 10; x < w / 2; x += 34) el('path', { d: `M${x} ${-h / 2 + 12} L${x} ${h / 2}`, stroke: '#fff', 'stroke-width': 12, opacity: 0.6 }, g);
    for (let y = -h / 2 + 26; y < h / 2; y += 34) el('path', { d: `M${-w / 2 + 2} ${y} L${w / 2 - 2} ${y}`, stroke: '#fff', 'stroke-width': 12, opacity: 0.6 }, g);
    el('rect', { x: -w / 2 - 50, y: h / 4, width: w + 100, height: 18, rx: 6, fill: '#b07a4f', ...ink({ 'stroke-width': 5 }) }, g);
    el('circle', { cx: w * 0.2, cy: -h / 2 - 16, r: 18, fill: '#ff6f61', stroke: INK, 'stroke-width': 4 }, g);
    el('path', { d: `M${w * 0.2} ${-h / 2 - 34} l4 -10`, stroke: '#5fa646', 'stroke-width': 5, 'stroke-linecap': 'round' }, g);
  },
};

const OCCLUDER_ALIASES = { washing: 'washingLine', bed: 'underBed', toy: 'toyBox', teddy: 'stuffedToy', basket: 'laundryBasket', sofa: 'couch', fort: 'blanketFort', table: 'picnicTable', frame: 'climbingFrame' };

export function paintOccluder(kind, g, w, h, sceneId) {
  let fn = OCCLUDERS[kind];
  if (!fn) {
    const key = Object.keys(OCCLUDER_ALIASES).find((k) => String(kind).toLowerCase().includes(k));
    fn = key ? OCCLUDERS[OCCLUDER_ALIASES[key]] : (sceneId === 'bedroom' || sceneId === 'lounge' ? OCCLUDERS.box : OCCLUDERS.bush);
  }
  fn(g, w, h);
}

/* ------------------------------------------------------------------ */
/* Interactive props. Painter returns {update(t, effect|null)}.        */
/* ------------------------------------------------------------------ */

function wobbleUpdate(node, amp = 10) {
  return (t, fx) => {
    const k = fx ? 1 - fx.ageMs / fx.durationMs : 0;
    setTransform(node, k > 0 ? `rotate(${r2(Math.sin(t / 50) * amp * k)})` : '');
  };
}

const PROPS = {
  flower(g, w, h) {
    const s = el('g', {}, g);
    el('path', { d: `M0 ${h / 2} Q -6 0 0 ${-h * 0.1}`, stroke: '#3f8a3a', 'stroke-width': 7, fill: 'none', 'stroke-linecap': 'round' }, s);
    el('path', { d: `M0 ${h * 0.25} Q -30 ${h * 0.1} -30 ${h * 0.3} Q -12 ${h * 0.38} 0 ${h * 0.25} Z`, fill: '#5fae55', stroke: INK, 'stroke-width': 3.5 }, s);
    const head = el('g', { transform: `translate(0 ${-h * 0.18})` }, s);
    for (let i = 0; i < 7; i += 1) el('ellipse', { cx: 0, cy: -w * 0.2, rx: w * 0.13, ry: w * 0.2, fill: '#ff8f9e', stroke: INK, 'stroke-width': 3.5, transform: `rotate(${i * 51.4})` }, head);
    el('circle', { r: w * 0.13, fill: '#ffd35c', stroke: INK, 'stroke-width': 3.5 }, head);
    const bf = butterfly(g, '#b9a2e8');
    setAttr(bf.g, 'display', 'none');
    return (t, fx) => {
      wobbleUpdate(s, 12)(t, fx);
      if (fx && fx.ageMs < fx.durationMs) {
        const k = fx.ageMs / fx.durationMs;
        setAttr(bf.g, 'display', 'inline');
        setTransform(bf.g, `translate(${r2(Math.sin(k * 9) * 60)} ${r2(-h * 0.2 - k * 220)})`);
        setTransform(bf.wings, `scale(${r2(0.3 + Math.abs(Math.sin(t / 60)) * 0.7)} 1)`);
      } else setAttr(bf.g, 'display', 'none');
    };
  },
  ball(g, w, h) {
    const r = Math.min(w, h) * 0.42;
    const b = el('g', {}, g);
    el('ellipse', { cx: 0, cy: h / 2 - 4, rx: r * 0.9, ry: 8, fill: INK, opacity: 0.15 }, g);
    el('circle', { cx: 0, cy: h / 2 - r - 4, r, fill: '#ff6f61', ...ink() }, b);
    el('path', { d: `M${-r} ${h / 2 - r - 4} Q 0 ${h / 2 - r - 24} ${r} ${h / 2 - r - 4}`, stroke: '#fff', 'stroke-width': 8, fill: 'none' }, b);
    el('path', { d: `M0 ${h / 2 - 2 * r - 4} Q -18 ${h / 2 - r - 4} 0 ${h / 2 - 4}`, stroke: '#ffd35c', 'stroke-width': 8, fill: 'none' }, b);
    return (t, fx) => {
      if (fx && fx.ageMs < fx.durationMs) {
        const k = fx.ageMs / fx.durationMs;
        const x = Math.sin(k * Math.PI) * 120;
        const y = -Math.abs(Math.sin(k * Math.PI * 3)) * 60 * (1 - k);
        setTransform(b, `translate(${r2(x)} ${r2(y)}) rotate(${r2(x * 3)} 0 ${r2(h / 2 - r - 4)})`);
      } else setTransform(b, '');
    };
  },
  sprinkler(g, w, h) {
    const base = el('g', {}, g);
    el('ellipse', { cx: 0, cy: h / 2 - 8, rx: w * 0.4, ry: 12, fill: '#4fb3a9', ...ink({ 'stroke-width': 4 }) }, base);
    el('rect', { x: -8, y: -h * 0.1, width: 16, height: h * 0.5, fill: '#ffd35c', stroke: INK, 'stroke-width': 4 }, base);
    const head = el('g', { transform: `translate(0 ${-h * 0.1})` }, base);
    el('rect', { x: -w * 0.3, y: -6, width: w * 0.6, height: 12, rx: 6, fill: '#ff8f6b', stroke: INK, 'stroke-width': 4 }, head);
    const spray = el('g', { opacity: 0 }, g);
    for (const a of [-60, -30, 0, 30, 60]) el('path', { d: 'M0 -10 Q 30 -120 70 -40', stroke: '#7fd4ff', 'stroke-width': 5, fill: 'none', 'stroke-dasharray': '10 10', transform: `rotate(${a - 90} 0 -10) scale(1 1)` }, spray);
    return (t, fx) => {
      const on = fx && fx.ageMs < fx.durationMs;
      setTransform(head, `translate(0 ${r2(-h * 0.1)}) rotate(${on ? r2(Math.sin(t / 120) * 30) : 0})`);
      setAttr(spray, 'opacity', on ? r2(1 - fx.ageMs / fx.durationMs) : 0);
      setTransform(spray, `translate(0 ${r2(-h * 0.1)}) rotate(${on ? r2(Math.sin(t / 120) * 30) : 0})`);
    };
  },
  puddle(g, w, h) {
    el('path', { d: blob(0, 0, w / 2, h / 2, { bumps: 9, wobble: 0.12, seed: 2 }), fill: '#8fd0f5', ...ink({ 'stroke-width': 4 }) }, g);
    el('path', { d: `M${-w * 0.25} ${-h * 0.1} Q 0 ${-h * 0.25} ${w * 0.2} ${-h * 0.12}`, stroke: '#fff', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' }, g);
    const ring = el('ellipse', { rx: 10, ry: 4, fill: 'none', stroke: '#fff', 'stroke-width': 4, opacity: 0 }, g);
    return (t, fx) => {
      if (fx && fx.ageMs < fx.durationMs) {
        const k = fx.ageMs / fx.durationMs;
        setAttr(ring, 'rx', r2(10 + k * w * 0.45));
        setAttr(ring, 'ry', r2(4 + k * h * 0.4));
        setAttr(ring, 'opacity', r2(1 - k));
      } else setAttr(ring, 'opacity', 0);
    };
  },
  windChime(g, w, h) {
    const s = el('g', {}, g);
    el('path', { d: `M0 ${-h / 2} L0 ${-h / 2 + 16}`, stroke: INK, 'stroke-width': 3 }, s);
    el('ellipse', { cx: 0, cy: -h / 2 + 20, rx: w * 0.45, ry: 8, fill: '#b9a2e8', stroke: INK, 'stroke-width': 4 }, s);
    const tubes = [];
    [-0.3, -0.1, 0.1, 0.3].forEach((x, i) => {
      const tg = el('g', { transform: `translate(${x * w} ${-h / 2 + 24})` }, s);
      el('path', { d: 'M0 0 L0 12', stroke: INK, 'stroke-width': 2 }, tg);
      el('rect', { x: -5, y: 12, width: 10, height: 40 + (i % 2) * 18, rx: 4, fill: ['#ffd35c', '#7fd1c1', '#ff8f9e', '#7fbde8'][i], stroke: INK, 'stroke-width': 3 }, tg);
      tubes.push({ tg, x: x * w });
    });
    el('path', { d: `M0 ${-h / 2 + 24} L0 ${h / 2 - 10}`, stroke: INK, 'stroke-width': 2 }, s);
    el('path', { d: starPath(10), transform: `translate(0 ${h / 2 - 6})`, fill: '#ffd35c', stroke: INK, 'stroke-width': 2.5 }, s);
    return (t, fx) => {
      const k = fx && fx.ageMs < fx.durationMs ? 1 - fx.ageMs / fx.durationMs : 0;
      const breeze = Math.sin(t / 1300) * 3;
      tubes.forEach(({ tg, x }, i) => setTransform(tg, `translate(${r2(x)} ${r2(-h / 2 + 24)}) rotate(${r2(breeze + Math.sin(t / 80 + i * 1.7) * 22 * k)})`));
    };
  },
  lamp(g, w, h) {
    const glow = el('ellipse', { cx: 0, cy: -h * 0.15, rx: w * 1.4, ry: h * 0.7, fill: '#fff3a0', opacity: 0 }, g);
    el('path', { d: `M0 ${-h * 0.05} L0 ${h / 2 - 8}`, stroke: INK, 'stroke-width': 6 }, g);
    el('ellipse', { cx: 0, cy: h / 2 - 6, rx: w * 0.4, ry: 8, fill: '#a8683f', stroke: INK, 'stroke-width': 4 }, g);
    const shade = el('path', { d: `M${-w * 0.42} ${-h * 0.05} L${-w * 0.25} ${-h * 0.45} L${w * 0.25} ${-h * 0.45} L${w * 0.42} ${-h * 0.05} Z`, fill: '#ffd35c', ...ink({ 'stroke-width': 5 }) }, g);
    el('circle', { cx: 0, cy: -h * 0.02, r: 7, fill: '#fff', stroke: INK, 'stroke-width': 3 }, g);
    let on = false;
    let lastAge = Infinity;
    return (t, fx) => {
      if (fx && fx.ageMs < lastAge) on = !on; // new touch toggles
      lastAge = fx ? fx.ageMs : Infinity;
      setAttr(glow, 'opacity', on ? r2(0.55 + Math.sin(t / 400) * 0.08) : 0);
      setAttr(shade, 'fill', on ? '#fff3a0' : '#ffd35c');
    };
  },
  xylophone(g, w, h) {
    el('rect', { x: -w / 2, y: -h * 0.1, width: w, height: h * 0.35, rx: 8, fill: '#a8683f', ...ink({ 'stroke-width': 4 }) }, g);
    const cols = ['#ff6f61', '#ffc93c', '#9be08f', '#7fbde8', '#b9a2e8'];
    const bars = cols.map((c, i) => {
      const x = -w / 2 + 10 + i * ((w - 20) / 5);
      return el('rect', { x, y: -h * 0.45 + i * 3, width: (w - 20) / 5 - 6, height: h * 0.6 - i * 6, rx: 4, fill: c, stroke: INK, 'stroke-width': 3 }, g);
    });
    return (t, fx) => {
      const idx = fx && fx.ageMs < fx.durationMs ? Math.floor(fx.ageMs / 120) % 5 : -1;
      bars.forEach((b, i) => setTransform(b, i === idx ? 'translate(0 -6)' : ''));
    };
  },
  windUpToy(g, w, h) {
    const toy = el('g', {}, g);
    el('rect', { x: -w * 0.32, y: -h * 0.3, width: w * 0.64, height: h * 0.6, rx: 14, fill: '#9be08f', ...ink({ 'stroke-width': 4 }) }, toy);
    el('circle', { cx: -w * 0.12, cy: -h * 0.06, r: 5, fill: INK }, toy);
    el('circle', { cx: w * 0.12, cy: -h * 0.06, r: 5, fill: INK }, toy);
    el('path', { d: `M${-w * 0.1} ${h * 0.1} Q 0 ${h * 0.18} ${w * 0.1} ${h * 0.1}`, stroke: INK, 'stroke-width': 3, fill: 'none' }, toy);
    const key = el('path', { d: 'M0 0 L14 0 M14 -10 L14 10', stroke: '#ffc93c', 'stroke-width': 6, 'stroke-linecap': 'round' }, toy);
    const feet = el('path', { d: `M${-w * 0.18} ${h * 0.3} l0 10 M${w * 0.18} ${h * 0.3} l0 10`, stroke: INK, 'stroke-width': 6, 'stroke-linecap': 'round' }, toy);
    return (t, fx) => {
      const on = fx && fx.ageMs < fx.durationMs;
      const k = on ? fx.ageMs / fx.durationMs : 0;
      setTransform(toy, on ? `translate(${r2(Math.sin(k * Math.PI) * 70)} ${r2(-Math.abs(Math.sin(t / 60)) * 6)})` : '');
      setTransform(key, `translate(${r2(w * 0.32)} 0) rotate(${on ? r2(t / 3 % 360) : 0})`);
      setTransform(feet, on ? `translate(0 ${r2(Math.sin(t / 50) * 2)})` : '');
    };
  },
  balloon(g, w, h) {
    const b = el('g', {}, g);
    el('path', { d: `M0 ${h * 0.12} Q 10 ${h * 0.3} -4 ${h / 2}`, stroke: INK, 'stroke-width': 2.5, fill: 'none' }, b);
    el('ellipse', { cx: 0, cy: -h * 0.12, rx: w * 0.45, ry: h * 0.28, fill: '#ff8f9e', ...ink({ 'stroke-width': 4.5 }) }, b);
    el('path', { d: `M-6 ${h * 0.16} L6 ${h * 0.16} L0 ${h * 0.1} Z`, fill: '#ff8f9e', stroke: INK, 'stroke-width': 3 }, b);
    el('ellipse', { cx: -w * 0.15, cy: -h * 0.22, rx: 5, ry: 10, fill: '#fff', opacity: 0.7 }, b);
    return (t, fx) => {
      const k = fx && fx.ageMs < fx.durationMs ? fx.ageMs / fx.durationMs : 0;
      const lift = Math.sin(k * Math.PI) * 60;
      setTransform(b, `translate(${r2(Math.sin(t / 900) * 6)} ${r2(Math.sin(t / 700) * 5 - lift)}) rotate(${r2(Math.sin(t / 600) * 4 + Math.sin(k * 20) * 10 * (1 - k))})`);
    };
  },
  cushion(g, w, h) {
    const c = el('g', {}, g);
    el('path', { d: `M${-w / 2} ${-h / 2} Q 0 ${-h * 0.7} ${w / 2} ${-h / 2} Q ${w * 0.6} 0 ${w / 2} ${h / 2} Q 0 ${h * 0.7} ${-w / 2} ${h / 2} Q ${-w * 0.6} 0 ${-w / 2} ${-h / 2} Z`, fill: '#b9a2e8', ...ink({ 'stroke-width': 5 }) }, c);
    el('circle', { r: 6, fill: '#ffd35c', stroke: INK, 'stroke-width': 3 }, c);
    return (t, fx) => {
      const k = fx && fx.ageMs < fx.durationMs ? 1 - fx.ageMs / fx.durationMs : 0;
      const sq = 1 - Math.abs(Math.sin(t / 70)) * 0.3 * k;
      setTransform(c, `translate(0 ${r2(h / 2 * (1 - sq))}) scale(${r2(2 - sq)} ${r2(sq)})`);
    };
  },
  toy(g, w, h) {
    // jack-in-the-box
    el('rect', { x: -w * 0.35, y: -h * 0.1, width: w * 0.7, height: h * 0.6, rx: 6, fill: '#ff6f61', ...ink({ 'stroke-width': 4 }) }, g);
    el('path', { d: starPath(10), transform: `translate(0 ${h * 0.2})`, fill: '#ffd35c', stroke: INK, 'stroke-width': 2.5 }, g);
    const jack = el('g', {}, g);
    el('path', { d: 'M0 0 l-8 -8 l16 -8 l-16 -8 l16 -8 l-8 -8', stroke: INK, 'stroke-width': 3, fill: 'none' }, jack);
    el('circle', { cx: 0, cy: -52, r: 14, fill: '#fff3b0', stroke: INK, 'stroke-width': 3.5 }, jack);
    el('path', { d: 'M-14 -60 L0 -82 L14 -60 Z', fill: '#4fb3a9', stroke: INK, 'stroke-width': 3 }, jack);
    el('circle', { cx: -5, cy: -54, r: 2.5, fill: INK }, jack);
    el('circle', { cx: 5, cy: -54, r: 2.5, fill: INK }, jack);
    el('circle', { cx: 0, cy: -46, r: 3.5, fill: '#ff6f61' }, jack);
    return (t, fx) => {
      const k = fx && fx.ageMs < fx.durationMs ? fx.ageMs / fx.durationMs : 1;
      const up = k < 1 ? Math.min(1, k * 6) * (1 - Math.max(0, k - 0.8) * 5) : 0;
      setTransform(jack, `translate(0 ${r2(-h * 0.1)}) scale(1 ${r2(Math.max(0.01, up + Math.sin(t / 60) * 0.08 * up))})`);
    };
  },
  hangingDecoration(g, w, h) {
    const s = el('g', {}, g);
    el('path', { d: `M0 ${-h / 2} L0 ${-h * 0.1}`, stroke: INK, 'stroke-width': 3 }, s);
    const star = el('path', { d: starPath(w * 0.42), transform: `translate(0 ${h * 0.15})`, fill: '#ffd35c', ...ink({ 'stroke-width': 4 }) }, s);
    return (t, fx) => {
      const k = fx && fx.ageMs < fx.durationMs ? 1 - fx.ageMs / fx.durationMs : 0;
      setTransform(s, `rotate(${r2(Math.sin(t / 1400) * 4 + Math.sin(t / 90) * 18 * k)} 0 ${-h / 2})`);
      setTransform(star, `translate(0 ${r2(h * 0.15)}) scale(${r2(Math.cos(t / 120 * k) || 1)} 1)`);
    };
  },
  butterfly(g) {
    const b = butterfly(g, '#ffc93c');
    return (t, fx) => {
      const k = fx && fx.ageMs < fx.durationMs ? fx.ageMs / fx.durationMs : 0;
      const loop = Math.sin(k * Math.PI);
      setTransform(b.g, `translate(${r2(Math.sin(t / 900) * 12 + loop * Math.sin(k * 12) * 120)} ${r2(Math.cos(t / 700) * 8 - loop * 80)}) scale(1.6)`);
      setTransform(b.wings, `scale(${r2(0.35 + Math.abs(Math.sin(t / (k ? 40 : 110))) * 0.65)} 1)`);
    };
  },
  leaves(g, w, h) {
    el('path', { d: blob(0, 0, w * 0.6, h * 0.5, { bumps: 9, wobble: 0.15, seed: 6 }), fill: '#e9a23b', ...ink({ 'stroke-width': 4 }) }, g);
    el('path', { d: blob(-w * 0.1, -h * 0.1, w * 0.3, h * 0.25, { bumps: 7, wobble: 0.15, seed: 2 }), fill: '#f4c35a' }, g);
    const falling = [0, 1, 2].map((i) => el('path', { d: 'M0 -8 Q 10 0 0 8 Q -10 0 0 -8 Z', fill: ['#e9a23b', '#ff8f6b', '#c8d65a'][i], stroke: INK, 'stroke-width': 2.5, opacity: 0 }, g));
    return (t, fx) => {
      const k = fx && fx.ageMs < fx.durationMs ? fx.ageMs / fx.durationMs : -1;
      falling.forEach((leaf, i) => {
        if (k < 0) { setAttr(leaf, 'opacity', 0); return; }
        setAttr(leaf, 'opacity', r2(1 - k));
        setTransform(leaf, `translate(${r2((i - 1) * 30 + Math.sin(k * 10 + i) * 24)} ${r2(k * 220 + i * 10)}) rotate(${r2(k * 400 + i * 50)})`);
      });
    };
  },
};

export function paintProp(kind, g, w, h) {
  const fn = PROPS[kind] || PROPS.flower;
  return fn(g, w, h) || (() => {});
}
