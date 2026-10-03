import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENES, SCENE_IDS, DOG_SIZE, HITBOXES, isSceneId } from '../../js/scenes.js';

const dist = (a, b) => Math.hypot((a.x - b.x) * 1600, (a.y - b.y) * 900);

test('four scenes with expected ids', () => {
  assert.deepEqual(SCENE_IDS, ['backyard', 'bedroom', 'lounge', 'playground']);
  assert.ok(isSceneId('lounge'));
  assert.ok(!isSceneId('toString'));
  assert.ok(DOG_SIZE.w > 0 && HITBOXES.reveal.w > HITBOXES.scratch.w);
});

for (const id of SCENE_IDS) {
  const scene = SCENES[id];
  test(`${id}: shape and safe geometry`, () => {
    assert.equal(scene.id, id);
    assert.equal(typeof scene.name, 'string');
    assert.equal(typeof scene.palette, 'object');
    assert.ok(scene.spots.length >= 6);
    assert.ok(scene.props.length >= 3 && scene.props.length <= 5);
    assert.ok(scene.bonusSpots.length >= 3);
    assert.ok(scene.cameos.length >= 3);
    const ids = new Set();
    for (const s of scene.spots) {
      assert.ok(!ids.has(s.id), 'unique spot id');
      ids.add(s.id);
      for (const k of ['id', 'kind', 'pose']) assert.equal(typeof s[k], 'string');
      assert.ok(s.x >= 0.12 && s.x <= 0.88, `${s.id} x`);
      assert.ok(s.y >= 0.35 && s.y <= 0.78, `${s.id} y`);
      const o = s.occluder;
      assert.ok(o && o.w > 0 && o.h > 0, 'occluder');
      // occluder must overlap the dog body so hiding actually hides it
      assert.ok(Math.abs(o.x - s.x) < o.w / 2 + DOG_SIZE.w / 2 && Math.abs(o.y - s.y) < o.h / 2 + DOG_SIZE.h / 2);
    }
    for (let i = 0; i < scene.spots.length; i += 1) {
      for (let j = i + 1; j < scene.spots.length; j += 1) {
        assert.ok(dist(scene.spots[i], scene.spots[j]) >= 200, `${scene.spots[i].id}/${scene.spots[j].id} spacing`);
      }
    }
    for (const p of scene.props) {
      for (const k of ['x', 'y', 'w', 'h']) assert.ok(p[k] > 0 && p[k] < 1);
      assert.ok(p.x - p.w / 2 >= 0 && p.x + p.w / 2 <= 1 && p.y + p.h / 2 <= 1);
      for (const s of scene.spots) assert.ok(dist(p, s) >= 180, `${p.id} away from ${s.id}`);
    }
    for (const b of scene.bonusSpots) assert.ok(b.x >= 0.1 && b.x <= 0.9 && b.y >= 0.3 && b.y <= 0.85);
    for (const c of scene.cameos) {
      assert.ok(['dad', 'mum', 'both', 'rare'].includes(c.kind));
      assert.ok(c.durationMs > 0 && c.from && c.to && typeof c.event === 'string');
    }
    assert.ok(scene.cameos.some((c) => c.kind === 'rare'));
    assert.ok(Object.isFrozen(scene.spots[0]));
  });
}
