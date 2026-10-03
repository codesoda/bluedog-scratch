import { test, expect } from '@playwright/test';

test.use({
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
});

test('startup illustrates an upright index finger and the same paw-in-circle pointer as play', async ({ page }) => {
  await page.goto('/');
  const guide = page.getByRole('img', { name: /index finger pointing up to the sky/ });
  await expect(guide).toBeVisible();
  await expect(page.locator('#setup-message')).toContainText('Point your index finger up to the sky');
  await expect(page.locator('#pointer-instructions')).toHaveText('The paw in the circle is your pointer.Move your finger to move the paw.');
  expect(await guide.locator('.hand-guide-hand path').count()).toBeGreaterThan(2);
  await expect(guide.locator('.hand-guide-ring')).toHaveAttribute('r', '40');
  await expect(guide.locator('.paw')).toHaveAttribute('transform', 'translate(0 2) scale(0.6)');
  expect(await guide.locator('.paw ellipse').count()).toBe(4);
  await expect(page.locator('#camera-preview')).toBeHidden();
  await page.screenshot({ path: 'artifacts/hand-guide-start.png' });
});

test('finding the hand keeps the picture and pointer explanation visible', async ({ page }) => {
  await page.goto('/');
  await page.locator('#start-button').click();
  await expect(page.locator('#setup-title')).toHaveText('Show me your hand', { timeout: 60000 });
  await expect(page.locator('#setup-message')).toContainText('Point your index finger up to the sky');
  await expect(page.locator('#hand-guide')).toBeVisible();
  await expect(page.locator('#pointer-instructions')).toBeVisible();
  await expect(page.locator('#pointer-instructions')).toContainText('paw in the circle is your pointer');
  await expect(page.locator('#countdown')).toBeHidden();
  await page.screenshot({ path: 'artifacts/hand-guide-waiting.png' });
  await page.locator('#settings-toggle').click();
  await page.locator('#stop-camera').click();
});

for (const viewport of [{ width: 390, height: 740 }, { width: 900, height: 500 }]) {
  test(`hand guide remains available at ${viewport.width} × ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const guide = page.locator('#hand-guide');
    await expect(guide).toBeVisible();
    const box = await guide.boundingBox();
    expect(box.width).toBeGreaterThan(150);
    expect(box.height).toBeGreaterThanOrEqual(100);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    await page.locator('#start-button').scrollIntoViewIfNeeded();
    await expect(page.locator('#start-button')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
