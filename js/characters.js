// Code-native SVG character rigs for Blue Dog Scratch.
// Every character is built once from small SVG parts and then posed every
// frame by mutating transforms only (no rebuilds, no innerHTML).

export const SVG_NS = 'http://www.w3.org/2000/svg';
export const INK = '#24324f';

/** Create an SVG element safely (attributes set via setAttribute only). */
export function el(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    node.setAttribute(key, String(value));
  }
  if (parent) parent.appendChild(node);
  return node;
}

/** Set an attribute only when the value changed (cheap per-frame updates). */
export function setAttr(node, name, value) {
  if (!node) return;
  const key = `__a_${name}`;
  const str = String(value);
  if (node[key] === str) return;
  node[key] = str;
  node.setAttribute(name, str);
}

export function setTransform(node, value) {
  setAttr(node, 'transform', value);
}

export function setVisible(node, visible) {
  setAttr(node, 'display', visible ? 'inline' : 'none');
}

const f = (n) => (Math.round(n * 100) / 100).toString();
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const PALETTES = Object.freeze({
  blue: {
    fur: '#7fb2ea', dark: '#3d64ad', light: '#d4ebfb', belly: '#bcdcf6',
    nose: '#1e2a4a', tip: '#2b4886', earInner: '#a9cdf2', blush: '#f49bb0',
  },
  orange: {
    fur: '#f4a65b', dark: '#c8662f', light: '#fde8c0', belly: '#fad49c',
    nose: '#3b2a22', tip: '#b2552a', earInner: '#fbd2a0', blush: '#f2869c',
  },
  dad: {
    fur: '#5e7cad', dark: '#2f426c', light: '#efe1c4', belly: '#c7d1e2',
    nose: '#1c2440', tip: '#26365a', earInner: '#8ea6cc', blush: '#e99aa8',
  },
  mum: {
    fur: '#d98652', dark: '#9b4a27', light: '#f9e2bf', belly: '#f2c896',
    nose: '#33231c', tip: '#8a3d20', earInner: '#efb48a', blush: '#ee8e9c',
  },
});

// Kid proportions vs adult proportions. Local origin = centre of the body.
const BUILDS = {
  kid: { bodyRx: 50, bodyRy: 56, legLen: 38, armLen: 44, headY: -96, headRx: 64, headRy: 50, earH: 70 },
  adult: { bodyRx: 52, bodyRy: 78, legLen: 62, armLen: 62, headY: -122, headRx: 58, headRy: 46, earH: 66 },
};

/** Approximate local extents of a kid rig, used for occlusion/peek maths. */
export const KID_EXTENTS = Object.freeze({ earTop: -200, eyeY: -102, chinY: -46, feetY: 92, halfWidth: 72, tailX: 112 });

function limb(parent, x2, y2, palette, width, outline = 8) {
  el('line', { x1: 0, y1: 0, x2, y2, stroke: INK, 'stroke-width': width + outline, 'stroke-linecap': 'round' }, parent);
  el('line', { x1: 0, y1: 0, x2, y2, stroke: palette.fur, 'stroke-width': width, 'stroke-linecap': 'round' }, parent);
}

/**
 * Build a heeler rig. kind: 'blue' | 'orange' | 'dad' | 'mum'.
 * Returns { root, kind, pose(params) }.
 */
