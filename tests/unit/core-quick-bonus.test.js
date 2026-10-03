import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../js/game.js';
import { createRng } from '../../js/random.js';

function quickPlayer(seed, count) {
  const game = new Game({ rng: createRng(seed), cameoRate: 0 });
  game.start();
  let sampleId = 0;
  let encounter = 1;
  const appearances = [];
  const step = (x = 0.98, y = 0.03) => {
    game.update(33, [{ id: 'quick-player', x, y, active: true, sampleId: ++sampleId }]);
    for (const event of game.drainEvents()) if (event.type === 'bonusAppeared') appearances.push(encounter);
  };
  const reachHiding = () => {
    for (let i = 0; i < 500 && game.state !== 'HIDING'; i++) step();
    assert.equal(game.state, 'HIDING');
  };
  for (; encounter <= count; encounter++) {
    reachHiding();
    const { x, y } = game.spot;
    step(x, y);
    for (let i = 0; i < 16; i++) step(x, y);
    for (let i = 0; i < 30 && game.state !== 'REACTION'; i++) step(x + (i % 2 ? 0.025 : -0.025), y);
    assert.equal(game.state, 'REACTION');
  }
  return appearances;
}

test('quick finds and immediate scratches cannot starve bonus drought protection', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const count = 36;
    const appearances = quickPlayer(seed, count);
    assert.ok(appearances.length >= 6, `seed ${seed}: regular surprises`);
    let previous = 0;
    for (const encounter of appearances) {
      assert.ok(encounter - previous <= 6, `seed ${seed}: drought at ${encounter}`);
      if (previous) assert.ok(encounter - previous >= 3, 'two encounters between appearances');
      previous = encounter;
    }
    assert.ok(count - previous <= 6, `seed ${seed}: trailing drought`);
  }
});
