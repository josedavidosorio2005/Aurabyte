import { test, expect } from '@playwright/test';

test.describe('Transición B — decisión de mejora', () => {
  test('en viewport de escritorio sin reduced-motion, la sección se mejora a riel', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.__servicesSceneDebug?.enhanced)).toBe(true);
    await expect(page.locator('#servicios')).toHaveAttribute('data-scene', 'rail');
  });

  test('en viewport móvil, la sección NO se mejora', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.__servicesSceneDebug?.enhanced)).toBe(false);
    await expect(page.locator('#servicios')).not.toHaveAttribute('data-scene', 'rail');
  });

  test('con prefers-reduced-motion, la sección NO se mejora aunque el viewport sea de escritorio', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.__servicesSceneDebug?.enhanced)).toBe(false);
  });

  test('redimensionar en vivo de escritorio a móvil revierte la mejora', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.__servicesSceneDebug?.enhanced)).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await expect.poll(() => page.evaluate(() => window.__servicesSceneDebug?.enhanced)).toBe(false);
    await expect(page.locator('.service-panel')).toHaveCount(8);
  });
});