export function createDogRig(kind = 'blue', { className = '' } = {}) {
  const palette = PALETTES[kind] || PALETTES.blue;
  const adult = kind === 'dad' || kind === 'mum';
  const b = adult ? BUILDS.adult : BUILDS.kid;
  const root = el('g', { class: `dog dog-${kind} ${className}`.trim() });
  const squash = el('g', { class: 'dog-squash' }, root);
  const inner = el('g', { class: 'dog-inner' }, squash);

  const hipY = b.bodyRy * 0.62;
  const shoulderY = -b.bodyRy * 0.45;

  // Tail (behind body)
  const tail = el('g', { class: 'dog-tail' }, inner);
  const tailPath = adult ? 'M0 0 C 26 -2 52 -26 62 -74' : 'M0 0 C 28 -4 56 -30 66 -72';
  el('path', { d: tailPath, fill: 'none', stroke: INK, 'stroke-width': 30, 'stroke-linecap': 'round' }, tail);
  el('path', { d: tailPath, fill: 'none', stroke: palette.fur, 'stroke-width': 21, 'stroke-linecap': 'round' }, tail);
  el('path', { d: adult ? 'M52 -46 C 57 -56 60 -64 62 -74' : 'M56 -44 C 61 -54 64 -62 66 -72', fill: 'none', stroke: palette.tip, 'stroke-width': 21, 'stroke-linecap': 'round' }, tail);

  // Legs
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = el('g', { class: 'dog-leg' }, inner);
    limb(leg, side * 3, b.legLen, palette, 26);
    el('ellipse', { cx: side * 7, cy: b.legLen + 4, rx: 21, ry: 12, fill: palette.light, stroke: INK, 'stroke-width': 6 }, leg);
    el('path', { d: `M${side * 2} ${b.legLen + 4} l0 -7 M${side * 12} ${b.legLen + 4} l0 -7`, stroke: INK, 'stroke-width': 3, 'stroke-linecap': 'round' }, leg);
    legs.push({ g: leg, x: side * 22, y: hipY });
  }

  // Body
  const body = el('g', { class: 'dog-body' }, inner);
  el('ellipse', { cx: 0, cy: 0, rx: b.bodyRx, ry: b.bodyRy, fill: palette.fur, stroke: INK, 'stroke-width': 6 }, body);
  // shoulder saddle patches
  el('path', { d: `M${-b.bodyRx + 4} ${-b.bodyRy * 0.25} Q ${-b.bodyRx + 6} ${-b.bodyRy * 0.85} ${-14} ${-b.bodyRy + 4} Q ${-30} ${-b.bodyRy * 0.4} ${-b.bodyRx + 4} ${-b.bodyRy * 0.25} Z`, fill: palette.dark }, body);
  el('path', { d: `M${b.bodyRx - 4} ${-b.bodyRy * 0.25} Q ${b.bodyRx - 6} ${-b.bodyRy * 0.85} ${14} ${-b.bodyRy + 4} Q ${30} ${-b.bodyRy * 0.4} ${b.bodyRx - 4} ${-b.bodyRy * 0.25} Z`, fill: palette.dark }, body);
  const belly = el('ellipse', { class: 'dog-belly', cx: 0, cy: b.bodyRy * 0.2, rx: b.bodyRx * 0.64, ry: b.bodyRy * 0.66, fill: palette.belly }, body);
  el('path', { d: `M-12 ${b.bodyRy * 0.05} q4 5 0 10 M12 ${b.bodyRy * 0.3} q-4 5 0 10`, stroke: palette.fur, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round', opacity: 0.8 }, body);
  // body outline on top so patches stay inside
  el('ellipse', { cx: 0, cy: 0, rx: b.bodyRx, ry: b.bodyRy, fill: 'none', stroke: INK, 'stroke-width': 6 }, body);

  // Arms
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = el('g', { class: 'dog-arm' }, inner);
    limb(arm, side * 14, b.armLen, palette, 20);
    el('circle', { cx: side * 15, cy: b.armLen + 3, r: 13, fill: palette.light, stroke: INK, 'stroke-width': 5 }, arm);
    arms.push({ g: arm, x: side * (b.bodyRx - 10), y: shoulderY });
  }

  // Head
  const head = el('g', { class: 'dog-head' }, inner);
  const hy = b.headY;
  const ears = [];
  for (const side of [-1, 1]) {
    const ear = el('g', { class: 'dog-ear' }, head);
    const tipX = side * 16;
    el('path', { d: `M${-side * 20} 10 Q ${tipX * 0.6} ${-b.earH * 0.6} ${tipX} ${-b.earH} Q ${side * 30} ${-b.earH * 0.35} ${side * 22} 12 Z`, fill: palette.dark, stroke: INK, 'stroke-width': 6, 'stroke-linejoin': 'round' }, ear);
    el('path', { d: `M${-side * 8} 4 Q ${tipX * 0.6} ${-b.earH * 0.5} ${tipX * 0.9} ${-b.earH * 0.78} Q ${side * 18} ${-b.earH * 0.3} ${side * 12} 6 Z`, fill: palette.earInner }, ear);
    ears.push({ g: ear, x: side * 36, y: hy - b.headRy * 0.62, side });
  }
  el('ellipse', { cx: 0, cy: hy, rx: b.headRx, ry: b.headRy, fill: palette.fur, stroke: INK, 'stroke-width': 6 }, head);
  // top-of-head dark patch
  el('path', { d: `M-30 ${hy - b.headRy + 8} Q 0 ${hy - b.headRy - 6} 30 ${hy - b.headRy + 8} Q 18 ${hy - 18} 0 ${hy - 14} Q -18 ${hy - 18} -30 ${hy - b.headRy + 8} Z`, fill: palette.dark }, head);
  el('ellipse', { cx: 0, cy: hy, rx: b.headRx, ry: b.headRy, fill: 'none', stroke: INK, 'stroke-width': 6 }, head);
  const face = el('g', { class: 'dog-face' }, head);
  // eyebrow patches
  for (const side of [-1, 1]) el('ellipse', { cx: side * 25, cy: hy - 25, rx: 13, ry: 7, fill: palette.light, transform: `rotate(${side * -12} ${side * 25} ${hy - 25})` }, face);
  // cheek blush
  const blushes = [];
  for (const side of [-1, 1]) blushes.push(el('ellipse', { cx: side * 44, cy: hy + 18, rx: 11, ry: 7, fill: palette.blush, opacity: 0.35 }, face));
  // eyes
  const eyes = [];
  const eyesClosed = [];
  for (const side of [-1, 1]) {
    const eye = el('g', { class: 'dog-eye' }, face);
    el('ellipse', { cx: 0, cy: 0, rx: 9.5, ry: 12.5, fill: INK }, eye);
    el('circle', { cx: 3, cy: -5, r: 3.6, fill: '#fff' }, eye);
    el('circle', { cx: -3, cy: 5, r: 1.6, fill: '#fff', opacity: 0.7 }, eye);
    eyes.push({ g: eye, x: side * 24, y: hy - 6 });
    const closed = el('path', { class: 'dog-eye-happy', d: `M${side * 24 - 11} ${hy - 4} Q ${side * 24} ${hy - 18} ${side * 24 + 11} ${hy - 4}`, fill: 'none', stroke: INK, 'stroke-width': 5, 'stroke-linecap': 'round', display: 'none' }, face);
    eyesClosed.push(closed);
  }
  // muzzle
  const muzzle = el('g', { class: 'dog-muzzle' }, face);
  el('ellipse', { cx: 0, cy: hy + 24, rx: 36, ry: 25, fill: palette.light, stroke: INK, 'stroke-width': 5 }, muzzle);
  el('ellipse', { cx: 0, cy: hy + 11, rx: 13, ry: 9, fill: palette.nose }, muzzle);
  el('ellipse', { cx: -4, cy: hy + 8, rx: 4, ry: 2.5, fill: '#fff', opacity: 0.75 }, muzzle);
  el('path', { d: `M0 ${hy + 19} L0 ${hy + 27}`, stroke: INK, 'stroke-width': 4, 'stroke-linecap': 'round' }, muzzle);
  const mouthSmile = el('path', { d: `M-15 ${hy + 27} Q -7 ${hy + 36} 0 ${hy + 27} Q 7 ${hy + 36} 15 ${hy + 27}`, fill: 'none', stroke: INK, 'stroke-width': 4.5, 'stroke-linecap': 'round' }, muzzle);
  const mouthOpen = el('g', { display: 'none' }, muzzle);
  el('path', { d: `M-17 ${hy + 26} Q 0 ${hy + 31} 17 ${hy + 26} Q 14 ${hy + 50} 0 ${hy + 51} Q -14 ${hy + 50} -17 ${hy + 26} Z`, fill: '#7a2338', stroke: INK, 'stroke-width': 4.5, 'stroke-linejoin': 'round' }, mouthOpen);
  el('ellipse', { cx: 0, cy: hy + 45, rx: 9, ry: 5, fill: '#f37b8f' }, mouthOpen);
  const mouthO = el('ellipse', { cx: 0, cy: hy + 34, rx: 7, ry: 8, fill: '#7a2338', stroke: INK, 'stroke-width': 4, display: 'none' }, muzzle);
  const tongue = el('g', { display: 'none' }, muzzle);
  el('path', { d: `M-9 ${hy + 30} Q -11 ${hy + 52} 0 ${hy + 54} Q 11 ${hy + 52} 9 ${hy + 30} Z`, fill: '#f37b8f', stroke: INK, 'stroke-width': 4 }, tongue);
  el('path', { d: `M0 ${hy + 34} L0 ${hy + 46}`, stroke: '#c94d66', 'stroke-width': 2.5 }, tongue);

  const parts = { squash, inner, tail, legs, body, belly, arms, head, face, ears, eyes, eyesClosed, muzzle, mouthSmile, mouthOpen, mouthO, tongue, blushes };
  const rig = {
    root, kind, palette, parts, adult, build: b,
    _blinkAt: 1500 + Math.random() * 2500,
    pose(p = {}) { poseDog(rig, p); },
  };
  return rig;
}

