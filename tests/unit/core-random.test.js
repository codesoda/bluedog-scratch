import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, pickAvoiding, weightedPick, BonusScheduler, CameoScheduler, hashSeed } from '../../js/random.js';
import { SCENES } from '../../js/scenes.js';

test('createRng is deterministic and in [0,1)', () => {
  const a = createRng(5);
  const b = createRng(5);
  for (let i = 0; i < 100; i += 1) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
  assert.equal(typeof hashSeed('abc'), 'number');
  assert.equal(createRng('abc')(), createRng('abc')());
});

test('pickAvoiding avoids recent items and falls back when needed', () => {
  const rng = createRng(1);
  for (let i = 0; i < 200; i += 1) assert.notEqual(pickAvoiding(rng, [1, 2, 3], [1, 2]), 1);
  assert.equal(pickAvoiding(rng, [1, 2], [1, 2]), 1, 'drops oldest restriction first');
  assert.equal(pickAvoiding(rng, [7], [7]), 7);
});

test('weightedPick honours weights', () => {
  const rng = createRng(9);
  const counts = { a: 0, b: 0 };
  for (let i = 0; i < 5000; i += 1) counts[weightedPick(rng, [{ value: 'a', weight: 3 }, { value: 'b', weight: 1 }])] += 1;
  assert.ok(counts.a / counts.b > 2.4 && counts.a / counts.b < 3.6);
});

function simulateBonus(rate, seed, n = 3000) {
  const s = new BonusScheduler({ rate });
  const rng = createRng(seed);
  const gaps = [];
  let last = -1;
  for (let i = 0; i < n; i += 1) {
    if (s.plan(rng)) {
      s.recordAppearance();
      if (last >= 0) gaps.push(i - last);
      last = i;
    } else {
      s.recordEncounterWithoutBonus();
    }
  }
  return gaps;
}

test('bonus cooldown and drought keep gaps within 3..6 encounters', () => {
  const gaps = simulateBonus(0.24, 11);
  assert.ok(gaps.length > 300);
  assert.ok(Math.min(...gaps) >= 3, 'at least two encounters between appearances');
  assert.ok(Math.max(...gaps) <= 6, 'forced after drought');
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  assert.ok(mean > 3 && mean < 5.5, `mean ${mean}`);
});

test('bonus rate 0 never appears; rate 1 testing mode appears every encounter', () => {
  assert.equal(simulateBonus(0, 1).length, 0);
  assert.ok(simulateBonus(1, 1, 50).every((g) => g === 1));
});

test('mid-scratch plans are rare', () => {
  const s = new BonusScheduler({ rate: 1 });
  const rng = createRng(4);
  let mid = 0;
  for (let i = 0; i < 2000; i += 1) if (s.plan(rng).mode === 'scratch') mid += 1;
  assert.ok(mid > 200 && mid < 600);
});

test('cameos are limited: no back-to-back, per-scene cap, rare is rare', () => {
  const cameos = SCENES.backyard.cameos;
  const s = new CameoScheduler({ rate: 0.3 });
  const rng = createRng(21);
  let prev = false;
  let rare = 0;
  let total = 0;
  for (let scene = 0; scene < 400; scene += 1) {
    s.newScene();
    let inScene = 0;
    for (let e = 0; e < 6; e += 1) {
      const plan = s.plan(rng, cameos);
      if (plan) {
        assert.ok(!prev, 'no consecutive cameos');
        inScene += 1;
        total += 1;
        if (plan.entry.kind === 'rare') rare += 1;
      }
      prev = Boolean(plan);
    }
    assert.ok(inScene <= 3);
  }
  assert.ok(total > 200 && total < 900, `total ${total}`);
  assert.ok(rare <= total * 0.06, `rare ${rare}/${total}`);
  assert.equal(new CameoScheduler({ rate: 0 }).plan(rng, cameos), null);
});
