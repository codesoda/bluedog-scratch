import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HandReadiness } from '../../js/hand-readiness.js';

const p = (x, y, sampleId, id = 'a') => ({ id, x, y, active: true, sampleId });

/** Drive `count` fresh, stationary ticks of `dtMs` starting from `sampleId`. */
function steadyTicks(hr, count, dtMs = 100, startSampleId = 2, x = 0.5, y = 0.5, id = 'a') {
  let snap;
  for (let i = 0; i < count; i += 1) {
    snap = hr.update(dtMs, [p(x, y, startSampleId + i, id)]);
  }
  return snap;
}

test('initial state is waiting with no hand', () => {
  const hr = new HandReadiness();
  const snap = hr.update(16, []);
  assert.deepEqual(snap, { phase: 'waiting', countdown: null, hint: false });
});

test('first sample is a baseline: no credit, stays waiting', () => {
  const hr = new HandReadiness();
  const snap = hr.update(100, [p(0.5, 0.5, 1)]);
  assert.deepEqual(snap, { phase: 'waiting', countdown: null, hint: false });
});

test('exact steady and countdown thresholds with default config (1000ms/3000ms)', () => {
  const hr = new HandReadiness();
  hr.update(100, [p(0.5, 0.5, 1)]); // baseline

  let snap = steadyTicks(hr, 9, 100, 2); // 900ms accumulated
  assert.equal(snap.phase, 'steady');
  assert.equal(snap.countdown, null);

  snap = steadyTicks(hr, 1, 100, 11); // 1000ms exactly -> countdown begins
  assert.equal(snap.phase, 'countdown');
  assert.equal(snap.countdown, 3);

  snap = steadyTicks(hr, 9, 100, 12); // 900ms into countdown, still "3"
  assert.equal(snap.phase, 'countdown');
  assert.equal(snap.countdown, 3);

  snap = steadyTicks(hr, 1, 100, 21); // exactly 1000ms into countdown -> "2"
  assert.equal(snap.phase, 'countdown');
  assert.equal(snap.countdown, 2);

  snap = steadyTicks(hr, 10, 100, 22); // exactly 2000ms into countdown -> "1"
  assert.equal(snap.phase, 'countdown');
  assert.equal(snap.countdown, 1);

  snap = steadyTicks(hr, 10, 100, 32); // exactly 3000ms into countdown -> ready
  assert.deepEqual(snap, { phase: 'ready', countdown: null, hint: false });
});

test('dropout resets stability and sets the hint from every phase', () => {
  for (const ticks of [0, 10, 40]) {
    const hr = new HandReadiness({ steadyMs: 300, countdownMs: 300 });
    hr.update(100, [p(0.5, 0.5, 1)]);
    steadyTicks(hr, ticks, 100, 2);
    const snap = hr.update(100, []);
    assert.equal(snap.phase, 'waiting');
    assert.equal(snap.countdown, null);
    assert.equal(snap.hint, true, `hint should be set after ${ticks} steady ticks`);
  }
});

test('no hint on the very first no-hand update (never saw a hand)', () => {
  const hr = new HandReadiness();
  assert.equal(hr.update(100, []).hint, false);
  assert.equal(hr.update(100, []).hint, false);
});

test('fast motion resets stability, sets hint, and is itself a baseline', () => {
  const hr = new HandReadiness({ steadyMs: 300, countdownMs: 300, maxSpeed: 1.2 });
  hr.update(100, [p(0.5, 0.5, 1)]);
  steadyTicks(hr, 2, 100, 2); // 200ms steady, under the 300ms threshold

  // 0.5 units in 0.1s = 5 units/s, far above maxSpeed 1.2.
  const jump = hr.update(100, [p(1.0, 0.5, 4)]);
  assert.equal(jump.phase, 'waiting');
  assert.equal(jump.countdown, null);
  assert.equal(jump.hint, true);

  // The jump landed as the new baseline: a nearby follow-up sample earns credit again.
  const after = hr.update(100, [p(1.0, 0.5, 5)]);
  assert.equal(after.phase, 'steady');
});

test('small jitter and slow movement under maxSpeed accumulate normally', () => {
  const hr = new HandReadiness({ steadyMs: 600, countdownMs: 300, maxSpeed: 1.2 });
  hr.update(100, [p(0.5, 0.5, 1)]);
  let snap;
  const xs = [0.501, 0.499, 0.5005, 0.4995, 0.502];
  for (let i = 0; i < xs.length; i += 1) {
    snap = hr.update(100, [p(xs[i], 0.5, i + 2)]);
    assert.equal(snap.hint, false);
  }
  assert.equal(snap.phase, 'steady');
  snap = hr.update(100, [p(0.5, 0.5, 7)]); // 600ms total -> exactly the threshold
  assert.equal(snap.phase, 'countdown');
});

