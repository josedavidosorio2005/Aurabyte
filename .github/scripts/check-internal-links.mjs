// Verifica los enlaces internos de index.html: que cada ancla "#id" resuelva
// a un elemento real del documento, y que cada href/src relativo apunte a un
// archivo que realmente existe en el repo. No valida enlaces externos
// (http(s)://, mailto:, tel:) — eso requeriría red y no es el objetivo de
// esta verificación ("enlaces internos").
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const htmlPath = resolve(root, 'index.html');
const html = readFileSync(htmlPath, 'utf8');

let failed = false;

// --- Anclas (#id) ---
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const anchors = new Set(
  [...html.matchAll(/(?:href|src)="#([^"]*)"/g)].map((m) => m[1]).filter((a) => a !== '')
);
for (const anchor of anchors) {
  if (!ids.has(anchor)) {
    console.error(`[enlaces] Ancla rota: "#${anchor}" no coincide con ningún id="..."`);
    failed = true;
  }
}

// --- Rutas relativas (archivos locales) ---
const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
const external = /^(https?:|mailto:|tel:|\/\/|#)/i;
for (const ref of refs) {
  if (external.test(ref)) continue;
  // Las referencias a íconos del sprite llevan un fragmento (#icon-x) que no
  // existe como archivo — se valida la parte de archivo, no el fragmento.
  const filePart = ref.split('#')[0];
  if (!filePart) continue;
  const target = resolve(root, filePart);
  if (!existsSync(target)) {
    console.error(`[enlaces] Referencia rota: "${ref}" (no existe ${target})`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
console.log(`[enlaces] OK — ${anchors.size} anclas y ${refs.length} referencias verificadas.`);
