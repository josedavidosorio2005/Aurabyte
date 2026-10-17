import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// WebKit en CI (Linux, headless, sin compositor de escritorio) no dispara
// de forma confiable las reacciones a eventos sintéticos 'scroll'/'resize'
// que este motor depende: todo lo que requiere que updateScrub() o
// matchMedia('change') vuelvan a correr después de un scrollTo/resize
// programático se queda en su valor inicial y expect.poll() agota su
// timeout. No es un bug de la función (el mismo WebKit local, en Windows,
// pasa 39/39 de forma estable, confirmado en sesión) — es una limitación
// conocida del motor en este entorno específico, de la misma familia que
// Fase 1 ya documentó para el render por software del hero
// (requiresSkipForSustainedRendering en hero-scene.spec.js). Firefox en
// CI sí reacciona correctamente a estos mismos eventos (confirmado: cero
// fallos de Firefox en la misma corrida de CI que encontró esto), así que
// el salto se acota a WebKit, no a "cualquier no-Chromium" — Chromium
// corre la aserción real siempre, también en CI.
function requiresSkipForSyntheticScrollEvents(browserName) {
  return browserName === 'webkit' && !!process.env.CI;
}

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

  test('redimensionar en vivo de escritorio a móvil revierte la mejora', async ({ page, browserName }) => {
    test.skip(requiresSkipForSyntheticScrollEvents(browserName), 'WebKit en CI: matchMedia(change) tras setViewportSize no reacciona de forma confiable; Chromium/Firefox cubren la aserción real');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.__servicesSceneDebug?.enhanced)).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await expect.poll(() => page.evaluate(() => window.__servicesSceneDebug?.enhanced)).toBe(false);
    await expect(page.locator('.service-panel')).toHaveCount(8);
  });
});

test.describe('Transición B — profundidad y rendimiento', () => {
  // Parametrizado en vez de un solo punto del recorrido (encontrado en
  // revisión: el test original solo probaba un wheel(3000) sin verificar
  // en qué fracción real del recorrido aterrizaba).
  for (const fraction of [0.15, 0.35, 0.5, 0.65, 0.85]) {
    test(`nunca hay más de 2 paneles con filtro blur activo a la vez (fracción ${fraction})`, async ({ page, browserName }) => {
      test.skip(requiresSkipForSyntheticScrollEvents(browserName), 'WebKit en CI: scroll sintético no dispara el motor de forma confiable; Chromium/Firefox cubren la aserción real');
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/');
      await expect.poll(() => page.evaluate(() => window.__servicesSceneDebug?.enhanced)).toBe(true);
      await page.evaluate((frac) => {
        const scrubber = document.querySelector('.services-scrubber');
        const rect = scrubber.getBoundingClientRect();
        const docTop = window.scrollY + rect.top;
        const range = rect.height - window.innerHeight;
        window.scrollTo({ top: docTop + frac * range, behavior: 'instant' });
      }, fraction);
      const readBlurredCount = () =>
        page.evaluate(() => {
          const panels = Array.from(document.querySelectorAll('.service-panel'));
          return panels.filter((panel) => {
            const filter = getComputedStyle(panel).filter;
            return filter.includes('blur') && !filter.includes('blur(0px)');
          }).length;
        });
      await expect.poll(readBlurredCount).toBeGreaterThan(0);
      expect(await readBlurredCount()).toBeLessThanOrEqual(2);
    });
  }

  test('el panel en scrubIndex=0 es el visualmente centrado, no un panel intermedio', async ({ page, browserName }) => {
    test.skip(requiresSkipForSyntheticScrollEvents(browserName), 'WebKit en CI: scroll sintético no dispara el motor de forma confiable; Chromium/Firefox cubren la aserción real');
    // Regresión: justify-content:center centra la fila sin desplazar
    // (translateX=0 natural = panel del medio), así que a scrubIndex=0
    // sin el offset correcto se veía centrado el panel 3, no el 0
    // (confirmado con evidencia visual real antes de este fix).
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const readClosestIndex = () =>
      page.evaluate(() => {
        const viewportCenter = window.innerWidth / 2;
        const panels = Array.from(document.querySelectorAll('.service-panel'));
        let closest = -1;
        let closestDistance = Infinity;
        panels.forEach((panel, index) => {
          const rect = panel.getBoundingClientRect();
          const panelCenter = rect.left + rect.width / 2;
          const distance = Math.abs(panelCenter - viewportCenter);
          if (distance < closestDistance) {
            closestDistance = distance;
            closest = index;
          }
        });
        return closest;
      });
    await expect.poll(readClosestIndex).toBe(0);
  });
});

