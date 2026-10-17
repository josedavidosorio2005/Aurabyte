import { expect, test } from '@playwright/test';

test('Byteo nunca genera un destino de roam sobre el botón de WhatsApp o las CTAs del hero', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.byteo?.generateWalkingPath === 'function');

  // Determinístico en vez de esperar a que el roam en tiempo real pase por
  // la zona de riesgo (probabilístico, podía dar falso-verde): se generan
  // 200 rutas aleatorias directamente y se inspeccionan TODOS sus puntos.
  const result = await page.evaluate(() => {
    const byteoBot = window.byteo;
    const robotSize = 80; // tamaño aproximado de .byteo-robot con margen
    const selectors = ['.whatsapp-float', '.navbar', '.cta-buttons'];
    const protectedRects = selectors
      .map((selector) => document.querySelector(selector)?.getBoundingClientRect())
      .filter(Boolean)
      .map((rect) => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }));

    const overlaps = (x, y) => {
      const box = { left: x, top: y, right: x + robotSize, bottom: y + robotSize };
      return protectedRects.some((rect) =>
        !(box.right <= rect.left || box.left >= rect.right || box.bottom <= rect.top || box.top >= rect.bottom)
      );
    };

    const offending = [];
    for (let i = 0; i < 200; i += 1) {
      byteoBot.generateWalkingPath();
      byteoBot.walkingPath.forEach((point) => {
        if (overlaps(point.x, point.y)) offending.push(point);
      });
    }
    return { offendingCount: offending.length, sample: offending.slice(0, 3) };
  });

  expect(result.offendingCount, JSON.stringify(result.sample)).toBe(0);
});
