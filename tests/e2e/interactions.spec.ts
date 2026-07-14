import { test, expect } from '@playwright/test';

/**
 * Interaction-level e2e over the merge board — the game's core verbs and its
 * highest-churn UI, which the unit suite (pure logic only) can't reach. Drives
 * the real production bundle in a browser: spawn, tap-to-merge, and navigation.
 */
const SAVE_KEY = 'hearth:save';

test.describe('Hearth board interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Start from a clean slate so the seeded opening board is deterministic.
    await page.evaluate((k) => localStorage.removeItem(k), SAVE_KEY);
    await page.reload();
    await expect(page.locator('#hud-energy')).toBeVisible();
    // Clear the two things that greet a fresh save and intercept clicks: the FTUE
    // coach-marks (shown first), then the sunrise "New Day" modal (shown after).
    const ftue = page.locator('#ftue-overlay');
    await ftue.waitFor({ state: 'visible', timeout: 3000 }).catch(() => undefined);
    if (await ftue.isVisible().catch(() => false)) {
      await page.locator('#ftue-skip').click();
      await ftue.waitFor({ state: 'hidden' });
    }
    const newday = page.locator('#newday-modal');
    await newday.waitFor({ state: 'visible', timeout: 4000 }).catch(() => undefined);
    if (await newday.isVisible().catch(() => false)) {
      await page.locator('#newday-claim').click();
      await newday.waitFor({ state: 'hidden' });
    }
    await page.locator('.nav-btn[data-screen="create"]').click();
    await expect(page.locator('#screen-create')).toBeVisible();
  });

  const tileCount = (page: import('@playwright/test').Page) => page.locator('#board .cell img').count();

  test('tapping the crate spawns a piece and spends one energy', async ({ page }) => {
    const energy = page.locator('#hud-energy');
    const before = Number((await energy.textContent())?.trim() || '0');
    const tilesBefore = await tileCount(page);
    await page.locator('#board .cell[data-index="21"]').click(); // the producer crate
    await expect.poll(() => tileCount(page)).toBe(tilesBefore + 1);
    expect(Number((await energy.textContent())?.trim() || '0')).toBe(before - 1);
  });

  test('tapping two matching pieces merges them (tap-to-merge, no drag)', async ({ page }) => {
    // freshState seeds two adjacent wood saplings at cells 8 and 9.
    const tilesBefore = await tileCount(page);
    await page.locator('#board .cell[data-index="8"]').click();
    await page.locator('#board .cell[data-index="9"]').click();
    // A merge turns two tiles into one higher-level tile — a net −1.
    await expect.poll(() => tileCount(page)).toBe(tilesBefore - 1);
  });

  test('the bottom nav switches primary screens', async ({ page }) => {
    await page.locator('.nav-btn[data-screen="villagers"]').click();
    await expect(page.locator('#screen-villagers')).toHaveClass(/active/);
    await page.locator('.nav-btn[data-screen="home"]').click();
    await expect(page.locator('#map-canvas')).toBeVisible();
  });
});