function readScrubIndex(page) {
  return page.evaluate(() =>
    Math.round(parseFloat(document.querySelector('.services-rail').style.getPropertyValue('--services-scrub-index')))
  );
}

// Calcula la posición de scroll real a partir de la geometría del propio
// .services-scrubber en vez de asumir una distancia fija en píxeles desde
// el tope de la página: hay secciones (misión-visión, valores) entre el
// hero y #servicios, así que un delta de wheel() fijo no es confiable
// para ubicarse dentro del recorrido de la Transición B.
async function scrollToServicesProgress(page, fraction) {
  await page.evaluate((frac) => {
    const scrubber = document.querySelector('.services-scrubber');
    if (!scrubber) return;
    const rect = scrubber.getBoundingClientRect();
    const docTop = window.scrollY + rect.top;
    const range = rect.height - window.innerHeight;
    // behavior: 'instant', NO 'auto' — 'auto' significa "respeta la
    // propiedad CSS scroll-behavior" (smooth aquí, ver styles.css), así
    // que con 'auto' igual anima y una espera corta solo captura un
    // punto a mitad de la animación, no el destino real. 'instant' es
    // el único valor que de verdad lo ignora.
    window.scrollTo({ top: docTop + frac * range, behavior: 'instant' });
  }, fraction);
}

