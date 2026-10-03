import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, REACTIONS } from '../../js/game.js';
import { createRng } from '../../js/random.js';
import { SCENES, SCENE_IDS } from '../../js/scenes.js';

const FAST = { introMs: 100, revealMs: 50, reactionMs: 100, celebrationMs: 200, transitionMs: 100 };
const PARK = { x: 0.5, y: 0.03 }; // hand present but touching nothing

function makeGame(opts = {}) {
  const game = new Game({ rng: createRng(opts.seed ?? 42), bonusRate: 0, cameoRate: 0, ...opts, config: { ...FAST, ...(opts.config || {}) } });
  game.start();
  return game;
}

class Hand {
  constructor(id = 'right') {
    this.id = id;
    this.sampleId = 0;
  }
  at(x, y) {
    this.sampleId += 1;
    return { id: this.id, x, y, active: true, sampleId: this.sampleId };
  }
}

function run(game, ms, fn = () => []) {
  const frames = Math.ceil(ms / 33);
  for (let i = 0; i < frames; i += 1) game.update(33, fn(i));
}

function finishIntro(game) {
  run(game, game.config.introMs + 40);
  assert.equal(game.snapshot().state, 'HIDING');
}

function revealDog(game, hand) {
  const { x, y } = game.snapshot().dog;
  game.update(33, [hand.at(x, y)]);
  run(game, game.config.revealMs + 40, () => [hand.at(x, y)]);
}

function wiggle(game, hand, frames = 60, ampPx = 40) {
  const { x, y } = game.snapshot().dog;
  for (let i = 0; i < frames; i += 1) {
    const s = game.snapshot().state;
    if (s !== 'REVEALED' && s !== 'SCRATCHING') return i;
    const dx = (i % 2 === 0 ? ampPx : -ampPx) / 1600;
    game.update(33, [hand.at(x + dx, y + ((i % 3) - 1) * 0.01)]);
  }
  return frames;
}

function doEncounter(game, hand) {
  revealDog(game, hand);
  wiggle(game, hand, 200);
  run(game, game.config.reactionMs + 40, () => [hand.at(PARK.x, PARK.y)]);
}

const types = (events) => events.map((e) => e.type);

test('start exposes intro state, scene and spot immediately', () => {
  const game = new Game({ rng: createRng(1), scene: 'bedroom' });
  game.start();
  const s = game.snapshot();
  assert.equal(s.state, 'SCENE_INTRO');
  assert.equal(s.sceneId, 'bedroom');
  assert.equal(s.sceneNumber, 1);
  assert.ok(SCENES.bedroom.spots.some((sp) => sp.id === s.spotId));
  assert.equal(s.paws, 0);
  assert.equal(s.bonusHits, 0);
  assert.deepEqual(game.drainEvents(), [{ type: 'scene', kind: 'bedroom' }]);
  assert.deepEqual(game.drainEvents(), []);
  assert.equal(new Game({ scene: 'nope' }).start().sceneId, 'backyard');
});

test('snapshot contains every contract field', () => {
  const game = makeGame();
  const s = game.snapshot();
  for (const k of ['state', 'sceneId', 'spotId', 'sceneNumber', 'elapsedMs', 'stateElapsedMs', 'paws', 'bonusHits', 'hasHand', 'paused', 'dog', 'bonus', 'cameo', 'propEffects']) {
    assert.ok(k in s, k);
  }
  for (const k of ['x', 'y', 'mode', 'progress', 'reaction', 'pose', 'hintLevel', 'revealRect', 'scratchRect']) assert.ok(k in s.dog, `dog.${k}`);
  for (const r of [s.dog.revealRect, s.dog.scratchRect]) {
    assert.equal(r.x, s.dog.x);
    assert.equal(r.y, s.dog.y);
    assert.ok(r.w > 0 && r.h > 0);
  }
  assert.ok(Array.isArray(s.propEffects));
});

test('intro continues without a hand; dt is clamped and NaN-safe', () => {
  const game = makeGame({ config: { introMs: 1000 } });
  game.update(1e9, []);
  assert.equal(game.snapshot().state, 'SCENE_INTRO');
  assert.equal(game.snapshot().elapsedMs, 100);
  game.update(NaN, null);
  game.update(-50, undefined);
  assert.equal(game.snapshot().elapsedMs, 100);
  run(game, 1000);
  assert.equal(game.snapshot().state, 'HIDING');
});