/**
 * Pose a dog rig. Parameters (all optional):
 *  t ms clock, look {x,y} in -1..1, wag 0..1, kick 0..1, happy 0..1,
 *  mouth 'smile'|'open'|'tongue'|'o', squash (1 normal), lift px, tilt deg,
 *  headTilt deg, earPerk -1..1, run 0..1, wave 0..1, armsUp 0..1, blink bool
 */
export function poseDog(rig, p) {
  const t = p.t || 0;
  const { parts, build: b } = rig;
  const look = p.look || { x: 0, y: 0 };
  const lx = clamp(look.x, -1, 1);
  const ly = clamp(look.y, -1, 1);
  const squash = p.squash ?? 1;
  const breathe = p.still ? 0 : Math.sin(t / 420) * 0.015;
  const sy = squash + breathe;
  const sx = 1 / Math.sqrt(Math.max(0.3, sy));
  const feetY = b.bodyRy * 0.62 + b.legLen + 12;
  setTransform(parts.squash, `translate(0 ${f(feetY - (p.lift || 0))}) scale(${f(sx)} ${f(sy)}) translate(0 ${f(-feetY)})`);
  setTransform(parts.inner, `rotate(${f(p.tilt || 0)} 0 ${f(feetY)})`);

  // Tail wag
  const wag = clamp(p.wag ?? 0.15, 0, 1);
  const tailAngle = Math.sin(t / (150 - wag * 85)) * (8 + wag * 32) + (p.tailDown ? 60 : 0) + (p.tailAngle || 0);
  setTransform(parts.tail, `translate(${b.bodyRx * 0.55} ${b.bodyRy * 0.45}) rotate(${f(tailAngle)})`);

  // Legs: run cycle / kick
  const run = clamp(p.run || 0, 0, 1);
  const kick = clamp(p.kick || 0, 0, 1);
  parts.legs.forEach((leg, i) => {
    let a = 0;
    let lift = 0;
    if (run > 0) {
      a = Math.sin(t / 70 + i * Math.PI) * 38 * run;
    }
    if (kick > 0 && i === 1) {
      a += -(Math.abs(Math.sin(t / 55)) * 70 * kick);
      lift = 8 * kick;
    }
    setTransform(leg.g, `translate(${leg.x} ${f(leg.y - lift)}) rotate(${f(a)})`);
  });

  // Arms: idle sway, wave, arms up
  const wave = clamp(p.wave || 0, 0, 1);
  const armsUp = clamp(p.armsUp || 0, 0, 1);
  parts.arms.forEach((arm, i) => {
    const side = i === 0 ? -1 : 1;
    let a = Math.sin(t / 600 + i) * 4;
    if (run > 0) a += Math.sin(t / 70 + i * Math.PI + Math.PI) * 40 * run;
    a += side * armsUp * 150;
    if (wave > 0 && i === 1) a = 150 + Math.sin(t / 110) * 25 * wave;
    a += (p.armSwing || 0) * side;
    setTransform(arm.g, `translate(${arm.x} ${arm.y}) rotate(${f(a)})`);
  });

  // Head + face parallax looking at the pointer
  const headTilt = (p.headTilt || 0) + lx * 6;
  setTransform(parts.head, `translate(${f(lx * 6)} ${f(ly * 3)}) rotate(${f(headTilt)} 0 ${b.headY + b.headRy})`);
  setTransform(parts.face, `translate(${f(lx * 6)} ${f(ly * 4)})`);
  setTransform(parts.muzzle, `translate(${f(lx * 4)} ${f(ly * 2)})`);

  // Ears: perk/flop + flick
  const perk = clamp(p.earPerk ?? 0, -1, 1);
  parts.ears.forEach((ear) => {
    const flick = Math.max(0, Math.sin(t / 900 + ear.side * 2.1) - 0.93) * 220;
    const a = ear.side * (14 - perk * 10 + (perk < 0 ? -perk * 50 : 0)) + ear.side * flick + Math.sin(t / 200) * (p.earWiggle || 0) * 18;
    setTransform(ear.g, `translate(${ear.x} ${f(ear.y)}) rotate(${f(a)})`);
  });

  // Eyes: track pointer; blink; happy closed arcs
  const happy = (p.happy || 0) > 0.5;
  if (!rig._blinkAt || t > rig._blinkAt + 4000 || t < rig._blinkAt - 8000) rig._blinkAt = t + 1800 + Math.random() * 2600;
  const blinking = p.blink || (t > rig._blinkAt && t < rig._blinkAt + 130);
  if (t > rig._blinkAt + 130) rig._blinkAt = t + 2000 + Math.random() * 3000;
  const eyeScale = blinking ? 0.12 : (p.wide ? 1.2 : 1);
  parts.eyes.forEach((eye) => {
    setTransform(eye.g, `translate(${f(eye.x + lx * 5)} ${f(eye.y + ly * 4)}) scale(${p.wide ? 1.2 : 1} ${f(eyeScale)})`);
    setVisible(eye.g, !happy);
  });
  parts.eyesClosed.forEach((c) => setVisible(c, happy));
  parts.blushes.forEach((bl) => setAttr(bl, 'opacity', f(0.3 + (p.happy || 0) * 0.5)));

  const mouth = p.mouth || 'smile';
  setVisible(parts.mouthSmile, mouth === 'smile' || mouth === 'tongue');
  setVisible(parts.mouthOpen, mouth === 'open');
  setVisible(parts.mouthO, mouth === 'o');
  setVisible(parts.tongue, mouth === 'tongue');
}

