# Transición B — Filmstrip de servicios — Plan de implementación

> **Para ejecución:** superpowers:executing-plans (nativo, inline, como la Fase 1). Una revisión final de rama completa al terminar todas las tareas.

**Goal:** Reemplazar la cuadrícula estática de `#servicios` por un filmstrip horizontal pineado en escritorio, con bypass total a lista plana en móvil/reduced-motion, sin romper el hero ni Transición A.

**Arquitectura:** `scroll-progress.js` (motor de scroll compartido, nuevo) + refactor de `hero-scene.js` para usarlo; `services-scene.js`/`.css` (nuevo) con funciones puras + `initServicesScene()` que decide mejora vs. bypass; `index.html` reestructurado a 8 `<article class="service-panel">`.

**Tech Stack:** JS vanilla (módulos ES, sin bundler), CSS nativo, Playwright/pytest/node:test — igual que el resto del sitio. Cero dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-17-servicios-transicion-b-design.md`

## Global Constraints

- Cero dependencias npm/pip nuevas.
- `npm run build` después de tocar cualquier `.js`/`.css` fuente — los `.min.*` se commitean.
- No inventar clientes, cifras ni certificaciones. No reintroducir precios.
- WhatsApp (+57 317 390 7301) e Instagram (@aurabyte_software) intactos y funcionales.
- WCAG 2.2 AA — cero violaciones axe "serious"/"critical" nuevas.
- La suite completa de `tests/e2e/hero-scene.spec.js` debe seguir pasando sin modificarse (regresión de Transición A).
- `prefers-reduced-motion` y viewport < 1024px → bypass total a lista plana, nunca una versión atenuada.
- Blur simultáneo acotado: nunca más de los 2 vecinos inmediatos del panel activo con `filter` activo a la vez.

## Review Focus

- **Resize en vivo cruzando el breakpoint** (tablet rotado, ventana de escritorio redimensionada) con la mejora ya activa: ¿revierte limpiamente a la lista plana o deja un híbrido roto?
- **Navegación por teclado sin mouse**: ¿se puede llegar a cada uno de los 8 indicadores y activarlos con Tab/Enter/Espacio, y el foco aterriza en un lugar sensato tras saltar?
- **JS deshabilitado**: ¿los 8 servicios son completamente legibles y el CTA de WhatsApp de cada uno funciona, sin que quede un `.services-indicators` vacío interferiendo?
- **Scroll hacia atrás, no solo hacia adelante**: muchas implementaciones de scroll-scrubbing solo se verifican avanzando; retroceder debe reproducir los mismos estados en reversa.
- **Contenedor `hidden` interactuable**: el placeholder de indicadores debe ser real-`hidden` (no solo `opacity:0`) antes de que JS decida no mejorar, para que nunca quede un botón vacío enfocable por error.

---

### Task 1: Motor de scroll compartido (`scroll-progress.js`) + refactor de Transición A

**Files:**
- Create: `scroll-progress.js`
- Create: `tests/unit/scroll-progress.test.mjs`
- Modify: `hero-scene.js` (reemplazar su listener propio de scroll/resize por `registerScrollRegion`)
- Modify: `tests/e2e/hero-scene.spec.js` — **no modificar las aserciones**; solo correr para confirmar que sigue en verde (ver Step 5)

**Interfaces:**
- Produces: `export function clampProgress(value)`; `export function registerScrollRegion(element, onProgress)` → `{ unregister() }`. `onProgress` recibe `(rect, viewportHeight)` en cada frame mientras esté registrado.
- Consumes (de `hero-scene.js` ya existente): nada nuevo — `hero-scene.js` pasa a ser consumidor de este módulo.

- [ ] **Step 1: Escribir las pruebas fallidas**

```js
// tests/unit/scroll-progress.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampProgress, registerScrollRegion } from '../../scroll-progress.js';

test('clampProgress limita al rango 0-1', () => {
  assert.equal(clampProgress(-0.4), 0);
  assert.equal(clampProgress(0.5), 0.5);
  assert.equal(clampProgress(1.8), 1);
});

test('registerScrollRegion devuelve un objeto con unregister() que no lanza', () => {
  const fakeElement = { getBoundingClientRect: () => ({ top: 0, height: 100 }) };
  const handle = registerScrollRegion(fakeElement, () => {});
  assert.equal(typeof handle.unregister, 'function');
  assert.doesNotThrow(() => handle.unregister());
});