test('blue dog never times out; hints escalate once each to level 4', () => {
  const game = makeGame();
  finishIntro(game);
  game.drainEvents();
  const hand = new Hand();
  run(game, 10 * 60 * 1000, () => [hand.at(PARK.x, PARK.y)]);
  const s = game.snapshot();
  assert.equal(s.state, 'HIDING');
  assert.equal(s.dog.hintLevel, 4);
  const hints = game.drainEvents().filter((e) => e.type === 'hint');
  assert.deepEqual(hints.map((h) => h.progress), [0.25, 0.5, 0.75, 1]);
  assert.ok(s.dog.revealRect.w > game.config.revealSize.w, 'reveal target grows with hints');
});

test('no hand pauses encounter timers and reports paused', () => {
  const game = makeGame();
  finishIntro(game);
  run(game, 30000, () => []);
  const s = game.snapshot();
  assert.equal(s.paused, true);
  assert.equal(s.hasHand, false);
  assert.equal(s.dog.hintLevel, 0);
  assert.equal(s.stateElapsedMs, 0);
  assert.equal(s.state, 'HIDING');
});

test('generous reveal hitbox triggers found once', () => {
  const game = makeGame();
  finishIntro(game);
  game.drainEvents();
  const hand = new Hand();
  const { x, y, revealRect } = game.snapshot().dog;
  game.update(33, [hand.at(x + revealRect.w * 0.45, y - revealRect.h * 0.45)]);
  assert.equal(game.snapshot().state, 'REVEALED');
  assert.equal(game.snapshot().dog.mode, 'revealing');
  run(game, 200, () => [hand.at(x, y)]);
  const found = game.drainEvents().filter((e) => e.type === 'found');
  assert.equal(found.length, 1);
  assert.equal(found[0].x, x);
  assert.equal(game.snapshot().dog.mode, 'waiting');
});

test('jitter over the dog never completes a scratch', () => {
  const game = makeGame();
  finishIntro(game);
  const hand = new Hand();
  revealDog(game, hand);
  const { x, y } = game.snapshot().dog;
  const rng = createRng(99);
  run(game, 120000, () => [hand.at(x + ((rng() - 0.5) * 10) / 1600, y + ((rng() - 0.5) * 10) / 900)]);
  const s = game.snapshot();
  assert.equal(s.paws, 0);
  assert.equal(s.dog.progress, 0);
  assert.ok(!types(game.drainEvents()).includes('scratch'));
});

test('rough wiggle scratches with progressive progress and exactly one paw', () => {
  const game = makeGame();
  finishIntro(game);
  const hand = new Hand();
  revealDog(game, hand);
  game.drainEvents();
  const { x, y } = game.snapshot().dog;
  const progresses = [];
  for (let i = 0; i < 40 && game.snapshot().state !== 'REACTION'; i += 1) {
    game.update(33, [hand.at(x + (i % 2 ? 35 : -35) / 1600, y)]);
    progresses.push(game.snapshot().dog.progress);
  }
  assert.equal(game.snapshot().state, 'REACTION');
  assert.ok(progresses.some((p) => p > 0 && p < 1), 'intermediate progress');
  for (let i = 1; i < progresses.length; i += 1) assert.ok(progresses[i] >= progresses[i - 1]);
  // keep wiggling on the dog during reaction: no duplicate award
  run(game, 60, (i) => [hand.at(x + (i % 2 ? 35 : -35) / 1600, y)]);
  const events = game.drainEvents();
  const scratches = events.filter((e) => e.type === 'scratch');
  assert.equal(scratches.length, 1);
  assert.ok(REACTIONS.includes(scratches[0].kind));
  assert.equal(scratches[0].progress, 1 / 6);
  assert.equal(game.snapshot().paws, 1);
  assert.equal(game.snapshot().dog.reaction, scratches[0].kind);
});

test('duplicate samples (same sampleId) add no progress', () => {
  const game = makeGame();
  finishIntro(game);
  const hand = new Hand();
  revealDog(game, hand);
  const { x, y } = game.snapshot().dog;
  game.update(33, [hand.at(x - 0.02, y)]);
  const stale = hand.at(x + 0.02, y);
  game.update(33, [stale]);
  const after = game.snapshot().debug.scratchPx;
  for (let i = 0; i < 20; i += 1) game.update(33, [{ ...stale, x: i % 2 ? x - 0.02 : x + 0.02 }]);
  assert.equal(game.snapshot().debug.scratchPx, after);
});

