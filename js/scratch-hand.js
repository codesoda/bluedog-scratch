// Reusable "patting hand" rig shown over the dog's scratch target while the
// child is actively scratching. Code-native SVG only (no external images):
// a palm + five fingers that sweep between an open and a closed (fist) pose,
// plus a small "Keep wiggling" prompt. Built once per pointer and reused -
// callers only mutate attributes/transforms per frame (see renderer.js).

import { el, setAttr, setTransform, setVisible, INK } from './characters.js';

const SKIN = '#ffe3c2';
const lerp = (a, b, k) => a + (b - a) * k;
const r2 = (n) => Math.round(n * 100) / 100;

// Per-finger geometry: pivot (px,py), open-pose angle, curl delta added to
// reach the closed pose, finger length when open/closed, and width.
const FINGERS = [
  { name: 'thumb', px: -32, py: 22, openAngle: -60, curl: 100, lenOpen: 30, lenClosed: 16, width: 16 },
  { name: 'index', px: -19, py: -22, openAngle: -18, curl: 130, lenOpen: 44, lenClosed: 20, width: 13 },
  { name: 'middle', px: -5, py: -28, openAngle: 0, curl: 160, lenOpen: 50, lenClosed: 22, width: 13 },
  { name: 'ring', px: 9, py: -26, openAngle: 15, curl: 165, lenOpen: 46, lenClosed: 20, width: 12 },
  { name: 'pinky', px: 21, py: -18, openAngle: 30, curl: 170, lenOpen: 36, lenClosed: 18, width: 11 },
];

/**
 * Builds a centered hand rig (palm + five fingers) with an attached
 * "Keep wiggling" prompt bubble. Returns handles to drive the pose per
 * frame without creating any further DOM nodes.
 */
export function createScratchHand(parent, { className = 'scratch-hand' } = {}) {
  const g = el('g', { class: className }, parent);

  const rig = el('g', { class: 'scratch-hand-rig' }, g);
  el('rect', { x: -16, y: 36, width: 32, height: 40, rx: 14, fill: SKIN, stroke: INK, 'stroke-width': 5 }, rig);
  const palm = el('ellipse', { cx: 0, cy: 12, rx: 34, ry: 40, fill: SKIN, stroke: INK, 'stroke-width': 5 }, rig);
  const fingers = FINGERS.map((f) => {
    const pivot = el('g', { class: `scratch-hand-finger scratch-hand-${f.name}` }, rig);
    const tip = el('rect', {
      x: -f.width / 2, y: -f.lenOpen, width: f.width, height: f.lenOpen,
      rx: f.width / 2, ry: f.width / 2, fill: SKIN, stroke: INK, 'stroke-width': 4,
    }, pivot);
    return { ...f, pivot, tip };
  });

  const prompt = el('g', { class: 'scratch-hand-prompt', transform: 'translate(0 136)' }, g);
  el('rect', { x: -96, y: -24, width: 192, height: 46, rx: 23, fill: '#fff', stroke: INK, 'stroke-width': 4, opacity: 0.95 }, prompt);
  el('text', {
    x: 0, y: 7, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, fill: INK,
    'font-family': 'inherit',
  }, prompt).textContent = 'Keep wiggling!';

  /** openness: 0 = closed fist, 1 = fully open hand. */
  function setOpenness(openness) {
    const k = Math.min(1, Math.max(0, openness));
    setAttr(g, 'data-openness', r2(k));
    setAttr(palm, 'ry', r2(lerp(36, 40, k)));
    fingers.forEach((f) => {
      const angle = f.openAngle + f.curl * (1 - k);
      const len = lerp(f.lenClosed, f.lenOpen, k);
      setTransform(f.pivot, `translate(${f.px} ${f.py}) rotate(${r2(angle)})`);
      setAttr(f.tip, 'height', r2(len));
      setAttr(f.tip, 'y', r2(-len));
    });
  }

  function setHandVisible(visible) { setVisible(rig, visible); }
  function setPromptVisible(visible) { setVisible(prompt, visible); }

  setOpenness(0.5);
  setHandVisible(false);
  setPromptVisible(false);

  return { g, setOpenness, setHandVisible, setPromptVisible };
}
