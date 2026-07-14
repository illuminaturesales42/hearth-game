import { test, expect } from '@playwright/test';

// The one localStorage key the whole save lives under (src/core/save.ts).
const SAVE_KEY = 'hearth:save';

test.describe('Hearth smoke', () => {
  test('boots, renders the town, and logs no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');

    // The shell mounts and the splash lifts, revealing the app + the town canvas.
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#map-canvas')).toBeVisible();
    await expect(page.locator('#hud-energy')).toBeVisible();

    expect(errors, `unexpected console errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('a saved day survives a reload (zero save-loss)', async ({ page }) => {
    await page.goto('/');

    // Start from a clean slate, then reboot into a fresh game.
    await page.evaluate((k) => localStorage.removeItem(k), SAVE_KEY);
    await page.reload();
    await expect(page.locator('#hud-energy')).toBeVisible();

    // Dismiss the FTUE coach-marks, then welcome the sunrise "New Day" — a real,
    // persisted energy grant (no dev-only helpers, which the prod build strips).
    const ftue = page.locator('#ftue-overlay');
    await ftue.waitFor({ state: 'visible', timeout: 3000 }).catch(() => undefined);
    if (await ftue.isVisible().catch(() => false)) {
      await page.locator('#ftue-skip').click();
      await ftue.waitFor({ state: 'hidden' });
    }
    const newday = page.locator('#newday-modal');
    await newday.waitFor({ state: 'visible', timeout: 4000 });
    await page.locator('#newday-claim').click();
    await newday.waitFor({ state: 'hidden' });

    // Let the state settle and the autosave flush.
    await page.waitForTimeout(400);
    const energyBefore = await page.locator('#hud-energy').textContent();

    // A save must actually exist on disk before we test that it reloads.
    const saved = await page.evaluate((k) => localStorage.getItem(k)?.length ?? 0, SAVE_KEY);
    expect(saved).toBeGreaterThan(0);

    // Reload: the same energy must come back from the save, not reset to zero.
    await page.reload();
    await expect(page.locator('#hud-energy')).toHaveText(energyBefore ?? '');
  });
});