test('hand loss mid-scratch preserves progress; resume jump gives no credit', () => {
  const game = makeGame();
  finishIntro(game);
  const hand = new Hand();
  revealDog(game, hand);
  const { x, y, scratchRect } = game.snapshot().dog;
  for (let i = 0; i < 3; i += 1) game.update(33, [hand.at(x + (i % 2 ? 30 : -30) / 1600, y)]);
  const before = game.snapshot().dog.progress;
  assert.ok(before > 0 && before < 1);
  assert.equal(game.snapshot().state, 'SCRATCHING');
  run(game, 20000, () => []);
  let s = game.snapshot();
  assert.equal(s.paused, true);
  assert.equal(s.state, 'SCRATCHING');
  assert.equal(s.dog.progress, before);
  // reacquire on the opposite side of the scratch rect (would be a big jump)
  game.update(33, [hand.at(x + scratchRect.w * 0.45, y)]);
  game.update(33, [hand.at(x - scratchRect.w * 0.2, y)]);
  s = game.snapshot();
  assert.equal(s.dog.progress, before);
  assert.equal(s.paused, false);
  // leaving the region also preserves progress
  run(game, 500, () => [hand.at(PARK.x, PARK.y)]);
  assert.equal(game.snapshot().dog.progress, before);
  wiggle(game, hand, 100);
  assert.equal(game.snapshot().paws, 1);
});

test('two hands cannot award duplicate progress', () => {
  const single = makeGame({ seed: 5 });
  const double = makeGame({ seed: 5 });
  for (const g of [single, double]) {
    finishIntro(g);
    revealDog(g, new Hand('a'));
  }
  const a1 = new Hand('a');
  const a2 = new Hand('a');
  const b = new Hand('b');
  const { x, y } = single.snapshot().dog;
  for (let i = 0; i < 3; i += 1) {
    const dx = (i % 2 ? 30 : -30) / 1600;
    single.update(33, [a1.at(x + dx, y)]);
    double.update(33, [a2.at(x + dx, y), b.at(x - dx, y + 0.02)]);
  }
  assert.equal(double.snapshot().debug.scratchPx, single.snapshot().debug.scratchPx);
});

test('reaction and celebration continue without a hand; full scene loop', () => {
  const game = makeGame({ scene: 'lounge' });
  finishIntro(game);
  const hand = new Hand();
  const spots = [game.snapshot().spotId];
  const reactions = [];
  for (let n = 1; n <= 6; n += 1) {
    revealDog(game, hand);
    wiggle(game, hand, 200);
    assert.equal(game.snapshot().state, 'REACTION');
    reactions.push(game.snapshot().dog.reaction);
    assert.equal(game.snapshot().paws, n);
    run(game, game.config.reactionMs + 40, () => []); // no hand needed
    if (n < 6) {
      assert.equal(game.snapshot().state, 'HIDING');
      spots.push(game.snapshot().spotId);
    }
  }
  assert.equal(game.snapshot().state, 'CELEBRATION');
  assert.equal(game.snapshot().dog.mode, 'celebrate');
  assert.ok(game.snapshot().celebrationCast.includes('blue'));
  const ev = game.drainEvents();
  assert.equal(ev.filter((e) => e.type === 'scratch').length, 6);
  assert.equal(ev.filter((e) => e.type === 'celebration').length, 1);
  for (let i = 1; i < spots.length; i += 1) {
    assert.notEqual(spots[i], spots[i - 1]);
    if (i > 1) assert.notEqual(spots[i], spots[i - 2]);
  }
  for (let i = 1; i < reactions.length; i += 1) assert.notEqual(reactions[i], reactions[i - 1]);
  run(game, game.config.celebrationMs + 40);
  assert.equal(game.snapshot().state, 'SCENE_TRANSITION');
  const next = game.snapshot().nextSceneId;
  assert.notEqual(next, 'lounge');
  run(game, game.config.transitionMs + 40);
  const s = game.snapshot();
  assert.equal(s.state, 'SCENE_INTRO');
  assert.equal(s.sceneId, next);
  assert.equal(s.sceneNumber, 2);
  assert.equal(s.paws, 0);
  assert.deepEqual(game.drainEvents().filter((e) => e.type === 'scene'), [{ type: 'scene', kind: next }]);
});

test('scenes never repeat consecutively over many sessions', () => {
  const game = makeGame({ seed: 77 });
  const hand = new Hand();
  let prev = game.snapshot().sceneId;
  const seen = new Set([prev]);
  for (let scene = 0; scene < 12; scene += 1) {
    finishIntro(game);
    for (let n = 0; n < 6; n += 1) doEncounter(game, hand);
    run(game, game.config.celebrationMs + game.config.transitionMs + 100);
    const cur = game.snapshot().sceneId;
    assert.notEqual(cur, prev);
    seen.add(cur);
    prev = cur;
  }
  assert.equal(seen.size, SCENE_IDS.length);
});