test.describe('Transición B — navegación y accesibilidad', () => {
  test('scroll hacia adelante y luego hacia atrás reproduce los mismos estados en reversa', async ({ page, browserName }) => {
    test.skip(requiresSkipForSyntheticScrollEvents(browserName), 'WebKit en CI: scroll sintético no dispara el motor de forma confiable; Chromium/Firefox cubren la aserción real');
    // expect.poll en vez de un waitForTimeout fijo: el ciclo real
    // scroll -> rAF del motor compartido -> escritura de la variable CSS
    // no siempre termina dentro de una espera corta en Firefox/WebKit
    // bajo carga (mismo patrón ya visto en la prueba de amplitud de
    // reduced-motion de la Fase 1) — se espera a la condición real, no a
    // un tiempo fijo que puede no ser suficiente.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await scrollToServicesProgress(page, 0.6);
    await expect.poll(() => readScrubIndex(page)).toBeGreaterThan(0);
    const forwardIndex = await readScrubIndex(page);
    await scrollToServicesProgress(page, 0.3);
    await expect.poll(() => readScrubIndex(page)).toBeLessThan(forwardIndex);
  });

  test('click en un indicador salta directamente al panel correspondiente', async ({ page, browserName }) => {
    test.skip(requiresSkipForSyntheticScrollEvents(browserName), 'WebKit en CI: scroll sintético no dispara el motor de forma confiable; Chromium/Firefox cubren la aserción real');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const lastIndicator = page.locator('.services-indicator').last();
    await lastIndicator.click();
    await expect.poll(() => readScrubIndex(page)).toBe(7);
  });

  test('los 8 indicadores son alcanzables por teclado EN ORDEN (no solo "algo avanzó")', async ({ page, browserName }) => {
    test.skip(requiresSkipForSyntheticScrollEvents(browserName), 'WebKit en CI: scroll sintético no dispara el motor de forma confiable; Chromium/Firefox cubren la aserción real');
    // El test original solo comprobaba scrubIndex > 0 tras Tab x7 + Enter
    // — pasaría igual si el foco se hubiera escapado del grupo de
    // indicadores hacia cualquier otro control enfocable de la página
    // (encontrado en revisión de rama completa). Aquí se verifica, Tab a
    // Tab, que el foco real (document.activeElement) es cada uno de los
    // 8 botones en su orden, y que activar el último con Enter deja
    // scrubIndex exactamente en 7 (no "mayor que 0").
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const indicators = page.locator('.services-indicator');
    await indicators.first().focus();
    for (let i = 0; i < 8; i += 1) {
      const isFocused = await indicators.nth(i).evaluate((el) => el === document.activeElement);
      expect(isFocused, `el indicador ${i} no tiene el foco en su turno`).toBe(true);
      if (i < 7) await page.keyboard.press('Tab');
    }
    await page.keyboard.press('Enter');
    await expect.poll(() => readScrubIndex(page)).toBe(7);
    await expect(indicators.last()).toHaveAttribute('aria-current', 'true');
  });

  test('con JavaScript deshabilitado, los 8 servicios son legibles con su CTA funcional', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('.service-panel')).toHaveCount(8);
    const firstCta = page.locator('.service-panel-cta').first();
    await expect(firstCta).toHaveAttribute('href', /wa\.me\/573173907301/);
    await context.close();
  });

  test('el riel pineado nunca agrega scroll horizontal más allá del que ya tenía la página', async ({ page, browserName }) => {
    test.skip(requiresSkipForSyntheticScrollEvents(browserName), 'WebKit en CI: scroll sintético no dispara el motor de forma confiable; Chromium/Firefox cubren la aserción real');
    // No asume que el resto del sitio esté libre de overflow horizontal
    // (fuera del alcance de esta fase) — solo verifica que ESTA sección
    // no lo empeora, en los 3 puntos del recorrido y en los 3 viewports
    // relevantes (el riel pineado solo existe desde 1024px).
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 900 }, { width: 1920, height: 1080 }]) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      const baseline = await page.evaluate(() => document.documentElement.scrollWidth);
      await page.mouse.wheel(0, 1500);
      await page.mouse.wheel(0, 1500);
      await page.waitForTimeout(150);
      const duringScrub = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(duringScrub).toBeLessThanOrEqual(baseline);
      const stageWidth = await page.evaluate(() => {
        const stage = document.querySelector('.services-stage');
        return stage ? stage.getBoundingClientRect().width : null;
      });
      if (stageWidth !== null) {
        expect(stageWidth).toBeLessThanOrEqual(viewport.width + 1);
      }
    }
  });

  test('el primer panel ya está asentado (sin blur/escala reducida) justo al entrar al recorrido pineado', async ({ page }) => {
    // Nota de alcance: #servicios no es el hermano inmediato de #inicio
    // (misión-visión y valores quedan entre medio), así que la
    // continuidad no es "literalmente pegado al hero" sino "el riel no
    // repite su propio fade-in cuando scrubIndex llega a 0" — es lo que
    // esta prueba verifica, con la posición real del scrubber, no una
    // distancia de scroll asumida desde el tope de la página.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await scrollToServicesProgress(page, 0);
    await page.waitForTimeout(200);
    const firstPanel = await page.evaluate(() => {
      const panel = document.querySelector('.service-panel[data-service-index="0"]');
      return { opacity: parseFloat(getComputedStyle(panel).opacity), distance: panel.style.getPropertyValue('--panel-distance') };
    });
    expect(firstPanel.distance).toBe('0.000');
    expect(firstPanel.opacity).toBeGreaterThan(0.9);
  });

  // C1 de la revisión de rama completa: el hallazgo real no era "el CTA
  // del panel 0 a 1440×900" (la única combinación que el test original
  // probaba, y la única donde el bug no se notaba) — era que a
  // 1280×720/1024×768, con paneles más altos que el espacio disponible,
  // el CTA de hasta 4 de los 8 servicios quedaba bajo los indicadores.
  // Por eso aquí se recorren TODOS los paneles en VARIOS viewports y se
  // verifica con hit-testing real (elementFromPoint), no con el string
  // de un custom property.
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 1040, height: 768 },
  ]) {
    test(`el CTA de cada uno de los 8 paneles es clicable (hit-test real) en ${viewport.width}x${viewport.height}`, async ({ page, browserName }) => {
      test.skip(requiresSkipForSyntheticScrollEvents(browserName), 'WebKit en CI: scroll sintético no dispara el motor de forma confiable; Chromium/Firefox cubren la aserción real');
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect.poll(() => page.evaluate(() => window.__servicesSceneDebug?.enhanced)).toBe(true);

      const readHit = (i) =>
        page.evaluate((idx) => {
          const cta = document.querySelector(`.service-panel[data-service-index="${idx}"] .service-panel-cta`);
          const rect = cta.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          const topElement = document.elementFromPoint(x, y);
          return { reachable: cta.contains(topElement) || topElement === cta, visible: rect.height > 0 && rect.width > 0 };
        }, i);

      for (let index = 0; index < 8; index += 1) {
        await scrollToServicesProgress(page, index / 7);
        await expect.poll(() => readScrubIndex(page)).toBe(index);
        // --services-scrub-index (custom property) se escribe al instante,
        // pero el transform real del riel tiene una transición CSS de
        // 50ms (services-scene.css) — leer getBoundingClientRect() justo
        // después del poll puede capturar un fotograma a mitad de esa
        // transición. Se hace polling sobre la condición geométrica real
        // (no sobre un tiempo fijo adivinado) para que se autocorrija sin
        // importar cuánto tarde en asentar la transición.
        await expect.poll(() => readHit(index)).toMatchObject({ reachable: true, visible: true });
      }
    });
  }

  // C2 de la revisión: a viewports de escritorio más bajos, el título y
  // el ícono del panel activo quedaban detrás de la navbar fija
  // (position:sticky con top:0 fijo, sin tener en cuenta su altura real).
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1040, height: 768 }]) {
    test(`el título e ícono del panel activo quedan debajo de la navbar en ${viewport.width}x${viewport.height}`, async ({ page, browserName }) => {
      test.skip(requiresSkipForSyntheticScrollEvents(browserName), 'WebKit en CI: scroll sintético no dispara el motor de forma confiable; Chromium/Firefox cubren la aserción real');
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect.poll(() => page.evaluate(() => window.__servicesSceneDebug?.enhanced)).toBe(true);
      await scrollToServicesProgress(page, 0.5);
      await expect.poll(() => readScrubIndex(page)).toBeGreaterThan(0);
      const readClearance = () =>
        page.evaluate(() => {
          const navBottom = document.querySelector('.navbar').getBoundingClientRect().bottom;
          const scrubIndex = Math.round(parseFloat(document.querySelector('.services-rail').style.getPropertyValue('--services-scrub-index')));
          const activePanel = document.querySelector(`.service-panel[data-service-index="${scrubIndex}"]`);
          const heading = activePanel.querySelector('h3').getBoundingClientRect();
          const icon = activePanel.querySelector('.service-icon').getBoundingClientRect();
          return { navBottom, headingTop: heading.top, iconTop: icon.top };
        });
      // Igual que en el test de CTA: se espera a la condición geométrica
      // real (no a un tiempo fijo) para no depender de cuánto tarde en
      // asentar la transición CSS del riel.
      await expect.poll(async () => {
        const c = await readClearance();
        return c.headingTop >= c.navBottom && c.iconTop >= c.navBottom;
      }).toBe(true);
      const clearance = await readClearance();
      expect(clearance.headingTop).toBeGreaterThanOrEqual(clearance.navBottom);
      expect(clearance.iconTop).toBeGreaterThanOrEqual(clearance.navBottom);
    });
  }

  test('un panel que ya pasó por el centro vuelve a su escala/opacidad reducida al alejarse (regresión: .reveal-on-scroll.is-visible no debe ganarle al riel)', async ({ page, browserName }) => {
    test.skip(requiresSkipForSyntheticScrollEvents(browserName), 'WebKit en CI: scroll sintético no dispara el motor de forma confiable; Chromium/Firefox cubren la aserción real');
    // Bug real encontrado en revisión: .js .reveal-on-scroll.is-visible
    // (specificity 0-3-0) le ganaba a [data-scene="rail"] .service-panel
    // (0-2-0) — una vez que IntersectionObserver marcaba un panel
    // .is-visible (lo cual pasa para CASI todos los paneles según se
    // hace scroll gradual, no con saltos instantáneos), ese panel se
    // quedaba pegado en opacity:1/transform:none para siempre, incluso
    // lejos del centro. Por eso este test hace scroll GRADUAL real (rueda
    // del mouse, no scrollTo instantáneo) — un salto directo nunca dispara
    // el IntersectionObserver para los paneles intermedios y no habría
    // detectado el bug.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.__servicesSceneDebug?.enhanced)).toBe(true);

    // Scroll gradual hasta que el panel 0 haya pasado claramente por el
    // centro (scrubIndex alto) y vuelto a quedar lejos.
    for (let i = 0; i < 25; i += 1) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(40);
    }

    const panel0 = await page.evaluate(() => {
      const panel = document.querySelector('.service-panel[data-service-index="0"]');
      const style = getComputedStyle(panel);
      return {
        distance: parseFloat(panel.style.getPropertyValue('--panel-distance')),
        opacity: parseFloat(style.opacity),
        transform: style.transform,
        visibility: style.visibility,
      };
    });

    expect(panel0.distance).toBeGreaterThan(1.5);
    expect(panel0.visibility).toBe('visible');
    expect(panel0.opacity).toBeLessThan(0.9);
    expect(panel0.transform).not.toBe('none');
  });

  test('sin violaciones de accesibilidad serias/críticas en #servicios con el riel activo a mitad de recorrido', async ({ page }) => {
    // La pasada de axe sitewide (accessibility.spec.js) corre en scroll 0,
    // donde (antes del fix de C3) casi todos los paneles del riel estaban
    // en visibility:hidden — auditaba prácticamente nada de la escena real.
    // Esta corre a mitad de recorrido, con paneles en su estado de opacidad
    // reducida real (el caso que CLAUDE.md ya documenta como riesgo de
    // contraste "serious" si falta visibility:hidden).
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await scrollToServicesProgress(page, 0.45);
    await page.waitForTimeout(200);

    const results = await new AxeBuilder({ page })
      .include('#servicios')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const seriousOrWorse = results.violations.filter((v) => ['critical', 'serious'].includes(v.impact));
    const details = seriousOrWorse
      .map((v) => `- [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodo(s))`)
      .join('\n');
    expect(seriousOrWorse, `Violaciones encontradas:\n${details}`).toHaveLength(0);
  });

  test('deja de recalcular el riel por cada scroll una vez que la sección queda muy por detrás (regresión: pausa fuera de viewport)', async ({ page, browserName }) => {
    test.skip(requiresSkipForSyntheticScrollEvents(browserName), 'WebKit en CI: scroll sintético no dispara el motor de forma confiable; Chromium/Firefox cubren la aserción real');
    // El spec pide (sección "Rendimiento") pausar la escritura por frame
    // cuando #servicios no está en viewport — antes de este fix, cada
    // scroll en cualquier parte del resto de la página (footer, etc.)
    // seguía recalculando y escribiendo propiedades para siempre.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.__servicesSceneDebug?.enhanced)).toBe(true);
    await scrollToServicesProgress(page, 1);
    await expect.poll(() => readScrubIndex(page)).toBe(7);

    // Deja margen real para seguir scrolleando (ni el tope ni el fondo
    // absolutos — en el fondo absoluto wheel() no dispara ningún evento
    // 'scroll' real porque no hay a dónde moverse, lo que habría hecho
    // esta prueba vacuamente verde sin importar si el guard existe).
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight - window.innerHeight - 400, behavior: 'instant' }));
    await page.waitForTimeout(200);
    const callsBefore = await page.evaluate(() => window.__servicesSceneDebug.updateScrubCalls);

    const scrollYBefore = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 40);
    await page.waitForTimeout(50);
    const scrollYMid = await page.evaluate(() => window.scrollY);
    // Confirma que sí hubo scroll real en este punto (si no se movió, el
    // resto de la prueba no demostraría nada).
    expect(scrollYMid, 'el wheel() de la prueba no movió scrollY — la aserción de abajo sería vacua').not.toBe(scrollYBefore);

    for (let i = 0; i < 4; i += 1) {
      await page.mouse.wheel(0, -40);
      await page.waitForTimeout(30);
      await page.mouse.wheel(0, 40);
      await page.waitForTimeout(30);
    }
    const callsAfter = await page.evaluate(() => window.__servicesSceneDebug.updateScrubCalls);
    expect(callsAfter).toBe(callsBefore);
  });
});
