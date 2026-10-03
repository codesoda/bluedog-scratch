import { test, expect } from '@playwright/test';

test.use({
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
});

test('local model and worker perform inference on a synthetic Chrome camera', async ({ page }) => {
  const external = [];
  const requests = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.hostname !== '127.0.0.1') external.push(request.url());
    if (url.pathname.includes('mediapipe') || url.pathname.endsWith('.task')) requests.push(url.pathname);
  });
  await page.goto('/?debug=true&seed=synthetic');
  await page.locator('#start-button').click();
  await expect(page.locator('#setup-title')).toHaveText('Show me your hand', { timeout: 60000 });
  await expect(page.locator('#loading-progress')).toBeHidden();
  const tracking = await page.evaluate(() => window.__BLUE_DOG__.trackingStatus());
  expect(tracking.running).toBe(true);
  expect(tracking.backend).toBe('worker');
  expect(requests.some(path => path.endsWith('.task'))).toBe(true);
  expect(requests.some(path => path.endsWith('.wasm'))).toBe(true);
  expect(external).toEqual([]);
  await page.locator('#settings-toggle').click();
  await page.locator('#camera-preview-toggle').check();
  await expect(page.locator('#camera-preview')).toBeVisible();
  await page.locator('#stop-camera').click();
  await expect(page.locator('#camera-preview')).toBeHidden();
  expect(await page.evaluate(() => window.__BLUE_DOG__.trackingStatus().running)).toBe(false);
});

test('a relative build supports worker inference under a nested static path', async ({ page, context }) => {
  const prefix = '/family/blue-dog/';
  await context.route('**/family/blue-dog/**', async route => {
    const url = new URL(route.request().url());
    url.pathname = `/${url.pathname.slice(prefix.length)}`;
    const response = await route.fetch({ url: url.href });
    await route.fulfill({ response });
  });
  await page.goto(`${prefix}?debug=true`);
  await page.locator('#start-button').click();
  await expect(page.locator('#setup-title')).toHaveText('Show me your hand', { timeout: 60000 });
  expect(await page.evaluate(() => window.__BLUE_DOG__.trackingStatus().backend)).toBe('worker');
});

test('returning from page cache during hand wait offers retry and preserves audio controls', async ({ page }) => {
  await page.goto('/?debug=true');
  await page.locator('#start-button').click();
  await expect(page.locator('#setup-title')).toHaveText('Show me your hand', { timeout: 60000 });
  await page.evaluate(() => {
    dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await expect(page.locator('#retry-button')).toBeVisible();
  expect(await page.evaluate(() => window.__BLUE_DOG__.trackingStatus().running)).toBe(false);
  await page.locator('#retry-button').click();
  await expect(page.locator('#setup-title')).toHaveText('Show me your hand', { timeout: 60000 });
  await expect(page.locator('#sound-toggle')).toBeEnabled();
});

test('blocked workers use a local main-thread fallback rather than hanging', async ({ page }) => {
  await page.addInitScript(() => {
    window.Worker = class { constructor() { throw new Error('Worker blocked by test'); } };
  });
  await page.goto('/?debug=true');
  await page.locator('#start-button').click();
  await expect(page.locator('#setup-title')).toHaveText('Show me your hand', { timeout: 60000 });
  expect(await page.evaluate(() => window.__BLUE_DOG__.trackingStatus().backend)).toBe('main-thread');
});

test('missing local model shows retry and releases the camera', async ({ page, context }) => {
  await context.route('**/models/hand_landmarker.task', route => route.fulfill({ status: 404, body: 'Missing model' }));
  await page.goto('/?debug=true');
  await page.locator('#start-button').click();
  await expect(page.locator('#retry-button')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('#setup-message')).toContainText('hand tracker could not load');
  expect(await page.evaluate(() => document.getElementById('camera-preview').srcObject)).toBeNull();
  expect(await page.evaluate(() => window.__BLUE_DOG__.trackingStatus().running)).toBe(false);
});

test('a runtime worker crash offers retry and releases camera resources', async ({ page }) => {
  await page.goto('/?debug=true');
  const workerCreated = page.waitForEvent('worker');
  await page.locator('#start-button').click();
  const worker = await workerCreated;
  await expect(page.locator('#setup-title')).toHaveText('Show me your hand', { timeout: 60000 });
  await worker.evaluate(() => { setTimeout(() => { throw new Error('Injected worker crash'); }, 0); });
  await expect(page.locator('#retry-button')).toBeVisible();
  expect(await page.evaluate(() => document.getElementById('camera-preview').srcObject)).toBeNull();
  expect(await page.evaluate(() => window.__BLUE_DOG__.trackingStatus().running)).toBe(false);
});
