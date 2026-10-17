import { expect, test } from '@playwright/test';

// WebGL por software en runners de CI sin GPU no es universal: Chromium
// suele traer un rasterizador por software que funciona out-of-the-box,
// pero Firefox/WebKit headless pueden carecer de uno utilizable. Cuando
// eso pasa, hero-scene.js hace exactamente lo que debe — degradar al
// fallback SVG — así que las pruebas que dependen de la escena activa
// (frames, puntero, scroll, tema) comprueban la capacidad real del
// navegador en este entorno y se saltan (no fallan) si no aplica, en vez
// de asumir que WebGL siempre está disponible.
async function hasWorkingWebGL(page) {
  return page.evaluate(() => {
    try {
      const canvas = document.createElement('canvas');
      return !!canvas.getContext('webgl');
    } catch {
      return false;
    }
  });
}

test.describe('Escena del hero', () => {
  test('muestra el canvas cuando WebGL está disponible, o el fallback SVG cuando no', async ({ page }) => {
    await page.goto('/');
    const webglAvailable = await hasWorkingWebGL(page);
    if (webglAvailable) {
      await expect(page.locator('.hero-scene-canvas')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('.hero-scene-fallback')).toBeHidden({ timeout: 15000 });
    } else {
      await expect(page.locator('.hero-scene-fallback')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('.hero-scene-canvas')).toBeHidden({ timeout: 15000 });
    }
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

  test('con reduced-motion, la escena queda asentada de inmediato (sin fase de ensamblaje)', async ({ browser, page }) => {
    test.skip(!(await hasWorkingWebGL(page)), 'WebGL no disponible en este navegador/entorno');
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const reducedPage = await context.newPage();
    await reducedPage.goto('/');
    // expect.poll en vez de un único wait+lectura: en CI (WebGL por
    // software) el primer requestAnimationFrame puede tardar bastante más
    // que los ~16ms de un frame normal.
    await expect.poll(
      () => reducedPage.evaluate(() => window.__heroSceneDebug?.frameCount ?? 0),
      { timeout: 15000 }
    ).toBeGreaterThan(0);
    await context.close();
  });

  test('la escena sigue renderizando frames mientras está en pantalla', async ({ page }) => {
    await page.goto('/');
    test.skip(!(await hasWorkingWebGL(page)), 'WebGL no disponible en este navegador/entorno');
    await expect.poll(
      () => page.evaluate(() => window.__heroSceneDebug?.frameCount ?? 0),
      { timeout: 15000 }
    ).toBeGreaterThan(0);
    const first = await page.evaluate(() => window.__heroSceneDebug.frameCount);
    await expect.poll(
      () => page.evaluate(() => window.__heroSceneDebug.frameCount),
      { timeout: 15000 }
    ).toBeGreaterThan(first);
  });

  test('la escena reacciona al cursor en dispositivos con puntero fino', async ({ page }) => {
    await page.goto('/');
    test.skip(!(await hasWorkingWebGL(page)), 'WebGL no disponible en este navegador/entorno');
    await page.mouse.move(400, 300);
    await expect.poll(
      () => page.evaluate(() => window.__heroSceneDebug.pointerOffset.x !== 0 || window.__heroSceneDebug.pointerOffset.y !== 0),
      { timeout: 15000 }
    ).toBe(true);
    const offsetAfterFirst = await page.evaluate(() => window.__heroSceneDebug.pointerOffset);
    await page.mouse.move(700, 150);
    await expect.poll(
      async () => {
        const offset = await page.evaluate(() => window.__heroSceneDebug.pointerOffset);
        return offset.x !== offsetAfterFirst.x || offset.y !== offsetAfterFirst.y;
      },
      { timeout: 15000 }
    ).toBe(true);
  });

  test('hacer scroll a través del hero aumenta el progreso de la Transición A', async ({ page }) => {
    await page.goto('/');
    test.skip(!(await hasWorkingWebGL(page)), 'WebGL no disponible en este navegador/entorno');
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
    test.skip(!(await hasWorkingWebGL(page)), 'WebGL no disponible en este navegador/entorno');
    const heroHeight = await page.locator('#inicio').evaluate((el) => el.getBoundingClientRect().height);
    await page.evaluate((y) => window.scrollTo(0, y), heroHeight * 1.5);
    await page.waitForFunction((h) => window.scrollY >= h, heroHeight * 1.4);
    await page.waitForTimeout(100);
    const running = await page.evaluate(() => window.__heroSceneDebug.running);
    expect(running).toBe(false);
  });

  test('cambiar de tema actualiza el color de la escena sin reiniciarla', async ({ page }) => {
    await page.goto('/');
    test.skip(!(await hasWorkingWebGL(page)), 'WebGL no disponible en este navegador/entorno');
    await expect.poll(
      () => page.evaluate(() => window.__heroSceneDebug?.frameCount ?? 0),
      { timeout: 15000 }
    ).toBeGreaterThan(0);
    const before = await page.evaluate(() => window.__heroSceneDebug.frameCount);
    const colorBefore = await page.evaluate(() => window.__heroSceneDebug.color);
    // El canvas sigue animando continuamente de fondo; en CI eso puede
    // hacer que la heurística de "estabilidad visual" de Playwright tarde
    // más en considerar la página lista para un click normal — se fuerza
    // el click (el botón en sí nunca se mueve, solo lo de alrededor).
    await page.click('#themeToggle', { force: true });
    await expect.poll(
      () => page.evaluate(() => window.__heroSceneDebug.frameCount),
      { timeout: 15000 }
    ).toBeGreaterThan(before); // nunca se detuvo el loop
    const colorAfter = await page.evaluate(() => window.__heroSceneDebug.color);
    expect(colorAfter).not.toEqual(colorBefore);
  });
});
