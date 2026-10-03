import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScratchGesture, DwellTracker, rectContains, virtualDistance } from '../../js/gestures.js';
import { createRng } from '../../js/random.js';

const RECT = { x: 0.5, y: 0.5, w: 0.2, h: 0.32 };
const p = (x, y, sampleId, id = 'a') => ({ id, x, y, active: true, sampleId });

test('rectContains uses center-based rects', () => {
  assert.ok(rectContains(RECT, 0.5, 0.5));
  assert.ok(rectContains(RECT, 0.6, 0.66));
  assert.ok(!rectContains(RECT, 0.61, 0.5));
  assert.ok(!rectContains(null, 0.5, 0.5));
});

test('virtualDistance measures in 1600x900 stage pixels', () => {
  assert.equal(virtualDistance({ x: 0, y: 0 }, { x: 0.1, y: 0 }), 160);
  assert.equal(virtualDistance({ x: 0, y: 0 }, { x: 0, y: 0.1 }), 90);
});

test('first sample only sets a baseline', () => {
  const g = new ScratchGesture();
  assert.equal(g.update([p(0.5, 0.5, 1)], RECT, 0).accepted, 0);
  assert.ok(Math.abs(g.update([p(0.53, 0.5, 2)], RECT, 33).accepted - 48) < 1e-6);
});

test('same sampleId is never counted twice', () => {
  const g = new ScratchGesture();
  g.update([p(0.5, 0.5, 1)], RECT, 0);
  const first = g.update([p(0.53, 0.5, 2)], RECT, 33).accepted;
  assert.ok(first > 0);
  assert.equal(g.update([p(0.53, 0.5, 2)], RECT, 66).accepted, 0);
  assert.equal(g.update([p(0.5, 0.5, 2)], RECT, 99).accepted, 0, 'stale sample even if coordinates differ');
});

test('small jitter for a long time accumulates nothing', () => {
  const g = new ScratchGesture();
  const rng = createRng(7);
  let total = 0;
  for (let i = 0; i < 30 * 120; i += 1) {
    const jx = ((rng() - 0.5) * 12) / 1600; // ±6 px
    const jy = ((rng() - 0.5) * 12) / 900;
    total += g.update([p(0.5 + jx, 0.5 + jy, i)], RECT, i * 33).accepted;
  }
  assert.equal(total, 0);
});

test('slow drift below gate speed is rejected', () => {
  const g = new ScratchGesture();
  let total = 0;
  for (let i = 0; i < 300; i += 1) {
    total += g.update([p(0.45 + (i * 0.6) / 1600, 0.5, i)], RECT, i * 33).accepted; // ~18 px/s
  }
  assert.equal(total, 0);
});

test('rough wiggling succeeds quickly and steps are capped', () => {
  const g = new ScratchGesture();
  const rng = createRng(3);
  let total = 0;
  let frames = 0;
  while (total < 330 && frames < 200) {
    const x = 0.5 + ((rng() - 0.5) * 120) / 1600;
    const y = 0.5 + ((rng() - 0.5) * 80) / 900;
    const { accepted } = g.update([p(x, y, frames)], RECT, frames * 33);
    assert.ok(accepted <= 110);
    total += accepted;
    frames += 1;
  }
  assert.ok(total >= 330, `total ${total}`);
  assert.ok(frames < 60, `took ${frames} frames`);
});

test('implausible jumps are rejected and re-based', () => {
  const g = new ScratchGesture();
  g.update([p(0.41, 0.5, 1)], RECT, 0);
  assert.equal(g.update([p(0.59, 0.5, 2)], RECT, 33).accepted, 0);
  assert.ok(g.update([p(0.55, 0.5, 3)], RECT, 66).accepted > 0);
});

test('leaving the region resets baseline (no credit for re-entry jump)', () => {
  const g = new ScratchGesture();
  g.update([p(0.45, 0.5, 1)], RECT, 0);
  assert.equal(g.update([p(0.9, 0.5, 2)], RECT, 33).inside, false);
  assert.equal(g.update([p(0.55, 0.5, 3)], RECT, 66).accepted, 0);
});

test('two pointers cannot double progress; owner change resets baseline', () => {
  const g = new ScratchGesture();
  let total = 0;
  for (let i = 0; i < 20; i += 1) {
    const dx = (i % 2 ? 40 : -40) / 1600;
    const r = g.update([p(0.5 + dx, 0.5, i, 'a'), p(0.5 - dx, 0.45, i, 'b')], RECT, i * 33);
    assert.equal(r.ownerId, 'a');
    total += r.accepted;
  }
  assert.ok(total <= 19 * 80 + 1);
  // owner leaves; b takes over with a fresh baseline
  const r = g.update([p(0.9, 0.5, 100, 'a'), p(0.52, 0.45, 100, 'b')], RECT, 1000);
  assert.equal(r.ownerId, 'b');
  assert.equal(r.accepted, 0);
});

test('DwellTracker fills, activates once and resets on leave', () => {
  const d = new DwellTracker({ dwellMs: 300 });
  assert.equal(d.update(100, true).activated, false);
  assert.equal(d.update(250, true).activated, true);
  assert.equal(d.update(100, true).activated, false);
  assert.equal(d.update(16, false).progress, 0);
  assert.ok(Math.abs(d.update(150, true).progress - 0.5) < 1e-9);
});
