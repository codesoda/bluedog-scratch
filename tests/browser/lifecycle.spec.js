import { test, expect } from '@playwright/test';

test('stop during pending permission leaves a usable startup and ignores late rejection', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: () => new Promise((resolve, reject) => { window.rejectPermission = reject; }) });
  });
  await page.goto('/');
  await page.locator('#start-button').click();
  await page.waitForFunction(() => Boolean(window.rejectPermission));
  await page.locator('#settings-toggle').click();
  await page.locator('#stop-camera').click();
  await page.evaluate(() => window.rejectPermission(new DOMException('Denied late', 'NotAllowedError')));
  await expect(page.locator('#setup-title')).toHaveText('The camera is off');
  await expect(page.locator('#start-button')).toBeVisible();
  await expect(page.locator('#start-button')).toBeEnabled();
  await expect(page.locator('#loading-progress')).toBeHidden();
  await page.locator('#start-button').click();
  await expect(page.locator('#resume-camera')).toBeHidden();
  await expect(page.locator('#stop-camera')).toBeVisible();
});

test('adult stop preserves partial progress and resets the movement baseline', async ({ page }) => {
  await page.goto('/?debug=true&input=mouse&bonusRate=0');
  await page.waitForFunction(() => Boolean(window.__BLUE_DOG__));
  const before = await page.evaluate(() => {
    const api = window.__BLUE_DOG__;
    api.start();
    api.setPointers([{ id: 'test', x: 0.98, y: 0.98, active: true, sampleId: 1 }]);
    for (let i = 0; i < 20; i++) api.step(100);
    const rect = api.snapshot().dog.revealRect;
    api.setPointers([{ id: 'test', x: rect.x, y: rect.y, active: true, sampleId: 2 }]);
    for (let i = 0; i < 6; i++) api.step(100);
    api.setPointers([{ id: 'test', x: rect.x - 0.025, y: rect.y, active: true, sampleId: 3 }]);
    api.step(50);
    api.setPointers([{ id: 'test', x: rect.x + 0.025, y: rect.y, active: true, sampleId: 4 }]);
    api.step(50);
    return api.snapshot();
  });
  expect(before.dog.progress).toBeGreaterThan(0);
  await page.locator('#settings-toggle').click();
  await page.locator('#stop-camera').click();
  await page.locator('#resume-camera').click();
  await expect(page.locator('#setup-overlay')).toBeHidden();
  const after = await page.evaluate(() => {
    const api = window.__BLUE_DOG__;
    const rect = api.snapshot().dog.scratchRect;
    api.setPointers([{ id: 'test', x: rect.x - 0.07, y: rect.y, active: true, sampleId: 5 }]);
    api.step(50);
    return api.snapshot();
  });
  expect(after.dog.progress).toBe(before.dog.progress);
  expect(after.spotId).toBe(before.spotId);
});
