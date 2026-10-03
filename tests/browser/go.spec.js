import { test, expect } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } });

async function setStages(page, count) {
  await page.locator('#settings-toggle').click();
  await page.locator('#stages-per-go').evaluate((input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, count);
  await page.locator('#settings-toggle').click();
}

async function finishScenes(page, count) {
  return page.evaluate(count => {
    const api = window.__BLUE_DOG__;
    Object.assign(api.game.config, { introMs: 1, revealMs: 1, reactionMs: 1, celebrationMs: 100, transitionMs: 1 });
    let sampleId = performance.now();
    for (let scene = 0; scene < count; scene++) {
      api.setPointers([]);
      api.step(1);
      for (let n = 0; n < 6; n++) {
        const rect = api.snapshot().dog.scratchRect;
        const point = offset => [{ id: 'session', x: rect.x + offset, y: rect.y, active: true, sampleId: ++sampleId }];
        api.setPointers(point(0));
        api.step(30);
        for (let i = 0; i < 40 && api.snapshot().state !== 'REACTION'; i++) {
          api.setPointers(point(i % 2 ? 0.025 : -0.025));
          api.step(30);
        }
        api.setPointers([]);
        api.step(1);
      }
      api.step(100);
      if (api.snapshot().state === 'SCENE_TRANSITION') api.step(1);
    }
    return api.snapshot();
  }, count);
}

test('settings default to six whole scenes and the keyboard slider spans 1–15', async ({ page }) => {
  await page.goto('/');
  await page.locator('#settings-toggle').click();
  const slider = page.getByRole('slider', { name: /Stages per go/ });
  await expect(slider).toHaveValue('6');
  await expect(page.locator('#stage-count')).toHaveText('6 stages');
  await expect(page.locator('#stage-setting-help')).toHaveText('Six scratches finish one scene and earn one star.');
  await slider.focus();
  await page.keyboard.press('Home');
  await expect(slider).toHaveValue('1');
  await expect(page.locator('#stage-count')).toHaveText('1 stage');
  await page.keyboard.press('End');
  await expect(slider).toHaveValue('15');
  await expect(page.locator('#stage-count')).toHaveText('15 stages');
  expect(await page.evaluate(() => Boolean(document.getElementById('camera-preview').srcObject))).toBe(false);
});

test('eight completed scenes award eight stars, finish the go, and replay starts fresh', async ({ page }) => {
  await page.goto('/?debug=true&input=mouse&bonusRate=0&cameoRate=0&seed=go');
  await setStages(page, 8);
  await page.evaluate(() => window.__BLUE_DOG__.start());
  const midway = await finishScenes(page, 7);
  expect(midway.completedStages).toBe(7);
  expect(midway.stagesTarget).toBe(8);
  await expect(page.locator('#go-progress-label')).toHaveText('7 of 8 stars');
  await expect(page.locator('#go-complete-overlay')).toBeHidden();
  const finished = await finishScenes(page, 1);
  expect(finished.completedStages).toBe(8);
  expect(finished.debug.encounters).toBe(48);
  expect(finished.state).toBe('GO_COMPLETE');
  await expect(page.locator('#go-complete-overlay')).toBeVisible();
  await expect(page.locator('#go-complete-message')).toHaveText('You earned 8 stars!');
  await expect(page.locator('#play-again-button')).toBeFocused();
  await expect(page.locator('#hand-hint')).toBeHidden();
  await page.addStyleTag({ content: '#debug-panel, .layer-debug { display: none !important; }' });
  await page.screenshot({ path: 'artifacts/go-finished.png' });
  await setStages(page, 2);
  await page.locator('#play-again-button').click();
  await expect(page.locator('#go-complete-overlay')).toBeHidden();
  const next = await page.evaluate(() => window.__BLUE_DOG__.snapshot());
  expect(next.completedStages).toBe(0);
  expect(next.stagesTarget).toBe(2);
  expect(next.sceneNumber).toBe(1);
  expect(next.paws).toBe(0);
  expect(next.bonusHits).toBe(0);
});

test('setting changes apply to the next go, not the current turn', async ({ page }) => {
  await page.goto('/?debug=true&input=mouse&bonusRate=0&cameoRate=0');
  await setStages(page, 2);
  await page.evaluate(() => window.__BLUE_DOG__.start());
  await setStages(page, 1);
  const first = await finishScenes(page, 1);
  expect(first.stagesTarget).toBe(2);
  expect(first.completedStages).toBe(1);
  await expect(page.locator('#go-complete-overlay')).toBeHidden();
  await finishScenes(page, 1);
  await page.locator('#play-again-button').click();
  expect((await page.evaluate(() => window.__BLUE_DOG__.snapshot())).stagesTarget).toBe(1);
});

test('finishing releases both previews and replay reacquires the camera', async ({ page }) => {
  await page.goto('/?debug=true&bonusRate=0&cameoRate=0');
  await setStages(page, 1);
  await page.locator('#start-button').click();
  await expect(page.locator('#setup-title')).toHaveText('Show me your hand', { timeout: 60000 });
  await expect(page.locator('#hand-setup-preview')).toBeVisible();
  await page.evaluate(() => window.__BLUE_DOG__.start());
  await finishScenes(page, 1);
  await expect(page.locator('#go-complete-overlay')).toBeVisible();
  const released = await page.evaluate(() => ({
    running: window.__BLUE_DOG__.trackingStatus().running,
    camera: document.getElementById('camera-preview').srcObject,
    setup: document.getElementById('hand-setup-preview').srcObject,
  }));
  expect(released).toEqual({ running: false, camera: null, setup: null });
  await expect(page.locator('#resume-camera')).toBeHidden();
  await page.locator('#play-again-button').click();
  await expect(page.locator('#setup-title')).toHaveText('Show me your hand', { timeout: 60000 });
  expect(await page.evaluate(() => window.__BLUE_DOG__.trackingStatus().running)).toBe(true);
  expect((await page.evaluate(() => window.__BLUE_DOG__.snapshot())).completedStages).toBe(0);
  await page.locator('#settings-toggle').click();
  await page.locator('#stop-camera').click();
});
