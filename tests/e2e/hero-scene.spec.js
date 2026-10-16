import { expect, test } from '@playwright/test';

test.describe('Escena del hero', () => {
  test('muestra el canvas WebGL cuando está disponible y oculta el fallback', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.hero-scene-canvas')).toBeVisible();
    await expect(page.locator('.hero-scene-fallback')).toBeHidden();
  });

  test('degrada al fallback SVG sin errores de consola cuando WebGL no está disponible', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = function (type) {
        if (type === 'webgl') return null;
        return null;
      };
    });
    await page.goto('/');
    await expect(page.locator('.hero-scene-fallback')).toBeVisible();
    await expect(page.locator('.hero-scene-canvas')).toBeHidden();
    expect(consoleErrors).toEqual([]);
  });
});
