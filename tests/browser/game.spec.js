import { test, expect } from '@playwright/test';

async function manualStart(page, query = '') {
  const params = new URLSearchParams('debug=true&input=mouse&seed=browser&bonusRate=0&cameoRate=0');
  for (const [key, value] of new URLSearchParams(query)) params.set(key, value);
  await page.goto(`/?${params}`);
  await page.waitForFunction(() => Boolean(window.__BLUE_DOG__));
  await page.evaluate(() => {
    const api = window.__BLUE_DOG__;
    api.start();
    api.setPointers([{ id: 'test', x: 0.98, y: 0.98, active: true, sampleId: 1 }]);
    for (let i = 0; i < 20; i++) api.step(100);
  });
}

async function advance(page, ms, pointers) {
  return page.evaluate(({ ms, pointers }) => {
    const api = window.__BLUE_DOG__;
    if (pointers) api.setPointers(pointers);
    for (let elapsed = 0; elapsed < ms; elapsed += 100) api.step(Math.min(100, ms - elapsed));
    return api.snapshot();
  }, { ms, pointers });
}

async function reveal(page) {
  return page.evaluate(() => {
    const api = window.__BLUE_DOG__;
    const rect = api.snapshot().dog.revealRect;
    api.setPointers([{ id: 'test', x: rect.x, y: rect.y, active: true, sampleId: performance.now() }]);
    api.step(50);
    for (let i = 0; i < 6; i++) api.step(100);
    return api.snapshot();
  });
}

async function scratch(page) {
  return page.evaluate(() => {
    const api = window.__BLUE_DOG__;
    const rect = api.snapshot().dog.scratchRect;
    const firstPaws = api.snapshot().paws;
    let sampleId = performance.now();
    for (let i = 0; i < 30 && api.snapshot().paws === firstPaws; i++) {
      api.setPointers([{ id: 'test', x: rect.x + (i % 2 ? 0.025 : -0.025), y: rect.y, active: true, sampleId: ++sampleId }]);
      api.step(50);
    }
    return api.snapshot();
  });
}

async function nextEncounter(page) {
  return advance(page, 2100, [{ id: 'test', x: 0.98, y: 0.98, active: true, sampleId: performance.now() }]);
}

test('normal startup is polished and has no debug interface or camera request', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.cameraRequests = 0;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => { window.cameraRequests++; throw new DOMException('Denied', 'NotAllowedError'); } });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /LET'S PLAY/ })).toBeVisible();
  await expect(page.locator('#world')).toBeVisible();
  expect(await page.evaluate(() => window.__BLUE_DOG__)).toBeUndefined();
  expect(await page.evaluate(() => window.cameraRequests)).toBe(0);
  await expect(page.locator('#debug-panel')).toBeHidden();
  await expect(page.locator('#camera-preview')).toBeHidden();
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'artifacts/start-screen.png' });
});

test('camera denial offers a clear retry without mouse fallback', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => { throw new DOMException('Denied', 'NotAllowedError'); } });
  });
  await page.goto('/?input=mouse');
  await page.getByRole('button', { name: /LET'S PLAY/ }).click();
  await expect(page.locator('#setup-title')).toHaveText('The camera needs permission');
  await expect(page.getByRole('button', { name: 'TRY AGAIN' })).toBeVisible();
  await expect(page.locator('#loading-progress')).toBeHidden();
  expect(await page.evaluate(() => window.__BLUE_DOG__)).toBeUndefined();
});

test('camera permission can be retried and denied again', async ({ page }) => {
  await page.addInitScript(() => {
    window.cameraRequests = 0;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => { window.cameraRequests++; throw new DOMException('Denied', 'NotAllowedError'); } });
  });
  await page.goto('/');
  await page.locator('#start-button').click();
  await page.locator('#retry-button').click();
  await expect(page.locator('#retry-button')).toBeEnabled();
  expect(await page.evaluate(() => window.cameraRequests)).toBe(2);
});

for (const scene of ['backyard', 'bedroom', 'lounge', 'playground']) {
  test(`${scene} renders and supports find → scratch without a camera`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await manualStart(page, `&scene=${scene}`);
    const found = await reveal(page);
    expect(found.sceneId).toBe(scene);
    expect(found.state).toBe('REVEALED');
    await page.addStyleTag({ content: '#debug-panel, .layer-debug { display: none !important; }' });
    await page.screenshot({ path: `artifacts/${scene}-revealed.png` });
    const result = await scratch(page);
    expect(result.paws).toBe(1);
    expect(result.state).toBe('REACTION');
    expect(result.dog.progress).toBe(1);
    expect(await page.locator('#world').locator('*').count()).toBeGreaterThan(100);
    expect(errors).toEqual([]);
  });
}

test('a stationary pointer and sub-gate jitter do not complete a scratch', async ({ page }) => {
  await manualStart(page);
  await reveal(page);
  const result = await page.evaluate(() => {
    const api = window.__BLUE_DOG__;
    const rect = api.snapshot().dog.scratchRect;
    for (let i = 0; i < 400; i++) {
      api.setPointers([{ id: 'test', x: rect.x + (i % 2 ? 0.001 : -0.001), y: rect.y, active: true, sampleId: i + 5000 }]);
      api.step(50);
    }
    return api.snapshot();
  });
  expect(result.paws).toBe(0);
  expect(result.dog.progress).toBe(0);
});

