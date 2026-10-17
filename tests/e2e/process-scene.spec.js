import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Misma limitación conocida que services-scene.spec.js (ver CLAUDE.md,
// "Pruebas intermitentes" y el comentario original en ese archivo): WebKit
// en CI (Linux, headless, sin compositor de escritorio) no dispara de forma
// confiable los eventos sintéticos 'scroll'/'resize' de los que depende este
// motor. Chromium/Firefox sí, en CI y en local.
function requiresSkipForSyntheticScrollEvents(browserName) {
  return browserName === 'webkit' && !!process.env.CI;
}

async function scrollToProcessProgress(page, fraction) {
  await page.evaluate((frac) => {
    const scrubber = document.querySelector('.process-scrubber');
    if (!scrubber) return;
    const rect = scrubber.getBoundingClientRect();
    const docTop = window.scrollY + rect.top;
    const range = rect.height - window.innerHeight;
    // 'instant', no 'auto': ver la misma nota en services-scene.spec.js —
    // 'auto' respeta scroll-behavior:smooth (styles.css) y una espera corta
    // solo capturaría un punto a mitad de la animación.
    window.scrollTo({ top: docTop + frac * range, behavior: 'instant' });
  }, fraction);
}

function readStageFloat(page) {
  return page.evaluate(() => window.__processSceneDebug?.stageFloat);
}

test.describe('Transición C — decisión de mejora', () => {
  test('en escritorio sin reduced-motion, la sección se mejora a escena de canvas', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.__processSceneDebug?.enhanced)).toBe(true);
    await expect(page.locator('#proceso')).toHaveAttribute('data-scene', 'canvas');
    await expect(page.locator('.process-canvas')).toBeVisible();
  });

  test('en viewport móvil, la sección NO se mejora — se queda como tarjetas planas', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.__processSceneDebug?.enhanced)).toBe(false);
    await expect(page.locator('#proceso')).not.toHaveAttribute('data-scene', 'canvas');
    await expect(page.locator('.process-stage')).toHaveCount(4);
  });

  test('con prefers-reduced-motion, la sección NO se mejora aunque el viewport sea de escritorio', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.__processSceneDebug?.enhanced)).toBe(false);
    await expect(page.locator('.process-stage')).toHaveCount(4);
  });

  test('redimensionar en vivo de escritorio a móvil revierte la mejora', async ({ page, browserName }) => {
    test.skip(requiresSkipForSyntheticScrollEvents(browserName), 'WebKit en CI: matchMedia(change) tras setViewportSize no reacciona de forma confiable; Chromium/Firefox cubren la aserción real');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.__processSceneDebug?.enhanced)).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await expect.poll(() => page.evaluate(() => window.__processSceneDebug?.enhanced)).toBe(false);
    await expect(page.locator('.process-stage')).toHaveCount(4);
  });
});

