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
  // esto, Playwright usa hasta la mitad de los núcleos (8 en una máquina de
  // 16) y el servidor de un solo proceso no da abasto. No afecta lo que se
  // prueba, solo el ritmo al que se piden los recursos.
  workers: process.env.CI ? undefined : 3,
  reporter: 'html',
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