test('duplicate sampleId never updates position or creates a fake speed spike', () => {
  const hr = new HandReadiness({ steadyMs: 1000, countdownMs: 300, maxSpeed: 1.2 });
  hr.update(100, [p(0.5, 0.5, 1)]); // baseline
  hr.update(100, [p(0.5, 0.5, 2)]); // fresh, 100ms steady

  // Same sampleId, wildly different coordinates: must be ignored entirely.
  const dup = hr.update(100, [p(0.95, 0.95, 2)]);
  assert.equal(dup.phase, 'steady');
  assert.equal(dup.hint, false);

  // 0.5 units over the combined 500ms (5 duplicates + this tick) = 1.0 units/s < maxSpeed.
  // A naive per-tick-only computation (0.5 / 0.1s = 5 units/s) would wrongly reject this.
  for (let i = 0; i < 4; i += 1) hr.update(100, [p(0.5, 0.5, 2)]);
  const fresh = hr.update(100, [p(1.0, 0.5, 3)]);
  assert.equal(fresh.hint, false);
  assert.equal(fresh.phase, 'steady');
});

test('pointer array reordering does not affect the tracked owner', () => {
  const hr = new HandReadiness({ steadyMs: 300, countdownMs: 300 });
  hr.update(100, [p(0.5, 0.5, 1, 'owner')]);
  hr.update(100, [p(0.3, 0.3, 1, 'decoy'), p(0.5, 0.5, 2, 'owner')]);
  const snap = hr.update(100, [p(0.5, 0.5, 3, 'owner'), p(0.3, 0.3, 2, 'decoy')]);
  assert.equal(snap.phase, 'steady');
  assert.equal(snap.hint, false);
});

test('owner id replacement resets stability and prompts slow movement', () => {
  const hr = new HandReadiness({ steadyMs: 200, countdownMs: 200 });
  hr.update(100, [p(0.5, 0.5, 1, 'a')]);
  const changed = hr.update(100, [p(0.5, 0.5, 1, 'b')]);
  assert.equal(changed.phase, 'waiting');
  assert.equal(changed.countdown, null);
  assert.equal(changed.hint, true);
});

test('explicit reset clears phase, countdown, hint, and accumulated progress', () => {
  const hr = new HandReadiness({ steadyMs: 200, countdownMs: 200 });
  hr.update(100, [p(0.5, 0.5, 1)]);
  steadyTicks(hr, 5, 100, 2);
  hr.update(100, []); // drop to force hint true
  assert.equal(hr.hint, true);
  hr.reset();
  assert.deepEqual(hr.snapshot(), { phase: 'waiting', countdown: null, hint: false });
  const after = hr.update(100, [p(0.5, 0.5, 1)]);
  assert.deepEqual(after, { phase: 'waiting', countdown: null, hint: false });
});

test('NaN and negative dt are rejected (no progress, no crash)', () => {
  const hr = new HandReadiness({ steadyMs: 150, countdownMs: 150 });
  hr.update(100, [p(0.5, 0.5, 1)]);
  let snap = hr.update(Number.NaN, [p(0.5, 0.5, 2)]);
  assert.equal(snap.phase, 'waiting');
  snap = hr.update(-50, [p(0.5, 0.5, 3)]);
  assert.equal(snap.phase, 'waiting');
  // Valid dt afterward still works and state was not corrupted.
  snap = hr.update(100, [p(0.5, 0.5, 4)]);
  assert.equal(snap.phase, 'steady');
  snap = hr.update(100, [p(0.5, 0.5, 5)]);
  assert.equal(snap.phase, 'countdown');
  assert.equal(snap.countdown, 3);
});

test('dt of 0 earns no credit and cannot infer velocity', () => {
  const hr = new HandReadiness({ steadyMs: 150, countdownMs: 150, maxSpeed: 1.2 });
  hr.update(100, [p(0.5, 0.5, 1)]);
  hr.update(100, [p(0.5, 0.5, 2)]); // 100ms steady
  const snap = hr.update(0, [p(0.9, 0.5, 3)]); // big jump but zero elapsed time
  assert.equal(snap.phase, 'steady');
  assert.equal(snap.hint, false);
});
