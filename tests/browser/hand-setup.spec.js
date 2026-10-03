import { test, expect } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } });

async function syntheticHands(page) {
  await page.addInitScript(() => {
    window.handMode = 'none';
    window.Worker = class {
      constructor() { this.listeners = new Map(); this.frames = 0; this.closed = false; }
      addEventListener(type, listener) { this.listeners.set(type, listener); }
      removeEventListener(type) { this.listeners.delete(type); }
      terminate() { this.closed = true; }
      postMessage(message) {
        if (this.closed) return;
        let data;
        if (message.type === 'init') data = { type: 'ready' };
        else if (message.type === 'frame') {
          message.bitmap.close();
          this.frames++;
          const detected = window.handMode === 'steady' || (window.handMode === 'flicker' && this.frames % 2 === 0);
          const points = Array.from({ length: 21 }, (_, i) => ({ x: 0.5 + (i % 4) * 0.01, y: 0.6 - i * 0.01, z: 0 }));
          points[8] = { x: 0.5, y: 0.3, z: 0 };
          data = { type: 'result', id: message.id, inferenceMs: 1, result: {
            landmarks: detected ? [points] : [],
            handedness: detected ? [[{ categoryName: 'Right', score: 1 }]] : [],
          } };
        } else return;
        queueMicrotask(() => { if (!this.closed) this.listeners.get('message')?.({ data }); });
      }
    };
  });
}

test('live mirror shows tracked hand and paw; flicker resets the steady countdown', async ({ page }) => {
  await syntheticHands(page);
  await page.goto('/?debug=true');
  await page.locator('#start-button').click();
  await expect(page.locator('#setup-title')).toHaveText('Show me your hand');
  await expect(page.locator('#hand-setup-preview')).toBeVisible();
  expect(await page.evaluate(() => document.getElementById('hand-setup-preview').srcObject === document.getElementById('camera-preview').srcObject)).toBe(true);
  await page.evaluate(() => { window.handMode = 'flicker'; });
  await expect(page.locator('#setup-message')).toContainText('Move slowly');
  await expect(page.locator('#setup-overlay')).toBeVisible();
  await expect(page.locator('#countdown')).toBeHidden();
  await page.evaluate(() => { window.handMode = 'steady'; });
  await expect(page.locator('#hand-setup-tracking .setup-paw-pointer').first()).toBeVisible();
  await expect(page.locator('#countdown')).toBeVisible({ timeout: 5000 });
  await page.evaluate(() => { window.handMode = 'none'; });
  await expect(page.locator('#countdown')).toBeHidden();
  await expect(page.locator('#setup-message')).toContainText('Move slowly');
  await expect(page.locator('#setup-overlay')).toBeVisible();
  await page.evaluate(() => { window.handMode = 'steady'; });
  await expect(page.locator('#setup-overlay')).toBeHidden({ timeout: 7000 });
  expect(await page.evaluate(() => document.getElementById('hand-setup-preview').srcObject)).toBeNull();
  expect(await page.evaluate(() => window.__BLUE_DOG__.trackingStatus().running)).toBe(true);
  await page.locator('#settings-toggle').click();
  await page.locator('#stop-camera').click();
});

test('lost tracking shows the hand and paw guide in the center, then clears on return', async ({ page }) => {
  await syntheticHands(page);
  await page.goto('/?debug=true');
  await page.locator('#start-button').click();
  await expect(page.locator('#setup-title')).toHaveText('Show me your hand');
  await page.evaluate(() => { window.handMode = 'steady'; });
  await expect(page.locator('#setup-overlay')).toBeHidden({ timeout: 7000 });
  await page.waitForFunction(() => ['HIDING', 'REVEALED', 'SCRATCHING'].includes(window.__BLUE_DOG__.snapshot().state));
  await page.evaluate(() => { window.handMode = 'none'; });
  await expect(page.locator('#hand-hint')).toBeVisible();
  await expect(page.locator('#hand-hint-title')).toHaveText('Show me your hand');
  await expect(page.locator('#lost-hand-guide')).toBeVisible();
  await expect(page.locator('#hand-hint')).toContainText('Point your index finger up to the sky');
  await expect.poll(async () => {
    const card = await page.locator('.hand-recovery-card').boundingBox();
    const frame = await page.locator('.game-frame').boundingBox();
    return Math.max(
      Math.abs(card.x + card.width / 2 - frame.x - frame.width / 2),
      Math.abs(card.y + card.height / 2 - frame.y - frame.height / 2),
    );
  }).toBeLessThan(2);
  await page.screenshot({ path: 'artifacts/hand-lost-center.png' });
  await page.evaluate(() => { window.handMode = 'steady'; });
  await expect(page.locator('#hand-hint')).toBeHidden();
  await page.locator('#settings-toggle').click();
  await page.locator('#stop-camera').click();
});

test('stopping camera while finding a hand clears the automatic mirror', async ({ page }) => {
  await page.goto('/');
  await page.locator('#start-button').click();
  await expect(page.locator('#setup-title')).toHaveText('Show me your hand', { timeout: 60000 });
  await expect(page.locator('#hand-setup-preview')).toBeVisible();
  await page.locator('#settings-toggle').click();
  await page.locator('#stop-camera').click();
  await expect(page.locator('#hand-setup-view')).toBeHidden();
  expect(await page.evaluate(() => document.getElementById('hand-setup-preview').srcObject)).toBeNull();
  await expect(page.locator('#countdown')).toBeHidden();
});