function bonusGame(extra = {}) {
  return makeGame({ bonusRate: 1, config: { bonusDelayMinMs: 300, bonusDelayMaxMs: 300, bonusMidScratchChance: 0, ...extra } });
}

test('bonus hit is instant, decorative and never changes paws or dog state', () => {
  const game = bonusGame();
  finishIntro(game);
  game.drainEvents();
  const hand = new Hand();
  const spot = game.snapshot().spotId;
  run(game, 400, () => [hand.at(PARK.x, PARK.y)]);
  let s = game.snapshot();
  assert.ok(s.bonus && s.bonus.active, 'bonus appeared');
  assert.ok(s.dog.lookAt);
  assert.ok(Math.hypot((s.bonus.x - s.dog.x) * 1600, (s.bonus.y - s.dog.y) * 900) >= 300, 'away from blue dog');
  assert.equal(s.bonus.totalMs, 1500);
  game.update(33, [hand.at(s.bonus.x + 0.08, s.bonus.y)]);
  s = game.snapshot();
  assert.equal(s.bonusHits, 1);
  assert.equal(s.bonus.hit, true);
  assert.equal(s.bonus.active, false);
  assert.equal(s.paws, 0);
  assert.equal(s.state, 'HIDING');
  assert.equal(s.spotId, spot);
  const ev = types(game.drainEvents());
  assert.deepEqual(ev.filter((t) => t.startsWith('bonus')), ['bonusAppeared', 'bonusHit']);
  run(game, 1000, () => [hand.at(PARK.x, PARK.y)]);
  assert.equal(game.snapshot().bonus, null);
});

test('missed bonus is harmless and its deadline pauses without a hand', () => {
  const game = bonusGame();
  finishIntro(game);
  const hand = new Hand();
  run(game, 400, () => [hand.at(PARK.x, PARK.y)]);
  const remaining = game.snapshot().bonus.remainingMs;
  run(game, 10000, () => []);
  assert.equal(game.snapshot().bonus.remainingMs, remaining);
  assert.equal(game.snapshot().paused, true);
  game.drainEvents();
  run(game, 3000, () => [hand.at(PARK.x, PARK.y)]);
  const s = game.snapshot();
  assert.equal(s.bonus, null);
  assert.equal(s.bonusHits, 0);
  assert.equal(s.state, 'HIDING');
  assert.ok(types(game.drainEvents()).includes('bonusMiss'));
  doEncounter(game, hand);
  assert.equal(game.snapshot().paws, 1);
});

test('rare mid-scratch bonus overlays scratching without losing progress', () => {
  const game = makeGame({ bonusRate: 1, config: { bonusMidScratchChance: 1 } });
  finishIntro(game);
  const hand = new Hand();
  run(game, 5000, () => [hand.at(PARK.x, PARK.y)]);
  assert.equal(game.snapshot().bonus, null, 'scratch-mode bonus waits for scratching');
  revealDog(game, hand);
  const { x, y } = game.snapshot().dog;
  let i = 0;
  while (!game.snapshot().bonus && i < 20) {
    game.update(33, [hand.at(x + (i % 2 ? 30 : -30) / 1600, y)]);
    i += 1;
  }
  let s = game.snapshot();
  assert.equal(s.state, 'SCRATCHING');
  assert.ok(s.bonus.active && s.bonus.midScratch);
  assert.deepEqual(s.dog.lookAt, { x: s.bonus.x, y: s.bonus.y });
  const progress = s.dog.progress;
  assert.ok(progress >= 0.3 && progress < 1);
  game.update(33, [hand.at(s.bonus.x, s.bonus.y)]);
  s = game.snapshot();
  assert.equal(s.bonusHits, 1);
  assert.equal(s.state, 'SCRATCHING');
  assert.equal(s.dog.progress, progress);
  wiggle(game, hand, 100);
  assert.equal(game.snapshot().paws, 1);
});

test('default bonus rate respects cooldown and drought across a long session', () => {
  const game = makeGame({ bonusRate: 0.24, seed: 3, config: { bonusDelayMinMs: 100, bonusDelayMaxMs: 100, bonusMidScratchChance: 0 } });
  const hand = new Hand();
  const appearedAt = [];
  let encounter = 0;
  for (let scene = 0; scene < 8; scene += 1) {
    finishIntro(game);
    for (let n = 0; n < 6; n += 1) {
      run(game, 200, () => [hand.at(PARK.x, PARK.y)]);
      if (types(game.drainEvents()).includes('bonusAppeared')) appearedAt.push(encounter);
      doEncounter(game, hand);
      encounter += 1;
    }
    run(game, game.config.celebrationMs + game.config.transitionMs + 100);
    game.drainEvents();
  }
  assert.ok(appearedAt.length >= 8, `appearances ${appearedAt.length}`);
  for (let i = 1; i < appearedAt.length; i += 1) {
    const gap = appearedAt[i] - appearedAt[i - 1];
    assert.ok(gap >= 3 && gap <= 6, `gap ${gap}`);
  }
});

