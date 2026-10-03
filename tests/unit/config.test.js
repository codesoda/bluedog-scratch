import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOptions, createRng } from '../../js/config.js';

const scenes = ['backyard', 'bedroom', 'lounge', 'playground'];
test('normal game cannot enable mouse gameplay', () => {
  assert.equal(parseOptions('?input=mouse', scenes).mouse, false);
  assert.equal(parseOptions('?debug=true&input=mouse', scenes).mouse, true);
});
test('query rates are validated and clamped', () => {
  assert.equal(parseOptions('?bonusRate=2', scenes).bonusRate, 1);
  assert.equal(parseOptions('?bonusRate=-1', scenes).bonusRate, 0);
  assert.equal(parseOptions('?bonusRate=wat', scenes).bonusRate, 0.24);
  assert.equal(parseOptions('?bonusRate=', scenes).bonusRate, 0.24);
  assert.equal(parseOptions('?scene=../../secrets', scenes).scene, null);
  assert.equal(parseOptions('?scene=bedroom', scenes).scene, 'bedroom');
});
test('seeded randomness repeats without producing out-of-range values', () => {
  const a = createRng('family');
  const b = createRng('family');
  for (let i = 0; i < 1000; i++) {
    const value = a();
    assert.equal(value, b());
    assert.ok(value >= 0 && value < 1);
  }
});
