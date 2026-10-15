import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      '.venv/**',
      'playwright-report/**',
      'test-results/**',
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
];
