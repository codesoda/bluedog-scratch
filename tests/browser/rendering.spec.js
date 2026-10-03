import { test, expect } from '@playwright/test';

test('feedback particles stay small enough not to obscure the dog', async ({ page }) => {
  await page.goto('/?debug=true&input=mouse&scene=backyard&seed=particles');
  await page.waitForFunction(() => Boolean(window.__BLUE_DOG__));
  const extents = await page.evaluate(() => {
    const api = window.__BLUE_DOG__;
    api.start();
    api.setPointers([{ id: 'test', x: 0.98, y: 0.98, active: true, sampleId: 1 }]);
    for (let i = 0; i < 20; i++) api.step(100);
    const rect = api.snapshot().dog.revealRect;
    api.setPointers([{ id: 'test', x: rect.x, y: rect.y, active: true, sampleId: 2 }]);
    api.step(100);
    return [...document.querySelectorAll('.particles use')].map(node => {
      const box = node.getBBox();
      return { width: box.width, height: box.height };
    });
  });
  expect(extents.length).toBeGreaterThan(0);
  for (const extent of extents) {
    expect(extent.width).toBeLessThan(60);
    expect(extent.height).toBeLessThan(60);
  }
});
