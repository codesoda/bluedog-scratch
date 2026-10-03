import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INDEX_FINGER_TIP,
  PointerTracker,
  extractHands,
  mirrorLandmark,
  mirrorLandmarks,
  smoothPoint,
} from '../../js/pointer.js';

const hand = (x, y, label = 'Right', score = 0.9) => {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  landmarks[INDEX_FINGER_TIP] = { x, y, z: -0.1 };
  return { landmarks, label, score };
};
const result = (...hands) => ({
  landmarks: hands.map((h) => h.landmarks),
  handedness: hands.map((h) => [{ categoryName: h.label, score: h.score }]),
});
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b}`);

test('landmark 8 is mirrored and clamped into game space', () => {
  assert.equal(INDEX_FINGER_TIP, 8);
  assert.deepEqual(mirrorLandmark({ x: 0.2, y: 0.3 }), { x: 0.8, y: 0.3 });
  assert.deepEqual(mirrorLandmark({ x: -0.1, y: 1.2 }), { x: 1, y: 1 });
  assert.equal(mirrorLandmark({ x: Number.NaN, y: 0 }), null);
  assert.equal(mirrorLandmark(undefined), null);
  const mirrored = mirrorLandmarks([{ x: 0.25, y: 0.5, z: 0.1 }]);
  assert.deepEqual(mirrored, [{ x: 0.75, y: 0.5, z: 0.1 }]);
});

test('extractHands uses landmark 8 with handedness and skips malformed hands', () => {
  const hands = extractHands({
    ...result(hand(0.1, 0.2, 'Left'), hand(0.7, 0.6, 'Right')),
  });
  assert.equal(hands.length, 2);
  close(hands[0].tip.x, 0.9);
  close(hands[0].tip.y, 0.2);
  assert.equal(hands[0].label, 'Left');
  close(hands[1].tip.x, 0.3);
  assert.deepEqual(extractHands({ landmarks: [[{ x: 0, y: 0 }]] }), []);
  assert.deepEqual(extractHands(null), []);
  // deprecated field name still works
  assert.equal(extractHands({ landmarks: [hand(0.5, 0.5).landmarks], handednesses: [[{ categoryName: 'Left', score: 1 }]] })[0].label, 'Left');
});

test('smoothing follows the PRD formula at the reference interval', () => {
  const p = smoothPoint({ x: 0.5, y: 0.5 }, { x: 0.51, y: 0.5 }, 1000 / 30, { smoothing: 0.6, fastDistance: 1 });
  // distance .01 of fastDistance 1 nearly no speed adaption: ~ .5*.6+.51*.4
  assert.ok(p.x > 0.5039 && p.x < 0.5045, String(p.x));
});

test('smoothing is elapsed-time aware and resets after long gaps', () => {
  const prev = { x: 0.5, y: 0.5 };
  const target = { x: 0.52, y: 0.5 };
  const short = smoothPoint(prev, target, 16, { fastDistance: 10 });
  const long = smoothPoint(prev, target, 66, { fastDistance: 10 });
  assert.ok(long.x > short.x, 'longer elapsed time moves closer to the target');
  assert.deepEqual(smoothPoint(prev, target, 1000), target, 'gap resets smoothing');
  assert.deepEqual(smoothPoint(null, target, 33), target);
});

test('fast motion is smoothed less (low lag), jitter more', () => {
  const prev = { x: 0.5, y: 0.5 };
  const jitter = smoothPoint(prev, { x: 0.505, y: 0.5 }, 33);
  const fast = smoothPoint(prev, { x: 0.65, y: 0.5 }, 33);
  const jitterFraction = (jitter.x - 0.5) / 0.005;
  const fastFraction = (fast.x - 0.5) / 0.15;
  assert.ok(fastFraction > jitterFraction + 0.2, `${fastFraction} vs ${jitterFraction}`);
  assert.ok(fastFraction >= 0.7);
});

test('PointerTracker emits mirrored, sampled pointers with increasing sampleId', () => {
  const tracker = new PointerTracker();
  const a = tracker.update(extractHands(result(hand(0.3, 0.4))), 0);
  assert.equal(a.length, 1);
  assert.deepEqual(Object.keys(a[0]).sort(), ['active', 'id', 'sampleId', 'x', 'y']);
  close(a[0].x, 0.7);
  assert.equal(a[0].active, true);
  const b = tracker.update(extractHands(result(hand(0.3, 0.4))), 33);
  assert.ok(b[0].sampleId > a[0].sampleId);
  assert.equal(b[0].id, a[0].id);
  assert.deepEqual(tracker.update([], 66), []);
});

test('identities stay stable when MediaPipe swaps output order', () => {
  const tracker = new PointerTracker();
  const first = tracker.update(extractHands(result(hand(0.2, 0.5, 'Left'), hand(0.8, 0.5, 'Right'))), 0);
  const idAtLeftOfScreen = first.find((p) => p.x > 0.5).id; // raw x .2 -> mirrored .8
  const swapped = tracker.update(extractHands(result(hand(0.8, 0.5, 'Right'), hand(0.21, 0.5, 'Left'))), 33);
  const same = swapped.find((p) => p.id === idAtLeftOfScreen);
  assert.ok(same.x > 0.75, 'no teleport on order swap');
  // Output order is stable: oldest hand first regardless of detection order.
  assert.deepEqual(swapped.map((p) => p.id), first.map((p) => p.id));
});

test('duplicate handedness labels are disambiguated spatially', () => {
  const tracker = new PointerTracker();
  const first = tracker.update(extractHands(result(hand(0.2, 0.3, 'Right'), hand(0.6, 0.7, 'Right'))), 0);
  const next = tracker.update(extractHands(result(hand(0.61, 0.7, 'Right'), hand(0.2, 0.31, 'Right'))), 33);
  for (const p of first) {
    const q = next.find((n) => n.id === p.id);
    assert.ok(Math.hypot(q.x - p.x, q.y - p.y) < 0.05, 'each id keeps its own hand');
  }
});

test('loss resets smoothing: reacquired hand jumps to its new location', () => {
  const tracker = new PointerTracker();
  const a = tracker.update(extractHands(result(hand(0.5, 0.5))), 0);
  assert.deepEqual(tracker.update([], 33), []);
  const b = tracker.update(extractHands(result(hand(0.45, 0.55))), 66);
  assert.equal(b[0].id, a[0].id, 'brief loss keeps identity');
  close(b[0].x, 0.55);
  close(b[0].y, 0.55);
  // Long loss creates a new owner.
  tracker.update([], 100);
  const c = tracker.update(extractHands(result(hand(0.45, 0.55))), 2000);
  assert.notEqual(c[0].id, a[0].id);
  // reset() forgets everything
  tracker.reset();
  const d = tracker.update(extractHands(result(hand(0.1, 0.1))), 2033);
  close(d[0].x, 0.9);
});

test('at most two pointers; far jump is a new hand not a teleport', () => {
  const tracker = new PointerTracker();
  const three = tracker.update(extractHands(result(hand(0.1, 0.5), hand(0.5, 0.5), hand(0.9, 0.5))), 0);
  assert.equal(three.length, 2);
  const solo = new PointerTracker();
  const a = solo.update(extractHands(result(hand(0.1, 0.5))), 0);
  const b = solo.update(extractHands(result(hand(0.9, 0.5))), 33);
  assert.equal(b.length, 1);
  assert.notEqual(b[0].id, a[0].id);
  close(b[0].x, 0.1);
});
