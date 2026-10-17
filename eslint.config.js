import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      '.venv/**',
      'playwright-report/**',
      'test-results/**',
      // Capturas/scripts de verificación visual manual (ver plan del hero
      // cinematográfico) — gitignored, no es código fuente del sitio.
      'evidence/**',
      '*.config.js',
      // Generados por `npm run build:js` (lightningcss/terser) a partir de
      // script.js/byteo.js — nunca se editan a mano, no son código fuente.
      '*.min.js',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',
    },
  },
  {
    files: ['tests/e2e/**/*.js'],
    languageOptions: {
      sourceType: 'module',
    },
  },
  {
    // Scripts del sitio cargados como <script type="module"> (ver
    // index.html) — necesitan su propio sourceType, a diferencia de
    // script.js/byteo.js que son scripts clásicos.
    files: ['hero-scene.js', 'scroll-progress.js', 'services-scene.js'],
    languageOptions: {
      sourceType: 'module',
    },
  },
  {
    files: ['.github/scripts/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
];
