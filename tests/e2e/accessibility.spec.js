import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('la página principal no tiene violaciones de accesibilidad críticas/serias (WCAG 2.1 AA)', async ({
  page,
}) => {
  await page.goto('/');
  // Espera a que las web fonts (Space Grotesk/Inter) terminen de cargar antes
  // de medir contraste: si axe mide con la fuente de respaldo todavía puesta,
  // el tamaño/peso renderizado difiere y el resultado es intermitente.
  await page.evaluate(() => document.fonts.ready);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const seriousOrWorse = results.violations.filter((v) =>
    ['critical', 'serious'].includes(v.impact)
  );

  const details = seriousOrWorse
    .map((v) => `- [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodo(s))`)
    .join('\n');

  expect(seriousOrWorse, `Violaciones encontradas:\n${details}`).toHaveLength(0);
});
