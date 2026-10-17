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

// Para las pruebas que dependen de que el render siga avanzando (no solo
// de que exista un contexto): medir en tiempo de ejecución si el
// navegador "puede" sostener un segundo frame y saltar si no, hace que
// una regresión real (el loop muere tras el primer frame) se vea
// idéntica a "este entorno es lento" — se saltaría en silencio en los 3
// navegadores en vez de fallar. En su lugar, Chromium SIEMPRE corre la
// aserción completa, también en CI: trae un rasterizador por software
// confiable out-of-the-box, así que una regresión real sigue fallando
// ahí de forma determinística. Solo Firefox/WebKit se saltan, y solo en
// CI (confirmado: WebKit headless sin GPU varió de 0 a >15s para un
// segundo frame entre corridas de CI con el mismo código — no así
// localmente, donde hay GPU real).
function requiresSkipForSustainedRendering(browserName) {
  return browserName !== 'chromium' && !!process.env.CI;
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

  test('si se pierde el contexto WebGL en caliente, degrada al fallback en vez de quedar en blanco', async ({ page }) => {
    await page.goto('/');
    test.skip(!(await hasWorkingWebGL(page)), 'WebGL no disponible en este navegador/entorno');
    // Pérdida de contexto real (no simulada por mock) vía la extensión
    // estándar WEBGL_lose_context — frecuente en móviles al volver de
    // una pestaña en segundo plano.
    const lostContext = await page.evaluate(() => {
      const canvas = document.querySelector('.hero-scene-canvas');
      const gl = canvas.getContext('webgl');
      const ext = gl.getExtension('WEBGL_lose_context');
      if (!ext) return false;
      ext.loseContext();
      return true;
    });
    test.skip(!lostContext, 'WEBGL_lose_context no disponible en este navegador');

    await expect(page.locator('.hero-scene-fallback')).toBeVisible();
    await expect(page.locator('.hero-scene-canvas')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__heroSceneDebug.running)).toBe(false);
  });

  test('el fallback SVG es realmente visible: tamaño razonable y no tapado por el code-window', async ({ page }) => {
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = function (type) {
        if (type === 'webgl') return null;
        return null;
      };
    });
    await page.goto('/');
    const fallback = page.locator('.hero-scene-fallback');
    await expect(fallback).toBeVisible();

    const box = await fallback.boundingBox();
    expect(box.width).toBeGreaterThan(100); // no un fragmento diminuto

    // .hero-scene tiene pointer-events:none (correcto: es decorativo), así
    // que document.elementFromPoint() no sirve para verificar el orden de
    // pintado — el hit-testing lo atraviesa aunque pinte encima. La
    // comprobación real es el z-index calculado: el contenedor debe subir
    // por encima de .code-window (z-index:2) cuando el canvas está oculto.
    const zIndexes = await page.evaluate(() => ({
      scene: Number(getComputedStyle(document.querySelector('.hero-scene')).zIndex),
      codeWindow: Number(getComputedStyle(document.querySelector('.code-window')).zIndex),
    }));
    expect(zIndexes.scene).toBeGreaterThan(zIndexes.codeWindow);
  });

  test('sin WebGL, la Transición A igual mueve la escena por scroll (solo CSS)', async ({ page }) => {
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = function (type) {
        if (type === 'webgl') return null;
        return null;
      };
    });
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

  test('con reduced-motion, la Transición A es de baja amplitud (no el movimiento de cámara completo)', async ({ browser }) => {
    const normalContext = await browser.newContext();
    const normalPage = await normalContext.newPage();
    await normalPage.goto('/');
    const heroHeight = await normalPage.locator('#inicio').evaluate((el) => el.getBoundingClientRect().height);
    await normalPage.evaluate((y) => window.scrollTo(0, y), heroHeight * 0.6);
    await normalPage.waitForFunction(() => window.scrollY > 0);
    await expect.poll(async () =>
      Number(await normalPage.locator('#inicio').getAttribute('data-transition-progress'))
    ).toBeGreaterThan(0.3);
    // Poll sobre el opacity calculado en sí, no solo sobre el atributo: el
    // recálculo de estilo para el calc() de opacity puede ir un paso por
    // detrás de cuándo el atributo/custom property ya se setearon
    // (confirmado: una sola lectura inmediata tras el poll del atributo
    // era intermitente en WebKit — a veces opacity seguía leyendo 1).
    await expect.poll(
      () => normalPage.locator('.hero-scene').evaluate((el) => Number(getComputedStyle(el).opacity))
    ).toBeLessThan(0.9);
    const normalOpacity = await normalPage.locator('.hero-scene').evaluate((el) => Number(getComputedStyle(el).opacity));
    const normalProgress = Number(await normalPage.locator('#inicio').getAttribute('data-transition-progress'));
    await normalContext.close();

    const reducedContext = await browser.newContext({ reducedMotion: 'reduce' });
    const reducedPage = await reducedContext.newPage();
    await reducedPage.goto('/');
    await reducedPage.evaluate((y) => window.scrollTo(0, y), heroHeight * 0.6);
    await reducedPage.waitForFunction(() => window.scrollY > 0);
    await expect.poll(async () =>
      Number(await reducedPage.locator('#inicio').getAttribute('data-transition-progress'))
    ).toBeGreaterThan(0.3);
    // Con reduced-motion el fade es de baja amplitud a propósito — puede
    // no cruzar 0.9, así que solo se confirma que haya CAMBIADO de 1 (no
    // un umbral fijo), antes de leer el valor final para comparar.
    await expect.poll(
      () => reducedPage.locator('.hero-scene').evaluate((el) => Number(getComputedStyle(el).opacity))
    ).toBeLessThan(1);
    const reducedOpacity = await reducedPage.locator('.hero-scene').evaluate((el) => Number(getComputedStyle(el).opacity));
    const reducedProgress = Number(await reducedPage.locator('#inicio').getAttribute('data-transition-progress'));
    await reducedContext.close();

    // La amplitud del fade debe ser claramente menor con reduced-motion —
    // no "sin transición" (sigue atada al scroll), sino de baja amplitud.
    // Normalizado por el progreso real alcanzado en cada página (no
    // necesariamente idéntico entre dos instancias/contextos distintos,
    // incluso con el mismo scroll en px — confirmado intermitente en CI
    // sin esta normalización), para comparar el COEFICIENTE de fade
    // (opacity perdido por unidad de progreso) y no el fade crudo.
    const normalFadeRatio = (1 - normalOpacity) / normalProgress;
    const reducedFadeRatio = (1 - reducedOpacity) / reducedProgress;
    expect(reducedFadeRatio).toBeLessThan(normalFadeRatio * 0.6);
  });

  test('un scroll durante la secuencia de entrada la corta al estado final', async ({ page, browserName }) => {
    await page.goto('/');
    test.skip(!(await hasWorkingWebGL(page)), 'WebGL no disponible en este navegador/entorno');
    test.skip(requiresSkipForSustainedRendering(browserName), 'Firefox/WebKit en CI: render por software no confiable para esto; Chromium cubre la aserción determinística');
    // Antes de que termine la animación de ensamblaje (~1.6s) — interrumpe.
    await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
    await expect.poll(
      () => page.evaluate(() => window.__heroSceneDebug?.introSkipped ?? false)
    ).toBe(true);
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

  test('la escena sigue renderizando frames mientras está en pantalla', async ({ page, browserName }) => {
    test.setTimeout(60000);
    await page.goto('/');
    test.skip(!(await hasWorkingWebGL(page)), 'WebGL no disponible en este navegador/entorno');
    test.skip(requiresSkipForSustainedRendering(browserName), 'Firefox/WebKit en CI: render por software no confiable para esto; Chromium cubre la aserción determinística');
    await expect.poll(
      () => page.evaluate(() => window.__heroSceneDebug?.frameCount ?? 0),
      { timeout: 25000 }
    ).toBeGreaterThan(0);
    const first = await page.evaluate(() => window.__heroSceneDebug.frameCount);
    await expect.poll(
      () => page.evaluate(() => window.__heroSceneDebug.frameCount),
      { timeout: 25000 }
    ).toBeGreaterThan(first);
  });

  test('la escena reacciona al cursor en dispositivos con puntero fino', async ({ page }) => {
    // pointerOffset lo escribe un listener de pointermove síncrono — no
    // depende de que el render loop produzca un segundo frame, así que
    // (a diferencia de los tests de frames/tema) solo necesita que WebGL
    // exista, no una medición de progresión sostenida.
    await page.goto('/');
    test.skip(!(await hasWorkingWebGL(page)), 'WebGL no disponible en este navegador/entorno');
    await page.mouse.move(400, 300);
    await expect.poll(
      () => page.evaluate(() => window.__heroSceneDebug.pointerOffset.x !== 0 || window.__heroSceneDebug.pointerOffset.y !== 0),
      { timeout: 25000 }
    ).toBe(true);
    const offsetAfterFirst = await page.evaluate(() => window.__heroSceneDebug.pointerOffset);
    await page.mouse.move(700, 150);
    await expect.poll(
      async () => {
        const offset = await page.evaluate(() => window.__heroSceneDebug.pointerOffset);
        return offset.x !== offsetAfterFirst.x || offset.y !== offsetAfterFirst.y;
      },
      { timeout: 25000 }
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

  test('pausar y reanudar repetidamente no duplica el loop de render', async ({ page, browserName }) => {
    test.setTimeout(60000);
    await page.goto('/');
    test.skip(!(await hasWorkingWebGL(page)), 'WebGL no disponible en este navegador/entorno');
    test.skip(requiresSkipForSustainedRendering(browserName), 'Firefox/WebKit en CI: render por software no confiable para esto; Chromium cubre la aserción determinística');
    await expect.poll(
      () => page.evaluate(() => window.__heroSceneDebug?.frameCount ?? 0),
      { timeout: 25000 }
    ).toBeGreaterThan(0);

    const measureRate = () => page.evaluate(() => new Promise((resolve) => {
      const start = window.__heroSceneDebug.frameCount;
      setTimeout(() => resolve(window.__heroSceneDebug.frameCount - start), 300);
    }));

    const baseline = await measureRate();

    // pause()/resume() en el mismo tick, varias veces: si pause() no
    // cancela el requestAnimationFrame ya agendado, cada resume() arranca
    // una cadena nueva mientras la anterior sigue viva — el frame rate se
    // multiplica en vez de mantenerse.
    await page.evaluate(() => {
      for (let i = 0; i < 5; i += 1) {
        window.AuraHeroScene.pause();
        window.AuraHeroScene.resume();
      }
    });

    const afterChurn = await measureRate();

    // Margen generoso (2x) para absorber ruido real de timing — el bug
    // medía ~5x, muy por encima de cualquier varianza normal.
    expect(afterChurn).toBeLessThan(baseline * 2 + 5);
  });

  test('cambiar de tema actualiza el color de la escena sin reiniciarla', async ({ page, browserName }) => {
    test.setTimeout(60000);
    await page.goto('/');
    test.skip(!(await hasWorkingWebGL(page)), 'WebGL no disponible en este navegador/entorno');
    test.skip(requiresSkipForSustainedRendering(browserName), 'Firefox/WebKit en CI: render por software no confiable para esto; Chromium cubre la aserción determinística');
    await expect.poll(
      () => page.evaluate(() => window.__heroSceneDebug?.frameCount ?? 0),
      { timeout: 25000 }
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