test('un callback registrado se invoca tras disparar manualmente el tick del motor', () => {
  const fakeElement = { getBoundingClientRect: () => ({ top: -50, height: 200 }) };
  let received = null;
  const handle = registerScrollRegion(fakeElement, (rect) => { received = rect; });
  globalThis.__scrollProgressTick__();
  assert.equal(received.top, -50);
  handle.unregister();
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `node --test tests/unit/scroll-progress.test.mjs`
Expected: FAIL — `Cannot find module '../../scroll-progress.js'`

- [ ] **Step 3: Implementar `scroll-progress.js`**

```js
// scroll-progress.js
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
  const viewportHeight = window.innerHeight;
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
```

- [ ] **Step 4: Verificar que pasan**

Run: `node --test tests/unit/scroll-progress.test.mjs`
Expected: PASS 3/3

- [ ] **Step 5: Refactorizar `hero-scene.js` para usar el motor compartido**

Reemplazar en `initHeroScene()` (al final de la función, el bloque que define `updateTransition` y sus `window.addEventListener('scroll'/'resize', ...)`) por:

```js
  function updateTransition(rect, viewportHeight) {
    const progress = clampProgress(-rect.top / rect.height);
    if (network) {
      network.setTransitionProgress(progress);
      if (progress >= 1) {
        api.pause();
      } else if (!window.__heroSceneDebug.running) {
        api.resume();
      }
    }
    heroSection.style.setProperty('--hero-scene-progress', progress.toFixed(3));
    heroSection.dataset.transitionProgress = progress.toFixed(3);
  }
  registerScrollRegion(heroSection, updateTransition);
```

y añadir `import { registerScrollRegion, clampProgress } from './scroll-progress.js';` al inicio del archivo. Eliminar el `scrollFrame`/listener manual anterior — queda reemplazado por el registro.

- [ ] **Step 6: Confirmar que la Transición A no cambió de comportamiento**

Run: `npx playwright test hero-scene`
Expected: PASS — mismo conteo que antes del refactor (regresión cero; no se edita el archivo de pruebas)

- [ ] **Step 7: Commit**

```bash
git add scroll-progress.js tests/unit/scroll-progress.test.mjs hero-scene.js
git commit -m "feat: motor de scroll compartido; Transición A lo adopta sin cambiar de comportamiento"
```

---

### Task 2: Funciones puras de `services-scene.js`

**Files:**
- Create: `services-scene.js` (solo las funciones puras en este task; `initServicesScene()` llega en Task 5)
- Create: `tests/unit/services-scene-math.test.mjs`

**Interfaces:**
- Produces: `computeScrubProgress(rect, viewportHeight)`, `computeScrubIndex(progress, count)`, `computePanelDistance(index, scrubIndex)`, `computeTargetScrollTop(index, wrapperTop, wrapperHeight, viewportHeight, count)`.
- Consumes: `clampProgress` de `scroll-progress.js` (Task 1).

- [ ] **Step 1: Escribir las pruebas fallidas**

```js
// tests/unit/services-scene-math.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeScrubProgress,
  computeScrubIndex,
  computePanelDistance,
  computeTargetScrollTop,
} from '../../services-scene.js';

test('computeScrubProgress es 0 antes de entrar y 1 al terminar el recorrido', () => {
  const viewportHeight = 800;
  assert.equal(computeScrubProgress({ top: 800, height: 4800 }, viewportHeight), 0);
  assert.equal(computeScrubProgress({ top: -4000, height: 4800 }, viewportHeight), 1);
  assert.equal(computeScrubProgress({ top: -2000, height: 4800 }, viewportHeight), 0.5);
});

test('computeScrubIndex distribuye 0..count-1 sobre el progreso', () => {
  assert.equal(computeScrubIndex(0, 8), 0);
  assert.equal(computeScrubIndex(1, 8), 7);
  assert.equal(computeScrubIndex(0.5, 8), 3.5);
});

test('computePanelDistance es simétrica y cero en el propio índice', () => {
  assert.equal(computePanelDistance(3, 3), 0);
  assert.equal(computePanelDistance(3, 5), 2);
  assert.equal(computePanelDistance(5, 3), 2);
});

test('computeTargetScrollTop ubica el primer y último panel en los extremos del recorrido', () => {
  const wrapperTop = 1000;
  const wrapperHeight = 4800;
  const viewportHeight = 800;
  const count = 8;
  assert.equal(computeTargetScrollTop(0, wrapperTop, wrapperHeight, viewportHeight, count), wrapperTop);
  assert.equal(
    computeTargetScrollTop(7, wrapperTop, wrapperHeight, viewportHeight, count),
    wrapperTop + (wrapperHeight - viewportHeight)
  );
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `node --test tests/unit/services-scene-math.test.mjs`
Expected: FAIL — `Cannot find module '../../services-scene.js'`

- [ ] **Step 3: Implementar las funciones puras**

```js
// services-scene.js
import { clampProgress } from './scroll-progress.js';

export function computeScrubProgress(rect, viewportHeight) {
  return clampProgress(-rect.top / (rect.height - viewportHeight));
}

export function computeScrubIndex(progress, count) {
  return progress * (count - 1);
}

export function computePanelDistance(index, scrubIndex) {
  return Math.abs(index - scrubIndex);
}

export function computeTargetScrollTop(index, wrapperTop, wrapperHeight, viewportHeight, count) {
  const progress = index / (count - 1);
  return wrapperTop + progress * (wrapperHeight - viewportHeight);
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `node --test tests/unit/services-scene-math.test.mjs`
Expected: PASS 4/4

- [ ] **Step 5: Commit**

```bash
git add services-scene.js tests/unit/services-scene-math.test.mjs
git commit -m "feat: funciones puras de scrub/distancia/salto para la Transición B"
```

---

### Task 3: Reestructurar `#servicios` en HTML (contenido real, fallback sin JS)

**Files:**
- Modify: `index.html` (sección `#servicios`, líneas ~357-516 en el estado pre-Fase-2)
- Modify: `tests/test_app.py` si existe algún test que cuente `.service-card` (verificar antes de tocar)

**Interfaces:**
- Produces: estructura DOM que Task 5 (`initServicesScene`) consumirá: `#servicios .services-panels` contiene 8 `<article class="service-panel" data-service-index="0..7">`, cada uno con `<h3>`, `<p>`, `<ul class="service-features">`, `<div class="service-tech">` (contenido exacto preservado) y `<a class="service-panel-cta" href="https://wa.me/573173907301?text=...">`; un `<div class="services-indicators" hidden></div>` vacío como hermano.

- [ ] **Step 1: Verificar si algo depende del marcado actual**

Run: `node -e "const fs=require('fs'); console.log(fs.readFileSync('tests/test_app.py','utf8').includes('service-card'))"`
Expected: imprime `false` (si imprime `true`, leer ese test antes de continuar — no se planea romper ninguna prueba backend)

- [ ] **Step 2: Reemplazar el marcado**

Sustituir el bloque `<div class="services-grid">...</div>` completo por:

```html
            <div class="services-panels">
                <article class="service-panel reveal-on-scroll" data-service-index="0">
                    <div class="service-icon">
                        <svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-globe"></use></svg>
                    </div>
                    <h3>Desarrollo Web</h3>
                    <p>Aplicaciones web modernas y responsivas con tecnologías de vanguardia. Desde landing pages hasta plataformas complejas.</p>
                    <ul class="service-features">
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> Sitios web corporativos</li>
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> E-commerce</li>
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> Aplicaciones web SaaS</li>
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> Portales personalizados</li>
                    </ul>
                    <div class="service-tech">
                        <code>Python</code>
                        <code>Django</code>
                        <code>React</code>
                    </div>
                    <a class="service-panel-cta" href="https://wa.me/573173907301?text=Hola%2C%20quiero%20cotizar%20un%20servicio%20de%20Desarrollo%20Web.%20%C2%BFMe%20pueden%20ayudar%3F" target="_blank" rel="noopener noreferrer">
                        <svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-whatsapp"></use></svg>
                        Cotizar este servicio
                    </a>
                </article>

                <article class="service-panel reveal-on-scroll" data-service-index="1">
                    <div class="service-icon">
                        <svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-desktop"></use></svg>
                    </div>
                    <h3>Aplicaciones de Escritorio</h3>
                    <p>Software nativo para Windows, macOS y Linux. Aplicaciones robustas y eficientes para gestión empresarial.</p>
                    <ul class="service-features">
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> Sistemas de gestión</li>
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> Aplicaciones empresariales</li>
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> Software a medida</li>
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> Integración con hardware</li>
                    </ul>
                    <div class="service-tech">
                        <code>Python</code>
                        <code>PyQt</code>
                        <code>Electron</code>
                    </div>
                    <a class="service-panel-cta" href="https://wa.me/573173907301?text=Hola%2C%20quiero%20cotizar%20un%20servicio%20de%20Aplicaciones%20de%20Escritorio.%20%C2%BFMe%20pueden%20ayudar%3F" target="_blank" rel="noopener noreferrer">
                        <svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-whatsapp"></use></svg>
                        Cotizar este servicio
                    </a>
                </article>

                <article class="service-panel reveal-on-scroll" data-service-index="2">
                    <div class="service-icon">
                        <svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-robot"></use></svg>
                    </div>
                    <h3>Automatización de Procesos</h3>
                    <p>Scripts y herramientas para optimizar tareas empresariales. Automatizamos procesos repetitivos para aumentar la eficiencia.</p>
                    <ul class="service-features">
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> Scripts de automatización</li>
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> Procesamiento de datos</li>
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> Integración de sistemas</li>
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> Web scraping</li>
                    </ul>
                    <div class="service-tech">
                        <code>Python</code>
                        <code>Selenium</code>
                        <code>APIs</code>
                    </div>
                    <a class="service-panel-cta" href="https://wa.me/573173907301?text=Hola%2C%20quiero%20cotizar%20un%20servicio%20de%20Automatizaci%C3%B3n%20de%20Procesos.%20%C2%BFMe%20pueden%20ayudar%3F" target="_blank" rel="noopener noreferrer">
                        <svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-whatsapp"></use></svg>
                        Cotizar este servicio
                    </a>
                </article>

                <article class="service-panel reveal-on-scroll" data-service-index="3">
                    <div class="service-icon">
                        <svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-tools"></use></svg>
                    </div>
                    <h3>Mantenimiento y Soporte Técnico</h3>
                    <p>Actualización, mejora y optimización de proyectos existentes. Acompañamiento continuo para garantizar el éxito de tu software.</p>
                    <ul class="service-features">
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> Actualización de sistemas</li>
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> Corrección de errores</li>
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> Optimización de rendimiento</li>
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> Soporte técnico continuo</li>
                    </ul>
                    <div class="service-tech">
                        <code>Monitoring</code>
                        <code>DevOps</code>
                        <code>Debugging</code>
                    </div>
                    <a class="service-panel-cta" href="https://wa.me/573173907301?text=Hola%2C%20quiero%20cotizar%20un%20servicio%20de%20Mantenimiento%20y%20Soporte%20T%C3%A9cnico.%20%C2%BFMe%20pueden%20ayudar%3F" target="_blank" rel="noopener noreferrer">
                        <svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-whatsapp"></use></svg>
                        Cotizar este servicio
                    </a>
                </article>

                <article class="service-panel reveal-on-scroll" data-service-index="4">
                    <div class="service-icon">
                        <svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-user-shield"></use></svg>
                    </div>
                    <h3>Asesorías en Ciberseguridad</h3>
                    <p>Evaluación de vulnerabilidades, implementación de medidas preventivas y capacitación en seguridad digital para empresas.</p>
                    <ul class="service-features">
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> Auditorías de seguridad</li>
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> Análisis de vulnerabilidades</li>
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> Implementación de controles</li>
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> Capacitación en seguridad</li>
                    </ul>
                    <div class="service-tech">
                        <code>Pentesting</code>
                        <code>Security</code>
                        <code>Compliance</code>
                    </div>
                    <a class="service-panel-cta" href="https://wa.me/573173907301?text=Hola%2C%20quiero%20cotizar%20un%20servicio%20de%20Asesor%C3%ADas%20en%20Ciberseguridad.%20%C2%BFMe%20pueden%20ayudar%3F" target="_blank" rel="noopener noreferrer">
                        <svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-whatsapp"></use></svg>
                        Cotizar este servicio
                    </a>
                </article>

                <article class="service-panel reveal-on-scroll" data-service-index="5">
                    <div class="service-icon">
                        <svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-cloud"></use></svg>
                    </div>
                    <h3>DevOps &amp; Cloud</h3>
                    <p>Infraestructura como código, CI/CD pipelines, contenedorización y despliegues automatizados en AWS, Azure y GCP.</p>
                    <ul class="service-features">
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> Docker &amp; Kubernetes</li>
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> CI/CD Pipelines</li>
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> AWS/Azure/GCP</li>
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> Terraform &amp; Ansible</li>
                    </ul>
                    <div class="service-tech">
                        <code>Docker</code>
                        <code>K8s</code>
                        <code>AWS</code>
                    </div>
                    <a class="service-panel-cta" href="https://wa.me/573173907301?text=Hola%2C%20quiero%20cotizar%20un%20servicio%20de%20DevOps%20%26%20Cloud.%20%C2%BFMe%20pueden%20ayudar%3F" target="_blank" rel="noopener noreferrer">
                        <svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-whatsapp"></use></svg>
                        Cotizar este servicio
                    </a>
                </article>

                <article class="service-panel reveal-on-scroll" data-service-index="6">
                    <div class="service-icon">
                        <svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-shield-alt"></use></svg>
                    </div>
                    <h3>Security &amp; Testing</h3>
                    <p>Implementación de mejores prácticas de seguridad, testing automatizado, TDD y cobertura completa de código.</p>
                    <ul class="service-features">
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> OWASP Compliance</li>
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> Unit &amp; Integration Tests</li>
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> TDD &amp; BDD</li>
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> Security Audits</li>
                    </ul>
                    <div class="service-tech">
                        <code>PyTest</code>
                        <code>Selenium</code>
                    </div>
                    <a class="service-panel-cta" href="https://wa.me/573173907301?text=Hola%2C%20quiero%20cotizar%20un%20servicio%20de%20Security%20%26%20Testing.%20%C2%BFMe%20pueden%20ayudar%3F" target="_blank" rel="noopener noreferrer">
                        <svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-whatsapp"></use></svg>
                        Cotizar este servicio
                    </a>
                </article>

                <article class="service-panel reveal-on-scroll" data-service-index="7">
                    <div class="service-icon">
                        <svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-chart-line"></use></svg>
                    </div>
                    <h3>Data Engineering &amp; ML</h3>
                    <p>Pipelines de datos, procesamiento ETL, análisis avanzado y modelos de machine learning en producción.</p>
                    <ul class="service-features">
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> ETL Pipelines</li>
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> Big Data Processing</li>
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> ML Model Deploy</li>
                        <li><svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-check"></use></svg> Real-time Analytics</li>
                    </ul>
                    <div class="service-tech">
                        <code>Pandas</code>
                        <code>Spark</code>
                        <code>TensorFlow</code>
                    </div>
                    <a class="service-panel-cta" href="https://wa.me/573173907301?text=Hola%2C%20quiero%20cotizar%20un%20servicio%20de%20Data%20Engineering%20%26%20ML.%20%C2%BFMe%20pueden%20ayudar%3F" target="_blank" rel="noopener noreferrer">
                        <svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-whatsapp"></use></svg>
                        Cotizar este servicio
                    </a>
                </article>
            </div>

            <div class="services-indicators" hidden></div>
```

**Nota de implementación:** verificar si `icons/sprite.svg` ya tiene `icon-whatsapp` (la Fase 1/anteriores pudieron haberlo añadido para el botón flotante). Si no existe, usar `icon-check` como ícono temporal del CTA en vez de inventar un símbolo — no es un requisito visual crítico del spec, es un detalle menor; dejarlo registrado como ruling si aplica.

- [ ] **Step 3: Agregar `services-scene.css` al `<head>` y `services-scene.js` antes de `</body>`**

Junto a los `<link>`/`<script>` de `hero-scene.*` ya existentes:

```html
    <link rel="stylesheet" href="services-scene.min.css">
```
```html
    <script type="module" src="services-scene.min.js"></script>
```

- [ ] **Step 4: Verificar que las pruebas backend no se rompieron**

Run: `.\.venv\Scripts\python.exe -m pytest -q`
Expected: PASS, mismo conteo que antes (10/10 o el conteo vigente)

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: reestructura #servicios a artículos planos con CTA de WhatsApp por servicio"
```

---

### Task 4: CSS base (lista plana, mobile, reduced-motion) + axe limpio

**Files:**
- Create: `services-scene.css`
- Modify: `styles.css` solo si `.services-grid`/`.service-card` quedan sin ningún otro uso (buscar antes de borrar)

**Interfaces:**
- Produces: clases CSS que Task 6 extenderá con las reglas `[data-scene="rail"]`: `.services-panels` (grid/flex vertical por defecto), `.service-panel`, `.service-panel-cta`, `.services-indicators`.

- [ ] **Step 1: Buscar otros usos de `.services-grid`/`.service-card` antes de tocar `styles.css`**

Run: `grep -rn "services-grid\|service-card" --include=*.css --include=*.js .`
Expected: solo apariciones dentro de `styles.css` (nada en JS); si `byteo.js` las referenciara (p. ej. `getProtectedRects()`), anotarlo para Task 9.

- [ ] **Step 2: Escribir `services-scene.css`**

```css
/* Estado base: lista plana vertical — esto es lo que ve cualquiera sin
   JS, en móvil, y con prefers-reduced-motion. initServicesScene() (Task 5)
   solo AÑADE [data-scene="rail"] a .services cuando decide mejorar; sin
   ese atributo, ninguna regla de pineo/riel siguiente en este archivo
   se activa. */
.services-panels {
    display: grid;
    gap: 2rem;
    margin-top: 2rem;
}

.service-panel {
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 12px;
    padding: 2rem;
    background: var(--card-bg, #fff);
}

.service-panel h3 {
    margin-top: 0;
}

.service-panel-cta {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1.5rem;
    padding: 0.6rem 1.2rem;
    border-radius: 8px;
    background: var(--primary-color);
    color: #fff;
    text-decoration: none;
    font-weight: 600;
}

.service-panel-cta:hover,
.service-panel-cta:focus-visible {
    filter: brightness(1.1);
}

.services-indicators {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1.5rem;
}

.services-indicators[hidden] {
    display: none;
}

.services-indicator {
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: 999px;
    padding: 0.4rem 0.9rem;
    background: transparent;
    color: inherit;
    font-size: 0.85rem;
    cursor: pointer;
}

.services-indicator[aria-current="true"] {
    border-color: var(--primary-color);
    color: var(--primary-text);
    font-weight: 600;
}

@media (min-width: 1024px) {
    /* Nada se activa aquí todavía sin [data-scene="rail"] — Task 6 añade
       las reglas de riel pineado bajo ese selector. Este bloque queda
       deliberadamente vacío como punto de anclaje documentado. */
}
```

- [ ] **Step 3: Correr axe sobre `#servicios` en su estado base**

Run: `npx playwright test accessibility`
Expected: PASS — 0 violaciones "serious"/"critical" nuevas

- [ ] **Step 4: Commit**

```bash
git add services-scene.css
git commit -m "feat: estilos base de panel de servicio (lista plana, mobile y reduced-motion por defecto)"
```

---

### Task 5: `initServicesScene()` — decisión de mejora vs. bypass, y reversión en resize

**Files:**
- Modify: `services-scene.js` (añadir la orquestación, además de las funciones puras de Task 2)
- Create: `tests/e2e/services-scene.spec.js` (primeras pruebas: bypass en móvil/reduced-motion, construcción en escritorio, reversión en resize)

**Interfaces:**
- Consumes: `registerScrollRegion`, `clampProgress` (Task 1); `computeScrubProgress`, `computeScrubIndex`, `computePanelDistance`, `computeTargetScrollTop` (Task 2); DOM de Task 3 (`.services-panels > .service-panel`, `.services-indicators`).
- Produces: `export function initServicesScene()`; dataset `services.dataset.scene = 'rail' | undefined`; evento global `window.__servicesSceneDebug = { enhanced: boolean }` (para que las pruebas e2e puedan verificar el estado sin inspeccionar CSS computado, mismo patrón que `window.__heroSceneDebug`).

- [ ] **Step 1: Escribir las pruebas e2e fallidas (subset de bypass/construcción)**

```js
// tests/e2e/services-scene.spec.js (fragmento inicial; Task 7 añade el resto)
import { test, expect } from '@playwright/test';

test.describe('Transición B — decisión de mejora', () => {
  test('en viewport de escritorio sin reduced-motion, la sección se mejora a riel', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.__servicesSceneDebug?.enhanced)).toBe(true);
    await expect(page.locator('#servicios')).toHaveAttribute('data-scene', 'rail');
  });

  test('en viewport móvil, la sección NO se mejora', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.__servicesSceneDebug?.enhanced)).toBe(false);
    await expect(page.locator('#servicios')).not.toHaveAttribute('data-scene', 'rail');
  });

  test('con prefers-reduced-motion, la sección NO se mejora aunque el viewport sea de escritorio', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.__servicesSceneDebug?.enhanced)).toBe(false);
  });

  test('redimensionar en vivo de escritorio a móvil revierte la mejora', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => window.__servicesSceneDebug?.enhanced)).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await expect.poll(() => page.evaluate(() => window.__servicesSceneDebug?.enhanced)).toBe(false);
    // Los 8 paneles deben seguir presentes y legibles tras revertir
    await expect(page.locator('.service-panel')).toHaveCount(8);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx playwright test services-scene`
Expected: FAIL — `window.__servicesSceneDebug` es `undefined` (la función no existe todavía)

- [ ] **Step 3: Implementar `initServicesScene()`**

```js
// Añadir a services-scene.js, debajo de las funciones puras de Task 2:
import { registerScrollRegion } from './scroll-progress.js';

const DESKTOP_QUERY = '(min-width: 1024px)';
const SCRUB_VH_PER_PANEL = 55;

export function initServicesScene() {
  const section = document.getElementById('servicios');
  if (!section) return null;
  const panelsContainer = section.querySelector('.services-panels');
  const indicatorsContainer = section.querySelector('.services-indicators');
  const panels = Array.from(panelsContainer.querySelectorAll('.service-panel'));
  const count = panels.length;

  window.__servicesSceneDebug = { enhanced: false };

  const desktopQuery = window.matchMedia(DESKTOP_QUERY);
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  let wrapper = null;
  let stage = null;
  let rail = null;
  let scrollHandle = null;

  function shouldEnhance() {
    return desktopQuery.matches && !reducedMotionQuery.matches;
  }

  function buildIndicators() {
    indicatorsContainer.innerHTML = '';
    indicatorsContainer.toggleAttribute('hidden', false);
    panels.forEach((panel, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'services-indicator';
      button.textContent = panel.querySelector('h3').textContent;
      button.addEventListener('click', () => jumpToPanel(index));
      indicatorsContainer.appendChild(button);
    });
  }

  function jumpToPanel(index) {
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const wrapperTop = window.scrollY + rect.top;
    const target = computeTargetScrollTop(index, wrapperTop, rect.height, window.innerHeight, count);
    window.scrollTo({ top: target, behavior: reducedMotionQuery.matches ? 'auto' : 'smooth' });
  }

  function updateScrub(rect, viewportHeight) {
    const progress = computeScrubProgress(rect, viewportHeight);
    const scrubIndex = computeScrubIndex(progress, count);
    section.style.setProperty('--services-progress', progress.toFixed(3));
    rail.style.setProperty('--services-scrub-index', scrubIndex.toFixed(3));
    panels.forEach((panel, index) => {
      panel.style.setProperty('--panel-distance', computePanelDistance(index, scrubIndex).toFixed(3));
    });
    const activeIndex = Math.round(scrubIndex);
    Array.from(indicatorsContainer.children).forEach((button, index) => {
      if (index === activeIndex) {
        button.setAttribute('aria-current', 'true');
      } else {
        button.removeAttribute('aria-current');
      }
    });
  }

  function enhance() {
    if (window.__servicesSceneDebug.enhanced) return;
    wrapper = document.createElement('div');
    wrapper.className = 'services-scrubber';
    wrapper.style.setProperty('--scrub-vh-per-panel', `${SCRUB_VH_PER_PANEL}vh`);
    wrapper.style.height = `calc(100vh + ${(count - 1) * SCRUB_VH_PER_PANEL}vh)`;

    stage = document.createElement('div');
    stage.className = 'services-stage';

    rail = document.createElement('div');
    rail.className = 'services-rail';

    panels.forEach((panel) => rail.appendChild(panel));
    stage.appendChild(rail);
    wrapper.appendChild(stage);
    panelsContainer.replaceWith(wrapper);

    buildIndicators();
    section.dataset.scene = 'rail';
    window.__servicesSceneDebug.enhanced = true;
    scrollHandle = registerScrollRegion(wrapper, updateScrub);
  }

  function revert() {
    if (!window.__servicesSceneDebug.enhanced) return;
    if (scrollHandle) scrollHandle.unregister();
    const freshPanelsContainer = document.createElement('div');
    freshPanelsContainer.className = 'services-panels';
    panels.forEach((panel) => {
      panel.style.removeProperty('--panel-distance');
      freshPanelsContainer.appendChild(panel);
    });
    wrapper.replaceWith(freshPanelsContainer);
    panelsContainer = freshPanelsContainer;
    indicatorsContainer.innerHTML = '';
    indicatorsContainer.toggleAttribute('hidden', true);
    delete section.dataset.scene;
    wrapper = null;
    stage = null;
    rail = null;
    window.__servicesSceneDebug.enhanced = false;
  }

  function sync() {
    if (shouldEnhance()) {
      enhance();
    } else {
      revert();
    }
  }

  sync();
  desktopQuery.addEventListener('change', sync);
  reducedMotionQuery.addEventListener('change', sync);
  window.addEventListener('resize', sync);

  return { jumpToPanel, sync };
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx playwright test services-scene`
Expected: PASS 4/4

- [ ] **Step 5: Añadir la llamada de arranque**

En `index.html`, dentro del mismo `<script type="module">` donde se llama `initHeroScene()` (o uno nuevo junto a él):

```html
    <script type="module">
      import { initHeroScene } from './hero-scene.min.js';
      import { initServicesScene } from './services-scene.min.js';
      initHeroScene();
      initServicesScene();
    </script>
```

(Ajustar según cómo esté estructurado el bootstrap actual — verificar el patrón real de `initHeroScene()` en `index.html` antes de duplicar un `<script type="module">`.)

- [ ] **Step 6: Commit**

```bash
git add services-scene.js tests/e2e/services-scene.spec.js index.html
git commit -m "feat: initServicesScene() decide mejora vs. bypass y revierte limpio en resize"
```

---

### Task 6: CSS del riel pineado — profundidad, tipografía, blur acotado, iluminación

**Files:**
- Modify: `services-scene.css` (añadir las reglas bajo `.services[data-scene="rail"]` / dentro del `@media (min-width: 1024px)`)

**Interfaces:**
- Consumes: `--services-progress`, `--services-scrub-index`, `--panel-distance` (escritas por Task 5).

- [ ] **Step 1: Escribir la prueba de rendimiento/blur acotado (fallida)**

```js
// Añadir a tests/e2e/services-scene.spec.js
test('nunca hay más de 2 paneles con filtro blur activo a la vez', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.mouse.wheel(0, 3000); // avanzar a un punto intermedio del recorrido
  await page.waitForTimeout(200);
  const blurredCount = await page.evaluate(() => {
    const panels = Array.from(document.querySelectorAll('.service-panel'));
    return panels.filter((panel) => getComputedStyle(panel).filter.includes('blur') && !getComputedStyle(panel).filter.includes('blur(0px)')).length;
  });
  expect(blurredCount).toBeLessThanOrEqual(2);
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx playwright test services-scene -g "blur"`
Expected: FAIL o PASS vacuo — sin CSS de riel todavía, `filter` nunca contiene `blur`, así que esta prueba en realidad pasaría trivialmente (0 ≤ 2). **Ruling esperado:** esto confirma que la prueba necesita forzar que SÍ haya blur en juego para ser significativa — ajustar antes de aceptarla como verde: forzar un punto de scroll donde el panel activo no sea el 0 ni el 7 (centro del recorrido), y afirmar también que al menos 1 panel SÍ tiene blur (para que la prueba no sea tautológica). Ver Step 2b.

- [ ] **Step 2b: Corregir la prueba para que no sea vacuamente verde**

Añadir después de `blurredCount`:
```js
  expect(blurredCount).toBeGreaterThan(0);
```
Re-run: `npx playwright test services-scene -g "blur"` → ahora debe FALLAR de verdad (0 ≤ 2 pero 0 > 0 es falso) hasta que exista el CSS de riel.

- [ ] **Step 3: Implementar el CSS del riel**

```css
/* Dentro de services-scene.css, reemplazando el bloque @media vacío de Task 4 */
@media (min-width: 1024px) {
    .services-scrubber {
        position: relative;
    }

    .services-stage {
        position: sticky;
        top: 0;
        height: 100vh;
        overflow: hidden;
        display: flex;
        align-items: center;
    }

    .services-rail {
        display: flex;
        gap: 3rem;
        width: 100%;
        justify-content: center;
        transform: translateX(calc(var(--services-scrub-index, 0) * -22rem));
        transition: transform 0.05s linear;
        will-change: transform;
    }

    [data-scene="rail"] .service-panel {
        flex: 0 0 20rem;
        transform: scale(calc(1 - min(var(--panel-distance, 0), 2) * 0.12));
        opacity: clamp(0.3, calc(1 - var(--panel-distance, 0) * 0.35), 1);
        transition: transform 0.05s linear, opacity 0.05s linear, filter 0.05s linear;
    }

    /* Blur acotado a los vecinos inmediatos (distancia 1-2): el panel
       activo (distancia 0) y todo lo que está a distancia > 2 nunca
       paga el costo de un filtro — como mucho 2-4 paneles (los dos
       vecinos a cada lado) tienen blur simultáneamente, nunca los 8. */
    [data-scene="rail"] .service-panel[style*="--panel-distance"] {
        filter: blur(0px);
    }

    [data-scene="rail"] .services-rail .service-panel {
        --blur-amount: clamp(0px, calc((var(--panel-distance, 0) - 1) * 3px), 6px);
        filter: blur(var(--blur-amount));
    }

    [data-scene="rail"] .service-panel h3 {
        clip-path: inset(0 calc(min(var(--panel-distance, 0), 1) * 60%) 0 0);
        letter-spacing: calc(0.02em + min(var(--panel-distance, 0), 1) * 0.08em);
        transition: clip-path 0.05s linear, letter-spacing 0.05s linear;
    }

    .services-progress-rail {
        position: fixed;
        bottom: 0;
        left: 0;
        height: 3px;
        background: var(--primary-color);
        width: calc(var(--services-progress, 0) * 100%);
    }
}
```

**Nota:** `--blur-amount` con `clamp()` produce 0px cuando `--panel-distance <= 1` y crece hasta 6px cuando `--panel-distance` se acerca a 3 — los paneles en el extremo opuesto del riel (distancia 5-7) llegan al tope de 6px, no siguen creciendo sin límite, y los que están a distancia 0-1 (el activo y su vecino más cercano) no tienen blur. Verificar en Step 4 que el conteo real de paneles con blur `> 0px` en un punto intermedio del scroll sea ≤ 2-4, ajustando la fórmula si el primer intento da más.

- [ ] **Step 4: Verificar que la prueba de blur acotado pasa, y que las demás pruebas de la sección siguen en verde**

Run: `npx playwright test services-scene`
Expected: PASS — incluida la prueba de blur corregida en Step 2b

- [ ] **Step 5: Commit**

```bash
git add services-scene.css tests/e2e/services-scene.spec.js
git commit -m "feat: profundidad/tipografía/blur acotado del riel; prueba de blur no-tautológica"
```

---

### Task 7: Suite e2e completa de Transición B (navegación, teclado, no-JS, scroll atrás, no-scroll-horizontal, continuidad)

**Files:**
- Modify: `tests/e2e/services-scene.spec.js` (completar con el resto de casos del spec)

- [ ] **Step 1: Añadir y verificar en rojo, uno por uno, cada caso nuevo**

```js
test.describe('Transición B — navegación y accesibilidad', () => {
  test('scroll hacia adelante y luego hacia atrás reproduce los mismos estados en reversa', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(200);
    const forwardIndex = await page.evaluate(() =>
      Math.round(parseFloat(document.querySelector('.services-rail').style.getPropertyValue('--services-scrub-index')))
    );
    await page.mouse.wheel(0, -3000);
    await page.waitForTimeout(200);
    const backwardIndex = await page.evaluate(() =>
      Math.round(parseFloat(document.querySelector('.services-rail').style.getPropertyValue('--services-scrub-index')))
    );
    expect(forwardIndex).toBeGreaterThan(0);
    expect(backwardIndex).toBeLessThan(forwardIndex);
  });

  test('click en un indicador salta directamente al panel correspondiente', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const lastIndicator = page.locator('.services-indicator').last();
    await lastIndicator.click();
    await expect.poll(async () =>
      page.evaluate(() => Math.round(parseFloat(document.querySelector('.services-rail').style.getPropertyValue('--services-scrub-index'))))
    ).toBe(7);
  });

  test('los 8 indicadores son alcanzables y activables por teclado', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const indicators = page.locator('.services-indicator');
    await indicators.first().focus();
    for (let i = 0; i < 7; i += 1) {
      await page.keyboard.press('Tab');
    }
    await page.keyboard.press('Enter');
    await expect.poll(async () =>
      page.evaluate(() => Math.round(parseFloat(document.querySelector('.services-rail').style.getPropertyValue('--services-scrub-index'))))
    ).toBeGreaterThan(0);
  });

  test('con JavaScript deshabilitado, los 8 servicios son legibles con su CTA funcional', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('.service-panel')).toHaveCount(8);
    const firstCta = page.locator('.service-panel-cta').first();
    await expect(firstCta).toHaveAttribute('href', /wa\.me\/573173907301/);
    await context.close();
  });

  test('ningún viewport probado introduce scroll horizontal accidental', async ({ page }) => {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow).toBe(false);
    }
  });

  test('el primer panel ya está asentado cuando Transición A termina (continuidad)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.evaluate(() => {
      document.getElementById('inicio').scrollIntoView({ block: 'end' });
    });
    await page.waitForTimeout(200);
    const firstPanelDistance = await page.evaluate(() => {
      const panel = document.querySelector('.service-panel[data-service-index="0"]');
      return parseFloat(getComputedStyle(panel).opacity);
    });
    expect(firstPanelDistance).toBeGreaterThan(0.9);
  });
});
```

Run cada bloque nuevo individualmente antes de darlo por bueno: `npx playwright test services-scene -g "<nombre del test>"`
Expected: cada uno FALLA primero por la razón correcta (p. ej. "locator not found" o aserción falsa), luego PASA tras cualquier ajuste necesario de implementación — no ajustar la prueba para que pase si la causa es una regla CSS/JS faltante; corregir la implementación.

- [ ] **Step 2: Correr la suite completa de `services-scene.spec.js`**

Run: `npx playwright test services-scene`
Expected: PASS, todos los tests (los de Task 5, 6 y 7 juntos)

- [ ] **Step 3: Confirmar que la suite de `hero-scene.spec.js` sigue intacta**

Run: `npx playwright test hero-scene`
Expected: PASS, mismo conteo que en Fase 1 — ninguna aserción tocada

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/services-scene.spec.js
git commit -m "test: suite completa de Transición B — navegación, teclado, no-JS, scroll atrás, continuidad"
```

---

### Task 8: Build, lint, config de publicación

**Files:**
- Modify: `app.py` (`_PUBLIC_FILES`, exempt si aplica)
- Modify: `.github/scripts/production-files.mjs` (`PUBLISH_FILES`, `FORBIDDEN`)
- Modify: `eslint.config.js` (override `sourceType: 'module'` para los 2 archivos nuevos)
- Modify: `package.json` (`build:css`, `build:js`, `test:unit` glob ya cubre `tests/unit/*.test.mjs` — confirmar que no hace falta tocarlo)

- [ ] **Step 1: Ejecutar build y lint para descubrir qué falta**

Run: `npm run build && npm run lint:js && npm run lint:css`
Expected: falla o advierte sobre `services-scene.js`/`scroll-progress.js`/`services-scene.css` no reconocidos en alguna config — leer el error exacto antes de editar

- [ ] **Step 2: Añadir las entradas que el Step 1 indique**

En `app.py`, junto a las líneas de Fase 1:
```python
_PUBLIC_FILES |= {"services-scene.min.css", "services-scene.min.js", "scroll-progress.min.js"}
```

En `.github/scripts/production-files.mjs`:
```js
// PUBLISH_FILES
'services-scene.min.css', 'services-scene.min.js', 'scroll-progress.min.js',
// FORBIDDEN
'services-scene.css', 'services-scene.js', 'scroll-progress.js',
```

En `eslint.config.js`:
```js
{ files: ['services-scene.js', 'scroll-progress.js'], languageOptions: { sourceType: 'module' } },
```

En `package.json`, añadir los 2 archivos nuevos a los globs de `build:css`/`build:js` igual que `hero-scene.*`.

- [ ] **Step 3: Re-ejecutar build/lint hasta verde**

Run: `npm run build && npm run lint:js && npm run lint:css && npm run format:check`
Expected: PASS, 0 problemas

- [ ] **Step 4: Commit**

```bash
git add app.py .github/scripts/production-files.mjs eslint.config.js package.json services-scene.min.css services-scene.min.js scroll-progress.min.js hero-scene.min.js
git commit -m "build: publica services-scene.* y scroll-progress.*; regenera minificados"
```

---

### Task 9: Verificación cruzada con Byteo y revisión visual con Playwright

**Files:**
- Modify: `byteo.js` solo si Task 4/Step 1 encontró una referencia real a `.service-card`/`.services-grid`
- Create (scratch, no commit): `evidence/capture-evidence-fase2.mjs`

- [ ] **Step 1: Confirmar si Byteo necesita ajuste**

Run: `npx playwright test byteo`
Expected: PASS sin cambios — si falla, es porque `getProtectedRects()` dependía del marcado viejo; corregirlo con TDD (escribir la aserción que reproduzca el fallo, confirmar que falla, corregir, confirmar verde) antes de continuar.

- [ ] **Step 2: Capturar evidencia visual**

Escribir y ejecutar un script Playwright de captura (siguiendo el patrón de `evidence/capture-evidence.mjs` de la Fase 1): screenshots en viewport de escritorio en progreso 0% / ~35% / ~70% / 100% del recorrido de servicios (vía `page.mouse.wheel`), viewport móvil, y con `reducedMotion: 'reduce'`; grabar video si `recordVideo` está disponible en el contexto de Playwright usado. Guardar en `evidence/` (gitignored, igual que en Fase 1).

Run: `node evidence/capture-evidence-fase2.mjs`
Expected: genera las imágenes/video sin errores; revisar cada una manualmente antes de continuar — si algo se ve roto (texto cortado, blur excesivo, salto de layout), corregirlo con TDD antes de avanzar a Task 10.

- [ ] **Step 3: Commit (solo si Byteo requirió cambios de código; la evidencia no se commitea)**

```bash
git add byteo.js tests/e2e/byteo.spec.js 2>/dev/null
git commit -m "fix: Byteo evita la nueva estructura de #servicios" --allow-empty-message -q || true
```

(Omitir el commit si Byteo no necesitó cambios.)

---

### Task 10: Suite completa, documentación de rulings, PR y despliegue

- [ ] **Step 1: Correr toda la suite local**

Run:
```bash
node --test tests/unit/*.test.mjs
.\.venv\Scripts\python.exe -m pytest -q
npx playwright test
.\.venv\Scripts\python.exe -m bandit -r app.py
npm run lint:js && npm run lint:css && npm run format:check
```
Expected: todo en verde, incluyendo la suite completa de `hero-scene.spec.js` sin modificar.

- [ ] **Step 2: Revisión final de rama completa**

Dispatch de un revisor en un contexto fresco (modelo más capaz disponible) sobre el rango completo `master..HEAD`, con el spec y este plan como referencia, antes de considerar la Fase 2 terminada — igual que en la Fase 1. Re-gradar hallazgos, corregir Critical/Important con TDD en un solo pase, diferir Minor.

- [ ] **Step 3: Push, PR, CI**

```bash
git push -u origin feature/servicios-cinematico
gh pr create --title "feat: Transición B — filmstrip cinematográfico de servicios" --body "..."
gh pr checks <N> --watch
```

- [ ] **Step 4: Merge y despliegue**

Si CI está verde: mergear a `master`, verificar el workflow de GitHub Pages en el commit de merge, confirmar la URL pública.

- [ ] **Step 5: Limpieza**

Si todo quedó verde y mergeado: ofrecer borrar la rama remota/local (misma confirmación explícita que en Fase 1 — no asumir "sí" por defecto, aunque el usuario ya autorizó el resto del pipeline).