/* ------------------------------------------------------------------ */
/* Small reusable art pieces                                            */
/* ------------------------------------------------------------------ */

/** Paw print centred on 0,0 roughly 60px wide. */
export function createPaw(parent, { fill = '#fff', stroke = INK, strokeWidth = 5, className = 'paw' } = {}) {
  const g = el('g', { class: className }, parent);
  el('path', { d: 'M0 4 C 18 4 26 20 22 30 C 18 38 6 34 0 34 C -6 34 -18 38 -22 30 C -26 20 -18 4 0 4 Z', fill, stroke, 'stroke-width': strokeWidth, 'stroke-linejoin': 'round' }, g);
  for (const [cx, cy, rx, ry, r] of [[-24, -10, 8, 10, -20], [-9, -22, 8, 11, -6], [9, -22, 8, 11, 6], [24, -10, 8, 10, 20]]) {
    el('ellipse', { cx, cy, rx, ry, fill, stroke, 'stroke-width': strokeWidth, transform: `rotate(${r} ${cx} ${cy})` }, g);
  }
  return g;
}

/** Five pointed star path centred on 0,0. */
export function starPath(r = 20, inner = 0.45) {
  let d = '';
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    d += `${i === 0 ? 'M' : 'L'}${f(Math.cos(a) * rad)} ${f(Math.sin(a) * rad)} `;
  }
  return `${d}Z`;
}

