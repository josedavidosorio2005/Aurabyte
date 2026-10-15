// Construye _site/ con EXACTAMENTE los archivos de producción (ver
// production-files.mjs / DEPLOYMENT.md, "Qué se publica") para que
// actions/upload-pages-artifact suba solo eso. Falla si falta algo
// esperado, en vez de publicar un sitio incompleto en silencio.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLISH_DIRS, PUBLISH_FILES } from './production-files.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const siteDir = join(root, '_site');

rmSync(siteDir, { recursive: true, force: true });
mkdirSync(siteDir, { recursive: true });

for (const file of PUBLISH_FILES) {
  const src = join(root, file);
  if (!existsSync(src)) {
    console.error(`[staging] Falta ${file} — ¿corriste "npm run build" antes?`);
    process.exit(1);
  }
  cpSync(src, join(siteDir, file));
}

for (const dir of PUBLISH_DIRS) {
  const src = join(root, dir);
  if (!existsSync(src)) {
    console.error(`[staging] Falta el directorio ${dir}/`);
    process.exit(1);
  }
  cpSync(src, join(siteDir, dir), { recursive: true });
}

console.log(`[staging] _site/ listo con ${PUBLISH_FILES.length} archivos y ${PUBLISH_DIRS.length} directorios.`);
