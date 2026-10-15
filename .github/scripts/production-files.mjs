// Lista única de qué se publica en GitHub Pages — compartida por el
// chequeo (check-production-files.mjs) y el empaquetado real
// (stage-production-files.mjs) para que nunca queden desincronizados.
// Ver DEPLOYMENT.md, "Qué se publica (y qué no)".

// Archivos sueltos a copiar en la raíz del artefacto publicado.
export const PUBLISH_FILES = [
  'index.html',
  'styles.min.css',
  'byteo.min.css',
  'script.min.js',
  'byteo.min.js',
  'logo.svg',
  'og-cover.jpg',
  'robots.txt',
  'sitemap.xml',
];

// Directorios completos a copiar (de forma recursiva) en el artefacto.
export const PUBLISH_DIRS = ['icons', 'fonts'];

// Nunca deben aparecer en el artefacto publicado, aunque en el futuro se
// agregue un directorio nuevo copiado por error: backend, configuración de
// servidor, entornos, pruebas, fuente sin minificar, borradores legales y
// documentación interna.
export const FORBIDDEN = [
  'app.py',
  'requirements.txt',
  'requirements-dev.txt',
  '.env',
  '.env.example',
  '.venv',
  'node_modules',
  'tests',
  'styles.css',
  'script.js',
  'byteo.css',
  'byteo.js',
  'privacidad.html',
  'terminos.html',
  'legal.css',
  'CLAUDE.md',
  'package.json',
  'package-lock.json',
  '.eslintrc.json',
  'eslint.config.js',
  '.stylelintrc.json',
];
