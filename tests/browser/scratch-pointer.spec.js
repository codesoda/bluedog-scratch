import { test, expect } from '@playwright/test';

async function manualStart(page) {
  await page.goto('/?debug=true&input=mouse&seed=browser&bonusRate=0&cameoRate=0');
  await page.waitForFunction(() => Boolean(window.__BLUE_DOG__));
  await page.evaluate(() => {
    const api = window.__BLUE_DOG__;
    api.start();
    api.setPointers([{ id: 'test', x: 0.98, y: 0.98, active: true, sampleId: 1 }]);
    for (let i = 0; i < 20; i++) api.step(100);
  });
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

function readPointer(page) {
  return page.evaluate(() => {
    const g = document.querySelector('.paw-pointer');
    if (!g) return null;
    const hand = g.querySelector('.scratch-hand-rig');
    const prompt = g.querySelector('.scratch-hand-prompt');
    const paw = g.querySelector('.paw');
    const ring = g.querySelector('.pointer-ring');
    const handRoot = g.querySelector('.scratch-hand');
    const gT = g.getAttribute('transform') || '';
    const handT = handRoot ? handRoot.getAttribute('transform') || '' : '';
    const parse = (t) => {
      const m = /translate\(([-\d.]+)\s+([-\d.]+)\)/.exec(t);
      return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
    };
    const base = parse(gT);
    const handOffset = parse(handT);
    const visible = (node) => Boolean(node) && node.getAttribute('display') !== 'none';
    return {
      groupVisible: visible(g),
      handVisible: visible(hand),
      promptVisible: visible(prompt),
      pawVisible: visible(paw),
      ringVisible: visible(ring),
      absoluteHandX: base.x + handOffset.x,
      absoluteHandY: base.y + handOffset.y,
      openness: handRoot ? Number(handRoot.getAttribute('data-openness')) : null,
    };
  });
}

async function moveTo(page, x, y, sampleId) {
  return page.evaluate(({ x, y, sampleId }) => {
    window.__BLUE_DOG__.setPointers([{ id: 'test', x, y, active: true, sampleId }]);
    window.__BLUE_DOG__.step(50);
  }, { x, y, sampleId });
}

// Anchors then performs a real (above-gate) wiggle hop inside the scratch
// rect, enough to flip REVEALED -> SCRATCHING, mirroring game.spec.js's
// scratch() helper.
async function wiggleIntoScratch(page, rect, sampleIdStart = 9000) {
  await moveTo(page, rect.x - 0.025, rect.y, sampleIdStart);
  await moveTo(page, rect.x + 0.025, rect.y, sampleIdStart + 1);
  return page.evaluate(() => window.__BLUE_DOG__.snapshot());
}

test('centered hand appears over the scratch target while scratching', async ({ page }) => {
  await manualStart(page);
  const found = await reveal(page);
  expect(found.state).toBe('REVEALED');
  const rect = found.dog.scratchRect;
  const snap = await wiggleIntoScratch(page, rect, 9000);
  expect(snap.state).toBe('SCRATCHING');
  const info = await readPointer(page);
  expect(info.handVisible).toBe(true);
  expect(info.pawVisible).toBe(false);
  expect(info.ringVisible).toBe(false);
  expect(info.promptVisible).toBe(true);
  expect(info.absoluteHandX).toBeCloseTo(snap.dog.x * 1600, 0);
  expect(info.absoluteHandY).toBeCloseTo(snap.dog.y * 900, 0);
  await page.addStyleTag({ content: '#debug-panel, .layer-debug { display: none !important; }' });
  await page.screenshot({ path: 'artifacts/scratch-hand.png' });
});

test('hand disappears and paw returns once the pointer leaves the scratch target', async ({ page }) => {
  await manualStart(page);
  const found = await reveal(page);
  const rect = found.dog.scratchRect;
  await wiggleIntoScratch(page, rect, 9100);
  const withHand = await readPointer(page);
  expect(withHand.handVisible).toBe(true);

  await moveTo(page, 0.02, 0.02, 9102);
  const away = await readPointer(page);
  expect(away.handVisible).toBe(false);
  expect(away.promptVisible).toBe(false);
  expect(away.pawVisible).toBe(true);
  expect(away.ringVisible).toBe(true);

  await page.evaluate(() => window.__BLUE_DOG__.setPointers([]));
  await page.evaluate(() => window.__BLUE_DOG__.step(100));
  const absent = await readPointer(page);
  expect(absent.groupVisible).toBe(false);
  expect(absent.handVisible).toBe(false);
});

test('static pointer and sub-gate jitter never complete a scratch nor hold the hand open', async ({ page }) => {
  await manualStart(page);
  const found = await reveal(page);
  const rect = found.dog.scratchRect;
  const opennessSamples = [];
  await moveTo(page, rect.x, rect.y, 20000);
  for (let i = 0; i < 60; i++) {
    await moveTo(page, rect.x + (i % 2 ? 0.001 : -0.001), rect.y, 20001 + i);
    const info = await readPointer(page);
    opennessSamples.push(info.openness);
  }
  const result = await page.evaluate(() => window.__BLUE_DOG__.snapshot());
  expect(result.paws).toBe(0);
  expect(result.dog.progress).toBe(0);
  // jitter alone must not swing the hand fully open/closed every sample
  const swings = opennessSamples.filter((v, i) => i > 0 && Math.abs(v - opennessSamples[i - 1]) > 0.5).length;
  expect(swings).toBe(0);
});

test('reduced motion keeps a static hand and prompt visible during scratching', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await manualStart(page);
  const found = await reveal(page);
  const rect = found.dog.scratchRect;
  await wiggleIntoScratch(page, rect, 30000);
  const info = await readPointer(page);
  expect(info.handVisible).toBe(true);
  expect(info.promptVisible).toBe(true);
  expect(info.openness).toBeCloseTo(0.5, 2);
});
