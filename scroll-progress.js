// Motor de scroll compartido de toda la página: un único listener de
// 'scroll'/'resize' y un único requestAnimationFrame en vuelo, sin
// importar cuántas secciones (hero, servicios, ...) se suscriban. Antes
// de este módulo, cada escena montaba su propio listener/rAF — con dos
// escenas activas eso son dos listeners y hasta dos rAF por tick de
// scroll compitiendo por el mismo hilo principal.

const regions = new Set();
let rafId = null;

function tick() {
  rafId = null;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
  regions.forEach(({ element, onProgress }) => {
    onProgress(element.getBoundingClientRect(), viewportHeight);
  });
}

function scheduleTick() {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(tick);
}

if (typeof window !== 'undefined') {
  window.addEventListener('scroll', scheduleTick, { passive: true });
  window.addEventListener('resize', scheduleTick);
}

// Expuesto solo para pruebas unitarias en Node (sin DOM real): dispara un
// tick síncrono sin pasar por requestAnimationFrame.
globalThis.__scrollProgressTick__ = tick;

export function clampProgress(value) {
  return Math.min(1, Math.max(0, value));
}

export function registerScrollRegion(element, onProgress) {
  const entry = { element, onProgress };
  regions.add(entry);
  onProgress(element.getBoundingClientRect(), typeof window !== 'undefined' ? window.innerHeight : 0);
  return {
    unregister() {
      regions.delete(entry);
    },
  };
}
