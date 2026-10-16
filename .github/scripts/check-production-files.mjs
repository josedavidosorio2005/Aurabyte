// Verifica, ANTES de empaquetar, que todo lo que se va a publicar
// (PUBLISH_FILES/PUBLISH_DIRS) realmente existe tras el build, y que los
// directorios publicados completos (icons/, fonts/) no contienen por
// accidente nada de la lista prohibida (FORBIDDEN). No escribe nada — solo
// falla el job antes de llegar al despliegue si algo no está bien.
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORBIDDEN, PUBLISH_DIRS, PUBLISH_FILES } from './production-files.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let failed = false;

for (const file of PUBLISH_FILES) {
  if (!existsSync(join(root, file))) {
    console.error(`[produccion] Falta un archivo a publicar: ${file}`);
    failed = true;
  }
}

for (const dir of PUBLISH_DIRS) {
  const abs = join(root, dir);
  if (!existsSync(abs)) {
    console.error(`[produccion] Falta un directorio a publicar: ${dir}/`);
    failed = true;
    continue;
  }
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (FORBIDDEN.includes(entry.name)) {
      console.error(`[produccion] "${dir}/${entry.name}" no debería estar ahí (lista prohibida)`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}
console.log(
  `[produccion] OK — ${PUBLISH_FILES.length} archivos y ${PUBLISH_DIRS.length} directorios listos para publicar.`
);
