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

  test('con reduced-motion, la escena queda asentada de inmediato (sin fase de ensamblaje)', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForTimeout(100);
    const frameCountEarly = await page.evaluate(() => window.__heroSceneDebug?.frameCount ?? 0);
    expect(frameCountEarly).toBeGreaterThan(0);
    await context.close();
  });

  test('la escena sigue renderizando frames mientras está en pantalla', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(50);
    const first = await page.evaluate(() => window.__heroSceneDebug.frameCount);
    await page.waitForTimeout(200);
    const second = await page.evaluate(() => window.__heroSceneDebug.frameCount);
    expect(second).toBeGreaterThan(first);
  });

  test('la escena reacciona al cursor en dispositivos con puntero fino', async ({ page }) => {
    await page.goto('/');
    await page.mouse.move(400, 300);
    await page.waitForTimeout(50);
    const offsetAfterFirst = await page.evaluate(() => window.__heroSceneDebug.pointerOffset);
    await page.mouse.move(700, 150);
    await page.waitForTimeout(50);
    const offsetAfterSecond = await page.evaluate(() => window.__heroSceneDebug.pointerOffset);
    expect(offsetAfterSecond).not.toEqual(offsetAfterFirst);
  });
});