test('props trigger on touch, need leave-to-rearm and cooldown', () => {
  const game = makeGame({ scene: 'backyard' });
  finishIntro(game);
  game.drainEvents();
  const hand = new Hand();
  const prop = SCENES.backyard.props.find((p) => p.id === 'wind-chime');
  run(game, 500, () => [hand.at(prop.x, prop.y)]);
  let props = game.drainEvents().filter((e) => e.type === 'prop');
  assert.equal(props.length, 1);
  assert.equal(props[0].kind, 'windChime');
  assert.equal(game.snapshot().propEffects[0].id, 'wind-chime');
  game.update(33, [hand.at(PARK.x, PARK.y)]);
  game.update(33, [hand.at(prop.x, prop.y)]);
  assert.equal(game.drainEvents().filter((e) => e.type === 'prop').length, 0, 'cooldown');
  run(game, 1300, () => [hand.at(PARK.x, PARK.y)]);
  game.update(33, [hand.at(prop.x, prop.y)]);
  props = game.drainEvents().filter((e) => e.type === 'prop');
  assert.equal(props.length, 1);
  assert.equal(game.snapshot().state, 'HIDING');
  assert.equal(game.snapshot().paws, 0);
  run(game, 2000, () => []);
  assert.equal(game.snapshot().propEffects.length, 0);
});

test('props never fire while pointer is in the blue dog interaction area', () => {
  const game = makeGame({ scene: 'backyard' });
  finishIntro(game);
  const prop = SCENES.backyard.props[0];
  game.spot = { ...game.spot, x: prop.x, y: prop.y }; // force overlap
  game.drainEvents();
  const hand = new Hand();
  run(game, 500, () => [hand.at(prop.x, prop.y)]);
  const ev = types(game.drainEvents());
  assert.ok(ev.includes('found'));
  assert.ok(!ev.includes('prop'));
});

test('cameos are decorative, timed and interpolated', () => {
  const game = makeGame({ cameoRate: 1, config: { cameoDelayMinMs: 100, cameoDelayMaxMs: 100 } });
  finishIntro(game);
  run(game, 200, () => []);
  const c = game.snapshot().cameo;
  assert.ok(c, 'cameo visible even without hand');
  assert.ok(['dad', 'mum', 'both', 'rare'].includes(c.kind));
  assert.ok(c.progress >= 0 && c.progress <= 1);
  assert.equal(game.snapshot().state, 'HIDING');
  run(game, 9000, () => []);
  assert.equal(game.snapshot().cameo, null);
  assert.equal(game.snapshot().paws, 0);
});

test('adaptation stays within configured bounds', () => {
  const game = makeGame({ bonusRate: 1, config: { bonusDelayMinMs: 100, bonusDelayMaxMs: 100, bonusMidScratchChance: 0 } });
  const hand = new Hand();
  finishIntro(game);
  for (let n = 0; n < 5; n += 1) {
    run(game, 15000, () => [hand.at(PARK.x, PARK.y)]); // slow find, bonus missed
    revealDog(game, hand);
    const { x, y } = game.snapshot().dog;
    // slow, hesitant scratching: a 25px stroke every ~660ms
    for (let i = 0; i < 2000 && game.snapshot().state !== 'REACTION'; i += 1) {
      const side = Math.floor(i / 20) % 2 ? 12.5 : -12.5;
      game.update(33, [hand.at(x + side / 1600, y)]);
    }
    run(game, game.config.reactionMs + 40, () => [hand.at(PARK.x, PARK.y)]);
  }
  const a = game.snapshot().debug.adapt;
  const lim = game.config.adaptation;
  assert.ok(a.hintScale >= lim.minHintScale && a.hintScale < 1);
  assert.ok(a.generosity <= lim.maxGenerosity && a.generosity > 1);
  assert.ok(a.scratchScale >= lim.minScratchScale && a.scratchScale < 1);
  assert.ok(a.bonusDurationMs <= game.config.bonusMaxDurationMs && a.bonusDurationMs > 1500);

  const off = makeGame({ config: { adaptation: { enabled: false } } });
  finishIntro(off);
  run(off, 15000, () => [hand.at(PARK.x, PARK.y)]);
  revealDog(off, hand);
  assert.equal(off.snapshot().debug.adapt.hintScale, 1);
});
