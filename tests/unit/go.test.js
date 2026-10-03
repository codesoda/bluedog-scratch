import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../js/game.js';
import { createRng } from '../../js/random.js';
import { normalizeStagesPerGo } from '../../js/game-state.js';

function newGo(stagesPerGo) {
  const game = new Game({ rng: createRng(12), bonusRate: 0, cameoRate: 0, config: {
    ...(stagesPerGo === undefined ? {} : { stagesPerGo }),
    introMs: 1, revealMs: 1, reactionMs: 1, celebrationMs: 100, transitionMs: 1,
  } });
  game.start();
  return game;
}

function completeScene(game) {
  game.update(1, []);
  let sampleId = game.encounters * 100 + 1;
  for (let scratch = 1; scratch <= 6; scratch++) {
    assert.equal(game.state, 'HIDING');
    const { x, y } = game.snapshot().dog;
    const point = dx => [{ id: 'test', x: x + dx, y, active: true, sampleId: ++sampleId }];
    game.update(30, point(0));
    for (let i = 0; i < 40 && game.state !== 'REACTION'; i++) game.update(30, point(i % 2 ? 0.025 : -0.025));
    assert.equal(game.state, 'REACTION');
    assert.equal(game.paws, scratch);
    game.update(1, []);
  }
  assert.equal(game.state, 'CELEBRATION');
}

for (const count of [1, 6, 8, 15]) {
  test(`a ${count}-stage go awards one star per full scene and ends after its last celebration`, () => {
    const game = newGo(count);
    for (let stage = 1; stage <= count; stage++) {
      const previous = game.sceneId;
      completeScene(game);
      assert.equal(game.snapshot().completedStages, stage);
      assert.equal(game.sceneNumber, stage);
      assert.equal(game.snapshot().stagesTarget, count);
      game.update(99, []);
      assert.equal(game.state, 'CELEBRATION');
      game.update(1, []);
      if (stage === count) {
        assert.equal(game.state, 'GO_COMPLETE');
        assert.equal(game.nextSceneId, null);
      } else {
        assert.equal(game.state, 'SCENE_TRANSITION');
        game.update(1, []);
        assert.notEqual(game.sceneId, previous);
      }
    }
    assert.equal(game.encounters, 6 * count);
    assert.equal(game.drainEvents().filter(event => event.type === 'goComplete').length, 1);
    const finished = game.snapshot();
    for (let i = 0; i < 100; i++) game.update(100, [{ id: 'extra', x: 0.5, y: 0.5, active: true, sampleId: i }]);
    assert.deepEqual(game.snapshot(), finished);
    assert.deepEqual(game.drainEvents(), []);
  });
}

test('default go is six scenes, not six scratches', () => {
  const game = newGo();
  assert.equal(game.stagesTarget, 6);
  completeScene(game);
  assert.equal(game.completedStages, 1);
  assert.equal(game.encounters, 6);
  game.update(100, []);
  assert.equal(game.state, 'SCENE_TRANSITION');
});

test('changing the setting cannot shorten the current go; replay resets progress and adopts it', () => {
  const game = newGo(2);
  completeScene(game);
  game.config.stagesPerGo = 1;
  game.bonusHits = 9;
  assert.equal(game.stagesTarget, 2);
  game.update(100, []);
  assert.equal(game.state, 'SCENE_TRANSITION');
  game.update(1, []);
  completeScene(game);
  game.update(100, []);
  assert.equal(game.state, 'GO_COMPLETE');
  const next = game.start();
  assert.equal(next.state, 'SCENE_INTRO');
  assert.equal(next.stagesTarget, 1);
  assert.equal(next.completedStages, 0);
  assert.equal(next.sceneNumber, 1);
  assert.equal(next.paws, 0);
  assert.equal(next.bonusHits, 0);
  assert.equal(next.debug.encounters, 0);
});

test('stage settings round, clamp to 1–15, and fail safely to six', () => {
  for (const [input, expected] of [[0, 1], [99, 15], [8.6, 9], ['8', 8], [null, 6], [undefined, 6], ['', 6], [' ', 6], [NaN, 6], [Infinity, 6], [true, 6]]) {
    assert.equal(normalizeStagesPerGo(input), expected);
    assert.equal(newGo(input).stagesTarget, expected);
  }
});
