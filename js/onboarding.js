import { el, createPointingHand, createPaw, setTransform } from './characters.js';

export function renderHandGuide(svg) {
  el('circle', { cx: 80, cy: 76, r: 66, fill: '#fff0bd' }, svg);
  const hand = createPointingHand(svg, { className: 'hand-guide-hand' });
  setTransform(hand, 'translate(66 24) scale(0.85)');
  el('path', {
    d: 'M30 61 V30 M20 40 L30 30 L40 40', fill: 'none',
    stroke: '#8f78d8', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }, svg);
  el('path', {
    d: 'M148 76 H177 M168 67 L177 76 L168 85', fill: 'none',
    stroke: '#8f78d8', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }, svg);
  const pointer = el('g', { class: 'hand-guide-pointer' }, svg);
  setTransform(pointer, 'translate(230 76)');
  el('circle', { r: 54, fill: '#8bc4ea', opacity: 0.7 }, pointer);
  el('circle', { class: 'hand-guide-ring', r: 40, fill: 'none', stroke: '#fff', 'stroke-width': 5 }, pointer);
  const paw = createPaw(pointer, { fill: '#fff4c2', strokeWidth: 4 });
  setTransform(paw, 'translate(0 2) scale(0.6)');
}