test.describe('Transición C — las 4 etapas y el recorrido de scroll', () => {
  test('las 4 etapas se reconocen por su título en los 4 puntos del recorrido', async ({ page, browserName }) => {
    test.skip(requiresSkipForSyntheticScrollEvents(browserName), 'WebKit en CI: scroll sintético no dispara el motor de forma confiable; Chromium/Firefox cubren la aserción real');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.__processSceneDebug?.enhanced)).toBe(true);

    const expectedHeadings = [
      'Escuchamos tu idea',
      'Diseñamos la experiencia',
      'Construimos la solución',
      'Entregamos tu software',
    ];

    for (let stage = 0; stage < 4; stage += 1) {
      await scrollToProcessProgress(page, stage / 3);
      await expect.poll(() => readStageFloat(page), `etapa ${stage}`).toBeCloseTo(stage, 1);
      const visibleHeading = page.locator('.process-stage h3:visible');
      await expect(visibleHeading).toHaveText(expectedHeadings[stage]);
    }
  });

  test('scroll hacia adelante y luego hacia atrás reproduce los mismos estados en reversa', async ({ page, browserName }) => {
    test.skip(requiresSkipForSyntheticScrollEvents(browserName), 'WebKit en CI: scroll sintético no dispara el motor de forma confiable; Chromium/Firefox cubren la aserción real');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.__processSceneDebug?.enhanced)).toBe(true);

    await scrollToProcessProgress(page, 1);
    await expect.poll(() => readStageFloat(page)).toBeGreaterThan(1.5);
    const forward = await readStageFloat(page);

    await scrollToProcessProgress(page, 0.2);
    await expect.poll(() => readStageFloat(page)).toBeLessThan(forward);
    const backward = await readStageFloat(page);
    expect(backward).toBeLessThan(forward);

    // Y de vuelta hacia adelante reproduce (aprox) el mismo stageFloat que la
    // primera vez en ese mismo punto del recorrido — no es un efecto de un
    // solo sentido.
    await scrollToProcessProgress(page, 1);
    await expect.poll(() => readStageFloat(page)).toBeCloseTo(forward, 1);
  });

  test('el CTA de WhatsApp de la etapa Solución es alcanzable y apunta al número real', async ({ page, browserName }) => {
    test.skip(requiresSkipForSyntheticScrollEvents(browserName), 'WebKit en CI: scroll sintético no dispara el motor de forma confiable; Chromium/Firefox cubren la aserción real');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.__processSceneDebug?.enhanced)).toBe(true);
    await scrollToProcessProgress(page, 1);
    await expect.poll(() => readStageFloat(page)).toBeCloseTo(3, 1);

    const cta = page.locator('.process-cta');
    await expect(cta).toHaveAttribute('href', /wa\.me\/573173907301/);
    const hit = await page.evaluate(() => {
      const el = document.querySelector('.process-cta');
      const rect = el.getBoundingClientRect();
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return el.contains(top) || top === el;
    });
    expect(hit).toBe(true);
  });

  test('los puntos de navegación saltan directamente a la etapa correspondiente', async ({ page, browserName }) => {
    test.skip(requiresSkipForSyntheticScrollEvents(browserName), 'WebKit en CI: scroll sintético no dispara el motor de forma confiable; Chromium/Firefox cubren la aserción real');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.__processSceneDebug?.enhanced)).toBe(true);
    const lastDot = page.locator('.process-dot').last();
    await lastDot.click();
    await expect.poll(() => readStageFloat(page)).toBeCloseTo(3, 1);
    await expect(lastDot).toHaveAttribute('aria-current', 'true');
  });

  // Fase 4 — hallazgo de la auditoría visual: al pasar de largo el final del
  // recorrido (el stage despegándose del pineado antes de #tecnologias), la
  // zona quedaba visualmente mucho más vacía que el mismo punto en la
  // Transición B, que llena ese tramo con su fila de indicadores + barra de
  // progreso. Se agregó .process-progress-rail con el mismo patrón. Esta
  // prueba verifica que existe y que su ancho sigue el progreso real, no
  // solo que el elemento esté presente.
  test('la barra de progreso crece con el scroll, igual que en la Transición B (regresión: zona vacía al final del recorrido)', async ({ page, browserName }) => {
    test.skip(requiresSkipForSyntheticScrollEvents(browserName), 'WebKit en CI: scroll sintético no dispara el motor de forma confiable; Chromium/Firefox cubren la aserción real');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.__processSceneDebug?.enhanced)).toBe(true);
    const rail = page.locator('.process-progress-rail');
    await expect(rail).toBeVisible();

    const readProgress = () => page.evaluate(() => parseFloat(document.getElementById('proceso').style.getPropertyValue('--process-progress')));
    const readFillWidth = () => rail.evaluate((el) => parseFloat(getComputedStyle(el, '::after').width));
    const railWidth = await rail.evaluate((el) => el.getBoundingClientRect().width);

    await scrollToProcessProgress(page, 0);
    await expect.poll(readProgress).toBeCloseTo(0, 1);
    await expect.poll(readFillWidth).toBeLessThan(railWidth * 0.1);

    await scrollToProcessProgress(page, 1);
    await expect.poll(readProgress).toBeCloseTo(1, 1);
    await expect.poll(readFillWidth).toBeGreaterThan(railWidth * 0.9);
  });

  test('los 4 puntos de navegación son alcanzables por teclado', async ({ page, browserName }) => {
    test.skip(requiresSkipForSyntheticScrollEvents(browserName), 'WebKit en CI: scroll sintético no dispara el motor de forma confiable; Chromium/Firefox cubren la aserción real');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.__processSceneDebug?.enhanced)).toBe(true);
    const dots = page.locator('.process-dot');
    await dots.first().focus();
    for (let i = 0; i < 4; i += 1) {
      const isFocused = await dots.nth(i).evaluate((el) => el === document.activeElement);
      expect(isFocused, `el punto ${i} no tiene el foco en su turno`).toBe(true);
      if (i < 3) await page.keyboard.press('Tab');
    }
    await page.keyboard.press('Enter');
    await expect.poll(() => readStageFloat(page)).toBeCloseTo(3, 1);
  });
});