export const HEART_PATH = 'M0 8 C -4 2 -16 -2 -16 -10 C -16 -18 -6 -21 0 -13 C 6 -21 16 -18 16 -10 C 16 -2 4 2 0 8 Z';

/**
 * Cartoon pointing hand (white glove style). Fingertip of the index finger
 * sits at the local origin so it can be placed exactly on a target.
 */
export function createPointingHand(parent, { className = 'tutorial-hand' } = {}) {
  const g = el('g', { class: className }, parent);
  const sk = '#fff7ea';
  // palm + curled fingers
  el('path', {
    d: 'M-14 10 L-14 52 C -34 50 -44 62 -40 76 C -36 92 -16 104 4 106 L 34 106 C 52 104 60 90 58 74 L 58 48 C 58 40 48 38 44 44 C 44 34 34 32 30 40 C 30 30 18 28 16 38 L 16 10 Z',
    fill: sk, stroke: INK, 'stroke-width': 6, 'stroke-linejoin': 'round',
  }, g);
  // index finger
  el('path', { d: 'M-14 52 L -14 6 C -14 -6 16 -6 16 6 L 16 50', fill: sk, stroke: INK, 'stroke-width': 6, 'stroke-linejoin': 'round' }, g);
  el('path', { d: 'M-8 4 C -6 -1 6 -1 8 4', fill: 'none', stroke: '#e9c9b0', 'stroke-width': 4, 'stroke-linecap': 'round' }, g);
  el('path', { d: 'M30 40 L30 56 M44 44 L44 58', stroke: INK, 'stroke-width': 4, 'stroke-linecap': 'round' }, g);
  el('path', { d: 'M4 92 L32 92', stroke: '#9ec6ea', 'stroke-width': 8, 'stroke-linecap': 'round' }, g);
  return g;
}

