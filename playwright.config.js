// @ts-check
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // 1 reintento local: el servidor de desarrollo de Flask es de un solo
  // proceso y, con 3 navegadores pidiendo en paralelo fuentes/CSS/JS/sprite
  // SVG a la vez, ocasionalmente responde tarde (ver CLAUDE.md, "Pruebas
  // intermitentes"). No oculta fallos reales: si algo está realmente roto,
  // vuelve a fallar en el reintento.
  retries: process.env.CI ? 2 : 1,
  // Limita cuántos tests golpean el servidor de desarrollo a la vez. Sin
  // esto, Playwright usa hasta la mitad de los núcleos y el servidor de un
  // solo proceso no da abasto. En CI (1, serializado) esto resultó ser más
  // que solo "el servidor responde tarde": con 2+ navegadores corriendo en
  // paralelo en un runner compartido, los callbacks de rAF/
  // IntersectionObserver del propio navegador se retrasaban lo bastante
  // como para que animaciones/observers reales (barra de progreso, botón
  // flotante) no se actualizaran dentro del timeout de una prueba —  no un
  // bug del sitio, sino CPU insuficiente para que el navegador pinte a
  // tiempo. Serializar a 1 worker en CI le da a cada prueba el runner
  // completo. No afecta lo que se prueba, solo el ritmo al que corre.
  workers: process.env.CI ? 1 : 3,
  reporter: process.env.CI ? [['line'], ['html']] : 'html',
  use: {
    baseURL: 'http://127.0.0.1:5000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    // En CI (Linux) no hay venv de Windows: se instala con el `python` del
    // runner directamente en el PATH (ver .github/workflows/ci.yml).
    command: process.env.CI ? 'python app.py' : '"./.venv/Scripts/python.exe" app.py',
    url: 'http://127.0.0.1:5000',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: { FLASK_DEBUG: '0' },
  },
});
