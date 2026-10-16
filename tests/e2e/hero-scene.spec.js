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

  test('hacer scroll a través del hero aumenta el progreso de la Transición A', async ({ page }) => {
    await page.goto('/');
    const initial = await page.locator('#inicio').getAttribute('data-transition-progress');
    expect(Number(initial)).toBe(0);
    const heroHeight = await page.locator('#inicio').evaluate((el) => el.getBoundingClientRect().height);
    await page.evaluate((y) => window.scrollTo(0, y), heroHeight * 0.6);
    await page.waitForFunction(() => window.scrollY > 0);
    await expect.poll(async () =>
      Number(await page.locator('#inicio').getAttribute('data-transition-progress'))
    ).toBeGreaterThan(0.3);
  });

  test('al pasar completamente el hero, el loop de render queda en pausa', async ({ page }) => {
    await page.goto('/');
    const heroHeight = await page.locator('#inicio').evaluate((el) => el.getBoundingClientRect().height);
    await page.evaluate((y) => window.scrollTo(0, y), heroHeight * 1.5);
    await page.waitForFunction((h) => window.scrollY >= h, heroHeight * 1.4);
    await page.waitForTimeout(100);
    const running = await page.evaluate(() => window.__heroSceneDebug.running);
    expect(running).toBe(false);
  });

  test('cambiar de tema actualiza el color de la escena sin reiniciarla', async ({ page }) => {
    await page.goto('/');
    const before = await page.evaluate(() => window.__heroSceneDebug.frameCount);
    const colorBefore = await page.evaluate(() => window.__heroSceneDebug.color);
    await page.click('#themeToggle');
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => window.__heroSceneDebug.frameCount);
    const colorAfter = await page.evaluate(() => window.__heroSceneDebug.color);
    expect(after).toBeGreaterThan(before); // nunca se detuvo el loop
    expect(colorAfter).not.toEqual(colorBefore);
  });
});