/** Orange dog's special rainbow-star paw badge. */
export function createRainbowBadge(parent) {
  const g = el('g', { class: 'rainbow-badge' }, parent);
  const colors = ['#ff8a80', '#ffc46b', '#ffe57a', '#9be08f', '#8fd0f5', '#b9a2f5'];
  colors.forEach((c, i) => el('circle', { r: 30 - i * 3.6, fill: 'none', stroke: c, 'stroke-width': 4 }, g));
  el('path', { d: starPath(17, 0.48), fill: '#fff4b8', stroke: INK, 'stroke-width': 4, 'stroke-linejoin': 'round' }, g);
  return g;
}

/** Props a parent can hold during a cameo, keyed by event keyword. */
export function createCameoProp(parent, kind) {
  const g = el('g', { class: `cameo-prop cameo-prop-${kind}` }, parent);
  switch (kind) {
    case 'rake':
      el('line', { x1: 60, y1: -90, x2: 40, y2: 60, stroke: '#9a6a3c', 'stroke-width': 9, 'stroke-linecap': 'round' }, g);
      el('path', { d: 'M18 60 L64 64 M22 60 l-3 16 M32 61 l-2 16 M42 62 l-1 16 M52 63 l0 16 M62 64 l1 16', stroke: INK, 'stroke-width': 5, 'stroke-linecap': 'round' }, g);
      break;
    case 'washing':
      el('rect', { x: -60, y: -20, width: 120, height: 56, rx: 18, fill: '#e9c27a', stroke: INK, 'stroke-width': 6 }, g);
      el('path', { d: 'M-48 -20 q14 -26 30 0 M-10 -20 q14 -34 30 -2 M24 -20 q10 -20 26 0', fill: '#ff9db1', stroke: INK, 'stroke-width': 5 }, g);
      el('path', { d: 'M-50 0 L50 0 M-50 16 L50 16', stroke: '#b9884a', 'stroke-width': 4 }, g);
      break;
    case 'book':
      el('path', { d: 'M-50 -40 L0 -30 L50 -40 L50 20 L0 30 L-50 20 Z', fill: '#ff8a80', stroke: INK, 'stroke-width': 6, 'stroke-linejoin': 'round' }, g);
      el('path', { d: 'M0 -30 L0 30', stroke: INK, 'stroke-width': 5 }, g);
      el('path', { d: 'M-40 -24 L-10 -18 M-40 -10 L-10 -4 M10 -18 L40 -24 M10 -4 L40 -10', stroke: '#fff', 'stroke-width': 4, 'stroke-linecap': 'round' }, g);
      break;
    case 'flamingo':
      el('ellipse', { cx: 0, cy: 0, rx: 92, ry: 48, fill: '#ff9cc2', stroke: INK, 'stroke-width': 7 }, g);
      el('path', { d: 'M60 -20 C 90 -60 70 -130 40 -120 C 20 -114 30 -96 44 -100', fill: 'none', stroke: INK, 'stroke-width': 30, 'stroke-linecap': 'round' }, g);
      el('path', { d: 'M60 -20 C 90 -60 70 -130 40 -120 C 20 -114 30 -96 44 -100', fill: 'none', stroke: '#ff9cc2', 'stroke-width': 19, 'stroke-linecap': 'round' }, g);
      el('path', { d: 'M30 -118 L12 -104 L34 -100 Z', fill: INK }, g);
      el('circle', { cx: 46, cy: -122, r: 4, fill: INK }, g);
      el('ellipse', { cx: -20, cy: -8, rx: 40, ry: 18, fill: '#ffc3da' }, g);
      break;
    case 'picnic':
      el('rect', { x: -56, y: -10, width: 112, height: 70, rx: 12, fill: '#d99a52', stroke: INK, 'stroke-width': 6 }, g);
      el('path', { d: 'M-40 -10 Q 0 -60 40 -10', fill: 'none', stroke: INK, 'stroke-width': 7 }, g);
      el('path', { d: 'M-56 14 L56 14 M-56 36 L56 36 M-30 -10 L-30 60 M0 -10 L0 60 M30 -10 L30 60', stroke: '#a66a2c', 'stroke-width': 4 }, g);
      el('path', { d: 'M-60 -8 L-30 -24 L0 -8 L30 -24 L60 -8', fill: 'none', stroke: '#ff7b7b', 'stroke-width': 6 }, g);
      break;
    case 'box':
      el('rect', { x: -70, y: -60, width: 140, height: 110, rx: 6, fill: '#d6a46a', stroke: INK, 'stroke-width': 6 }, g);
      el('path', { d: 'M-70 -30 L70 -30 M0 -60 L0 -30', stroke: '#a8743e', 'stroke-width': 5 }, g);
      break;
    case 'cup':
      el('path', { d: 'M-16 -14 L16 -14 L12 18 L-12 18 Z', fill: '#fff', stroke: INK, 'stroke-width': 5, 'stroke-linejoin': 'round' }, g);
      el('path', { d: 'M16 -6 q12 2 0 14', fill: 'none', stroke: INK, 'stroke-width': 5 }, g);
      el('path', { d: 'M-4 -22 q-6 -10 2 -18 M6 -22 q-6 -10 2 -18', fill: 'none', stroke: '#c9d6e8', 'stroke-width': 4, 'stroke-linecap': 'round' }, g);
      break;
    default:
      break;
  }
  return g;
}
