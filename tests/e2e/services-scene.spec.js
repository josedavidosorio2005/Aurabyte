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

test.describe('Transición B — profundidad y rendimiento', () => {
  test('nunca hay más de 2 paneles con filtro blur activo a la vez, y al menos uno sí lo tiene', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(200);
    const blurredCount = await page.evaluate(() => {
      const panels = Array.from(document.querySelectorAll('.service-panel'));
      return panels.filter((panel) => {
        const filter = getComputedStyle(panel).filter;
        return filter.includes('blur') && !filter.includes('blur(0px)');
      }).length;
    });
    expect(blurredCount).toBeGreaterThan(0);
    expect(blurredCount).toBeLessThanOrEqual(2);
  });

  test('el panel en scrubIndex=0 es el visualmente centrado, no un panel intermedio', async ({ page }) => {
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
  test('scroll hacia adelante y luego hacia atrás reproduce los mismos estados en reversa', async ({ page }) => {
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

  test('click en un indicador salta directamente al panel correspondiente', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const lastIndicator = page.locator('.services-indicator').last();
    await lastIndicator.click();
    await expect.poll(() => readScrubIndex(page)).toBe(7);
  });

  test('los 8 indicadores son alcanzables y activables por teclado', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const indicators = page.locator('.services-indicator');
    await indicators.first().focus();
    for (let i = 0; i < 7; i += 1) {
      await page.keyboard.press('Tab');
    }
    await page.keyboard.press('Enter');
    await expect.poll(() => readScrubIndex(page)).toBeGreaterThan(0);
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

  test('el riel pineado nunca agrega scroll horizontal más allá del que ya tenía la página', async ({ page }) => {
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

  test('los indicadores no tapan el CTA del panel activo (regresión: franja inferior reservada)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.__servicesSceneDebug?.enhanced)).toBe(true);
    const overlap = await page.evaluate(() => {
      const indicators = document.querySelector('.services-indicators').getBoundingClientRect();
      const activeCta = document.querySelector('.service-panel[data-service-index="0"] .service-panel-cta').getBoundingClientRect();
      return !(
        indicators.right < activeCta.left ||
        indicators.left > activeCta.right ||
        indicators.bottom < activeCta.top ||
        indicators.top > activeCta.bottom
      );
    });
    expect(overlap).toBe(false);
  });
});