test('hand loss preserves progress and reacquisition does not add a jump', async ({ page }) => {
  await manualStart(page);
  await reveal(page);
  const result = await page.evaluate(() => {
    const api = window.__BLUE_DOG__;
    const rect = api.snapshot().dog.scratchRect;
    api.setPointers([{ id: 'test', x: rect.x - 0.025, y: rect.y, active: true, sampleId: 8000 }]);
    api.step(50);
    api.setPointers([{ id: 'test', x: rect.x + 0.025, y: rect.y, active: true, sampleId: 8001 }]);
    api.step(50);
    const before = api.snapshot();
    api.setPointers([]);
    for (let i = 0; i < 60; i++) api.step(100);
    const lost = api.snapshot();
    api.setPointers([{ id: 'test', x: rect.x - 0.07, y: rect.y, active: true, sampleId: 8002 }]);
    api.step(50);
    return { before, lost, after: api.snapshot() };
  });
  expect(result.before.dog.progress).toBeGreaterThan(0);
  expect(result.lost.paused).toBe(true);
  expect(result.lost.dog.progress).toBe(result.before.dog.progress);
  expect(result.after.dog.progress).toBe(result.before.dog.progress);
});

test('six scratches celebrate and automatically start a different scene', async ({ page }) => {
  await manualStart(page, '&scene=backyard');
  const previousSpots = [];
  for (let i = 0; i < 6; i++) {
    const found = await reveal(page);
    if (previousSpots.length) expect(found.spotId).not.toBe(previousSpots.at(-1));
    previousSpots.push(found.spotId);
    expect((await scratch(page)).paws).toBe(i + 1);
    await nextEncounter(page);
  }
  const celebration = await page.evaluate(() => window.__BLUE_DOG__.snapshot());
  expect(celebration.state).toBe('CELEBRATION');
  await page.addStyleTag({ content: '#debug-panel, .layer-debug { display: none !important; }' });
  await page.screenshot({ path: 'artifacts/celebration.png' });
  const next = await advance(page, 8500);
  expect(next.sceneId).not.toBe('backyard');
  expect(next.sceneNumber).toBe(2);
  expect(next.paws).toBe(0);
  expect(next.state).toBe('HIDING');
});

test('hints escalate and the blue dog never expires', async ({ page }) => {
  await manualStart(page);
  const start = await page.evaluate(() => window.__BLUE_DOG__.snapshot());
  const after = await advance(page, 30000);
  expect(after.state).toBe('HIDING');
  expect(after.spotId).toBe(start.spotId);
  expect(after.dog.hintLevel).toBe(4);
  expect(after.dog.revealRect.w).toBeGreaterThan(start.dog.revealRect.w);
});

test('orange surprise pauses when a hand is lost and hit is decorative', async ({ page }) => {
  await manualStart(page, '&bonusRate=1');
  const result = await page.evaluate(() => {
    const api = window.__BLUE_DOG__;
    for (let i = 0; i < 80 && !api.snapshot().bonus?.active; i++) api.step(100);
    const before = api.snapshot();
    if (!before.bonus?.active) return { before };
    api.setPointers([]);
    for (let i = 0; i < 50; i++) api.step(100);
    const paused = api.snapshot();
    api.setPointers([{ id: 'test', x: before.bonus.x, y: before.bonus.y, active: true, sampleId: 9001 }]);
    api.step(50);
    return { before, paused, after: api.snapshot() };
  });
  expect(result.before.bonus?.active).toBe(true);
  expect(result.paused.bonus.remainingMs).toBe(result.before.bonus.remainingMs);
  expect(result.after.bonus.hit).toBe(true);
  expect(result.after.bonusHits).toBe(result.before.bonusHits + 1);
  expect(result.after.paws).toBe(result.before.paws);
});

test('adult mute persists and settings can stop the camera', async ({ page }) => {
  await page.goto('/');
  await page.locator('#sound-toggle').click();
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#settings-toggle').click();
  await expect(page.locator('#settings-panel')).toBeVisible();
  await page.locator('#stop-camera').click();
  await expect(page.locator('#resume-camera')).toBeVisible();
  await expect(page.locator('#setup-title')).toHaveText('The camera is off');
});

test('stage contains all targets at a narrow size without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await manualStart(page, '&scene=playground');
  const geometry = await page.evaluate(() => {
    const rect = document.getElementById('world').getBoundingClientRect();
    return { width: rect.width, height: rect.height, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  expect(geometry.width).toBeLessThanOrEqual(800);
  expect(geometry.overflow).toBe(false);
  expect((await scratchAfterReveal(page)).paws).toBe(1);
});

async function scratchAfterReveal(page) { await reveal(page); return scratch(page); }

test('reduced motion still provides visible gameplay and completion feedback', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await manualStart(page);
  expect((await scratchAfterReveal(page)).paws).toBe(1);
  await expect(page.locator('#world')).toBeVisible();
});

test('normal loading and debug play make no third-party requests', async ({ page }) => {
  const external = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.hostname !== '127.0.0.1') external.push(request.url());
  });
  await manualStart(page);
  await scratchAfterReveal(page);
  expect(external).toEqual([]);
});
