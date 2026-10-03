import { test, expect } from '@playwright/test';

test('visible hiding clues stay within reveal targets at all 28 spots and five hint levels', async ({ page }) => {
  await page.goto('/?debug=true&input=mouse&bonusRate=0&cameoRate=0');
  await page.waitForFunction(() => Boolean(window.__BLUE_DOG__));
  const results = await page.evaluate(() => {
    const api = window.__BLUE_DOG__;
    api.start();
    api.setPointers([]);
    const svg = document.getElementById('world');
    const matrix = svg.getScreenCTM();
    const stageRect = (x, y, w, h) => {
      const a = new DOMPoint(x, y).matrixTransform(matrix);
      const b = new DOMPoint(x + w, y + h).matrixTransform(matrix);
      return { left: a.x, top: a.y, right: b.x, bottom: b.y };
    };
    const intersect = (a, b) => ({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) });
    const results = [];
    for (const sceneId of ['backyard', 'bedroom', 'lounge', 'playground']) {
      api.game._enterIntro(sceneId);
      for (const spot of api.game.scene.spots) {
        for (const hint of [0, 1, 2, 3, 4]) {
        api.game.spot = spot;
        api.game.hintLevel = hint;
        api.game.bonus = null;
        api.game._setState('HIDING');
        api.step(0);
        api.renderer.hideStart = api.renderer.clock - 500;
        api.step(0);
        const rect = api.snapshot().dog.revealRect;
        const target = stageRect((rect.x - rect.w / 2) * 1600, (rect.y - rect.h / 2) * 900, rect.w * 1600, rect.h * 900);
        const bandNode = api.renderer.hideClipBand;
        const band = stageRect(Number(bandNode.getAttribute('x')), Number(bandNode.getAttribute('y')), Number(bandNode.getAttribute('width')), Number(bandNode.getAttribute('height')));
        const parts = [...api.renderer.blue.root.querySelectorAll('.dog-ear, .dog-head, .dog-tail, .dog-leg')];
        const visible = parts.map(part => intersect(part.getBoundingClientRect(), band)).filter(box => box.right - box.left > 2 && box.bottom - box.top > 2);
        const centersInside = visible.map(box => {
          const x = (box.left + box.right) / 2;
          const y = (box.top + box.bottom) / 2;
          return x >= target.left && x <= target.right && y >= target.top && y <= target.bottom;
        });
        results.push({ sceneId, spotId: spot.id, hint, visible: visible.length, centersInside });
        }
      }
    }
    return results;
  });
  expect(results).toHaveLength(140);
  for (const result of results) {
    expect(result.visible, `${result.sceneId}/${result.spotId} hint ${result.hint}: visible clue`).toBeGreaterThan(0);
    expect(result.centersInside.every(Boolean), `${result.sceneId}/${result.spotId} hint ${result.hint}: clue center in target`).toBe(true);
  }
});