test.describe('Transición C — accesibilidad y robustez', () => {
  test('sin violaciones de accesibilidad serias/críticas con la escena activa a mitad de recorrido', async ({ page, browserName }) => {
    test.skip(requiresSkipForSyntheticScrollEvents(browserName), 'WebKit en CI: scroll sintético no dispara el motor de forma confiable; Chromium/Firefox cubren la aserción real');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.evaluate(() => window.__processSceneDebug?.enhanced)).toBe(true);
    await scrollToProcessProgress(page, 0.5);
    await page.waitForTimeout(200);

    const results = await new AxeBuilder({ page })
      .include('#proceso')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const seriousOrWorse = results.violations.filter((v) => ['critical', 'serious'].includes(v.impact));
    const details = seriousOrWorse
      .map((v) => `- [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodo(s))`)
      .join('\n');
    expect(seriousOrWorse, `Violaciones encontradas:\n${details}`).toHaveLength(0);
  });

  test('con JavaScript deshabilitado, las 4 etapas son legibles y el CTA final funciona', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('.process-stage')).toHaveCount(4);
    await expect(page.locator('.process-stage h3').nth(3)).toHaveText('Entregamos tu software');
    const cta = page.locator('.process-cta');
    await expect(cta).toHaveAttribute('href', /wa\.me\/573173907301/);
    await context.close();
  });

  test('la escena pineada nunca agrega scroll horizontal más allá del que ya tenía la página', async ({ page, browserName }) => {
    test.skip(requiresSkipForSyntheticScrollEvents(browserName), 'WebKit en CI: scroll sintético no dispara el motor de forma confiable; Chromium/Firefox cubren la aserción real');
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 900 }, { width: 1920, height: 1080 }]) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      const baseline = await page.evaluate(() => document.documentElement.scrollWidth);
      await scrollToProcessProgress(page, 0.5);
      await page.waitForTimeout(150);
      const duringScrub = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(duringScrub).toBeLessThanOrEqual(baseline);
    }
  });

  test('deja de recalcular la escena por cada scroll una vez que queda lejos del viewport (regresión: pausa fuera de viewport)', async ({ page, browserName }) => {
    test.skip(requiresSkipForSyntheticScrollEvents(browserName), 'WebKit en CI: scroll sintético no dispara el motor de forma confiable; Chromium/Firefox cubren la aserción real');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.__processSceneDebug?.enhanced)).toBe(true);
    await scrollToProcessProgress(page, 1);
    await expect.poll(() => readStageFloat(page)).toBeCloseTo(3, 1);

    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
    await page.waitForTimeout(200);
    const callsBefore = await page.evaluate(() => window.__processSceneDebug.updateCalls);

    for (let i = 0; i < 4; i += 1) {
      await page.mouse.wheel(0, -40);
      await page.waitForTimeout(30);
      await page.mouse.wheel(0, 40);
      await page.waitForTimeout(30);
    }
    const callsAfter = await page.evaluate(() => window.__processSceneDebug.updateCalls);
    expect(callsAfter).toBe(callsBefore);
  });

  test('degrada con elegancia si Canvas2D no está disponible: el texto y el CTA de las 4 etapas siguen funcionando', async ({ page, browserName }) => {
    test.skip(requiresSkipForSyntheticScrollEvents(browserName), 'WebKit en CI: scroll sintético no dispara el motor de forma confiable; Chromium/Firefox cubren la aserción real');
    await page.setViewportSize({ width: 1440, height: 900 });
    // getContext('2d') devuelve null para CUALQUIER canvas de la página —
    // simula un entorno sin Canvas2D sin depender de ninguna API experimental
    // de Playwright para "deshabilitar" el lienzo.
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function patchedGetContext(type, ...args) {
        if (type === '2d') return null;
        return original.call(this, type, ...args);
      };
    });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.__processSceneDebug?.enhanced)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__processSceneDebug?.canvasAvailable)).toBe(false);
    await expect(page.locator('.process-canvas')).toBeHidden();

    await scrollToProcessProgress(page, 1);
    await expect.poll(() => readStageFloat(page)).toBeCloseTo(3, 1);
    const cta = page.locator('.process-cta');
    await expect(cta).toHaveAttribute('href', /wa\.me\/573173907301/);
  });
});
