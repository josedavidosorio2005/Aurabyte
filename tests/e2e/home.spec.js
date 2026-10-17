import { expect, test } from '@playwright/test';

// window.scrollTo() no actualiza window.scrollY de forma síncrona: medido
// directamente en CI (diagnóstico temporal, ver historial de commits),
// scrollY seguía en 0 justo después de llamarlo, y solo se reflejaba un
// momento más tarde. Por eso no basta con "llamar scrollTo y seguir" — hay
// que esperar explícitamente a que el scroll realmente se aplique antes de
// continuar, o cualquier aserción inmediatamente después corre contra el
// estado viejo.
async function scrollInstant(page, locator) {
  const targetY = await locator.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return window.scrollY + rect.top;
  });
  await page.evaluate((y) => window.scrollTo(0, y), targetY);
  await page.waitForFunction((y) => Math.abs(window.scrollY - y) < 2, targetY);
}

test.describe('Página principal de Aurabyte', () => {
  test('la experiencia futurista tiene progreso de lectura y hero semántico', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Desarrollo de software');
    await expect(page.locator('.hero-atmosphere')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.scroll-progress')).toHaveAttribute('aria-hidden', 'true');
    await scrollInstant(page, page.locator('#contacto'));
    await expect.poll(async () => page.locator('.scroll-progress').evaluate(
      element => Number(element.style.transform.match(/scaleX\(([^)]+)\)/)?.[1] ?? 0)
    )).toBeGreaterThan(0);
  });

  test('el efecto de movimiento respeta las preferencias de accesibilidad', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/');
    const reveal = page.locator('.reveal-on-scroll').first();
    await expect(reveal).toHaveCSS('opacity', '1');
    await context.close();
  });

  test('carga y muestra el hero y la navegación', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Aurabyte/i);
    await expect(page.locator('nav')).toBeVisible();
  });

  // Fase 4 — hallazgo de la auditoría visual: en móvil, el panel del menú
  // hamburguesa solo medía lo que ocupaban sus propios enlaces (menos que el
  // viewport), así que el contenido del hero se veía "transparentándose"
  // bajo el menú abierto, debajo del último enlace (confirmado con captura
  // real a 390x844). Se corrigió dándole altura explícita hasta el final
  // del viewport.
  test('el menú móvil abierto cubre todo el viewport, sin que el contenido de abajo se transparente (regresión)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('#hamburger').click();
    await expect(page.locator('#navMenu')).toHaveClass(/active/);
    // El panel desliza con "transition: 0.3s" (styles.css) — sin esperar a
    // que termine, el hit-test de abajo puede correr a mitad de la
    // animación (left todavía negativo) y golpear lo que haya detrás.
    await expect.poll(() => page.locator('#navMenu').evaluate((el) => el.getBoundingClientRect().left)).toBe(0);
    const coverage = await page.locator('#navMenu').evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { bottom: rect.bottom, viewportHeight: window.innerHeight };
    });
    expect(coverage.bottom).toBeGreaterThanOrEqual(coverage.viewportHeight - 1);
    // Hit-test real en la esquina inferior del menú: debe devolver un
    // elemento DENTRO de #navMenu, no un CTA del hero que esté por debajo.
    const hitInsideMenu = await page.evaluate(() => {
      const menu = document.getElementById('navMenu');
      const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 5);
      return menu.contains(el);
    });
    expect(hitInsideMenu).toBe(true);
  });

  test('los servicios no muestran tarifas y permiten contactar por Instagram', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#precios .quote-label')).toHaveCount(3);
    await expect(page.locator('#precios .quote-label').first()).toHaveText('Cotización personalizada');
    await expect(page.locator('#budget')).toHaveCount(0);
    const sectionText = await page.locator('#precios').innerText();
    expect(sectionText).not.toMatch(/\$\s*\d|\d+\s*M\s*COP|Desde\s*\$/i);
    const links = await page.locator('#precios a[href^="https://wa.me/"]').evaluateAll(
      (elements) => elements.map((element) => decodeURIComponent(element.href))
    );
    expect(links.join(' ')).not.toMatch(/\$\s*\d|\d+\s*M\s*COP/i);
    await expect(page.getByRole('link', { name: /Instagram de Aurabyte/ }).first())
      .toHaveAttribute('href', 'https://www.instagram.com/aurabyte_software/');
  });

  test('el formulario de contacto rechaza un proyecto descrito con menos de 20 caracteres', async ({
    page,
  }) => {
    await page.goto('/');
    await scrollInstant(page, page.locator('#contacto'));
    await page.locator('#name').fill('Cliente de Prueba');
    await page.locator('#service').selectOption('Desarrollo Web');
    await page.locator('#message').fill('muy corto');

    const openedBeforeSubmit = await page.evaluate(() => {
      let opened = false;
      window.open = () => {
        opened = true;
        return null;
      };
      document.getElementById('contactForm').requestSubmit();
      return opened;
    });

    await expect(page.locator('#formMessage')).toHaveText(/al menos 20 caracteres/i);
    expect(openedBeforeSubmit).toBe(false);
  });

  test('el formulario de contacto arma el mensaje de WhatsApp y no afirma un envío', async ({
    page,
  }) => {
    await page.goto('/');
    await scrollInstant(page, page.locator('#contacto'));
    await page.locator('#name').fill('Cliente de Prueba E2E');
    await page.locator('#service').selectOption('Desarrollo Web');
    await page
      .locator('#message')
      .fill('Necesito un sitio web con catálogo de productos y formulario de contacto.');

    const capturedUrl = await page.evaluate(
      () =>
        new Promise((resolve) => {
          window.open = (url) => {
            resolve(url);
            return null;
          };
          document.getElementById('contactForm').requestSubmit();
        })
    );

    expect(capturedUrl).toContain('https://wa.me/573173907301?text=');
    expect(capturedUrl).toContain(encodeURIComponent('Cliente de Prueba E2E'));
    // No debe afirmar que el mensaje ya fue enviado/entregado: el envío real
    // ocurre dentro de WhatsApp cuando la persona lo confirma allí.
    const formMessage = await page.locator('#formMessage').textContent();
    expect(formMessage.toLowerCase()).not.toContain('mensaje enviado');
  });

  test('el botón flotante de WhatsApp no tapa los botones del hero y aparece al hacer scroll', async ({
    page,
  }) => {
    await page.goto('/');
    const floatBtn = page.locator('.whatsapp-float');

    // Mientras el hero está en pantalla, el botón flotante debe quedar
    // oculto (no solo "detrás": fuera del árbol de accesibilidad y del
    // orden de tabulación) para no tapar sus propios CTAs — regresión real
    // encontrada en la Fase 4 (se superponía con "Ver Servicios" en móvil).
    await expect(floatBtn).toBeHidden();

    // Al pasar el hero, debe aparecer y ser completamente funcional.
    await scrollInstant(page, page.locator('#servicios'));
    await expect(floatBtn).toBeVisible();
    await expect(floatBtn).toHaveAttribute('href', /^https:\/\/wa\.me\/573173907301/);
    await expect(floatBtn).toHaveAttribute('aria-label', /.+/);
    await expect(floatBtn).toHaveAttribute('target', '_blank');
    await expect(floatBtn).toHaveAttribute('rel', /noopener/);
  });

  test('el botón flotante de WhatsApp nunca se superpone con los botones del hero', async ({
    page,
  }) => {
    await page.goto('/');
    const overlapsHeroButtons = await page.evaluate(() => {
      function overlaps(a, b) {
        return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
      }
      const wa = document.querySelector('.whatsapp-float').getBoundingClientRect();
      return Array.from(document.querySelectorAll('.cta-buttons a')).some((btn) =>
        overlaps(wa, btn.getBoundingClientRect())
      );
    });
    expect(overlapsHeroButtons).toBe(false);
  });

  test('no hay errores de consola al cargar', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(errors, `Errores de consola encontrados: ${errors.join(', ')}`).toHaveLength(0);
  });
});

test.describe('API REST', () => {
  test('GET /api/services responde 200 con JSON', async ({ request }) => {
    const res = await request.get('/api/services');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBeTruthy();
  });

  test('POST /api/contact valida campos requeridos', async ({ request }) => {
    const res = await request.post('/api/contact', { data: {} });
    expect(res.status()).toBe(400);
  });
});
