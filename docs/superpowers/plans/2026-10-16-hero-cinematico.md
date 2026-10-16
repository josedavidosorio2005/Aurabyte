# Hero Cinematográfico + Transición A — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar `.hero-hologram` por una escena WebGL de partículas que
converge en el monograma de marca de Aurabyte, con interacción al cursor,
fallback SVG, y una transición de scroll (Transición A) que transforma la
escena hacia `#servicios` en vez de solo ocultar/mostrar secciones.

**Architecture:** Un único archivo `hero-scene.js` (ES module) con funciones
puras exportadas (geometría/proyección/easing, testeadas con `node --test`,
sin DOM) más una clase `ParticleNetwork` que posee el contexto WebGL y el
loop de render; se auto-inicializa al cargar en el navegador y expone
`window.AuraHeroScene` para el hook de tema. `hero-scene.css` acompaña con
el contenedor, el fallback SVG y las reglas de Transición A dirigidas por
la custom property `--hero-scene-progress`. Cambios puntuales en
`script.js` (fix del bucle perpetuo de la barra de progreso + limpieza de
código muerto) y `byteo.js` (zonas de exclusión del roam).

**Tech Stack:** WebGL1 (sin librerías), ES modules nativos (sin bundler),
`node --test` (runner nativo de Node, sin dependencia nueva) para las
funciones puras, Playwright para comportamiento end-to-end.

**Spec:** `docs/superpowers/specs/2026-10-16-cinematic-hero-transition-a-design.md`

## Global Constraints

- Cero dependencias nuevas de runtime (sin Three.js/GSAP/npm packages).
- Sin bundler: `hero-scene.js` se carga como `<script type="module">`, los
  demás scripts siguen siendo clásicos. Nada de esto cambia.
- Todo archivo fuente nuevo (`hero-scene.js`, `hero-scene.css`) debe pasar
  por `npm run build` antes de verse en producción (mismo patrón que
  `byteo.*`) — nunca se referencia el `.js`/`.css` sin minificar desde
  `index.html`.
- `hero-scene.js`/`.css` sin minificar NUNCA se publican — deben añadirse a
  `FORBIDDEN` en `.github/scripts/production-files.mjs`, igual que
  `script.js`/`byteo.js`/`styles.css`/`byteo.css` ya están.
- No se elimina ninguna prueba existente (36 actuales); no se reintroduce
  `minlength` nativo, `info@aurabyte.com`, `CORS(app)` sin restricción,
  `static_folder="."`, ni precios en la sección de servicios.
- `prefers-reduced-motion: reduce` siempre tiene efecto, sin importar
  soporte WebGL.
- Todo nuevo elemento oculto por JS debe usar `opacity` + `visibility`
  juntos si depende de contraste bajo axe-core (ver CLAUDE.md, violación de
  32 nodos del PR #3) — este plan evita el patrón por completo manteniendo
  el timing original de `.animate-fade-in*` sin tocarlo (ver Task 3).

## Review Focus

- **WebGL no disponible** (contextos headless/antiguos, o `getContext`
  mockeado): la escena debe degradar al SVG sin dejar un hueco vacío ni
  lanzar un error no capturado a consola. Cubierto en Task 2.
- **`prefers-reduced-motion: reduce` con WebGL disponible**: el usuario
  todavía ve el canvas (no el fallback SVG), pero sin la animación de
  ensamblaje ni el drift — debe quedar asentado casi de inmediato. Cubierto
  en Task 3.
- **Pestaña oculta o hero fuera de viewport durante mucho tiempo**: el loop
  de render debe estar realmente detenido (no solo invisible) — verificado
  leyendo un contador de frames expuesto para testing. Cubierto en Task 5.
- **Resize de viewport mid-sesión** (p. ej. rotar un móvil): el canvas y el
  cálculo de Transición A deben recalcular dimensiones, no quedarse con las
  del primer render. Cubierto en Tasks 2 y 5.
- **Byteo roaming hacia la esquina de WhatsApp o las CTAs del hero**: con
  el fix, ningún punto de destino muestreado debe solaparse con esos
  rects. Cubierto en Task 8.

---

### Task 0: Rama de trabajo

**Files:** ninguno (operación de git).

- [ ] **Step 1:** Confirmar árbol limpio y crear la rama desde `master`.

```bash
git status --short
git checkout -b feature/hero-cinematico
```

- [ ] **Step 2:** Confirmar la rama activa.

```bash
git branch --show-current
```

Expected: `feature/hero-cinematico`.

---

### Task 1: Geometría y matemática pura (testeable sin DOM)

**Files:**
- Create: `hero-scene.js` (solo la sección de funciones puras en este task)
- Create: `tests/unit/hero-scene-math.test.mjs`
- Modify: `package.json` (nuevo script `test:unit`)

**Interfaces:**
- Produces: `buildMonogramGeometry(count, depth = 0.6)` → `{ points: {x,y,z,isCore}[], edges: [number,number][] }`;
  `lerp(a, b, t)`; `easeInOutCubic(t)`; `projectPoint(point, canvasWidth, canvasHeight, focalLength = 2.2)` → `{x, y, scale}`;
  `pickDeviceTier({hardwareConcurrency, viewportWidth})` → `{particleCount, dprCap}`;
  `computeDispersedPositions(points, target, spread = 1.4)` → `{x,y,z}[]`.

- [ ] **Step 1: Escribir las pruebas (deben fallar: el módulo no existe)**

`tests/unit/hero-scene-math.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMonogramGeometry,
  lerp,
  easeInOutCubic,
  projectPoint,
  pickDeviceTier,
  computeDispersedPositions,
} from '../../hero-scene.js';

test('buildMonogramGeometry devuelve exactamente `count` puntos', () => {
  const geometry = buildMonogramGeometry(51);
  assert.equal(geometry.points.length, 51);
});

test('buildMonogramGeometry marca exactamente un punto núcleo para counts impares', () => {
  const geometry = buildMonogramGeometry(51);
  const coreCount = geometry.points.filter((p) => p.isCore).length;
  assert.equal(coreCount, 1);
});

test('buildMonogramGeometry mantiene los puntos dentro de un volumen razonable', () => {
  const geometry = buildMonogramGeometry(91);
  geometry.points.forEach((p) => {
    assert.ok(Math.abs(p.x) <= 3, `x fuera de rango: ${p.x}`);
    assert.ok(Math.abs(p.y) <= 3, `y fuera de rango: ${p.y}`);
    assert.ok(Math.abs(p.z) <= 1, `z fuera de rango: ${p.z}`);
  });
});

test('buildMonogramGeometry solo referencia índices válidos en edges', () => {
  const geometry = buildMonogramGeometry(151);
  geometry.edges.forEach(([a, b]) => {
    assert.ok(a >= 0 && a < geometry.points.length);
    assert.ok(b >= 0 && b < geometry.points.length);
  });
});

test('lerp interpola linealmente', () => {
  assert.equal(lerp(0, 10, 0.5), 5);
  assert.equal(lerp(10, 20, 0), 10);
  assert.equal(lerp(10, 20, 1), 20);
});

test('easeInOutCubic es simétrica en 0, 0.5 y 1', () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(0.5), 0.5);
  assert.equal(easeInOutCubic(1), 1);
});

test('projectPoint centra un punto en el origen en el centro del canvas', () => {
  const projected = projectPoint({ x: 0, y: 0, z: 0 }, 800, 600);
  assert.equal(projected.x, 400);
  assert.equal(projected.y, 300);
});

test('pickDeviceTier reduce partículas en viewports angostos o CPUs limitadas', () => {
  const low = pickDeviceTier({ hardwareConcurrency: 2, viewportWidth: 360 });
  const high = pickDeviceTier({ hardwareConcurrency: 8, viewportWidth: 1920 });
  assert.ok(low.particleCount < high.particleCount);
  assert.ok(low.dprCap <= high.dprCap);
});

test('computeDispersedPositions devuelve un punto por cada entrada, con valores finitos', () => {
  const geometry = buildMonogramGeometry(51);
  const dispersed = computeDispersedPositions(geometry.points, { x: 2, y: 0 });
  assert.equal(dispersed.length, geometry.points.length);
  dispersed.forEach((p) => {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  });
});
```

- [ ] **Step 2: Añadir el script de pruebas unitarias a `package.json`**

```json
"test:unit": "node --test tests/unit/"
```

- [ ] **Step 3: Ejecutar y confirmar que falla**

```bash
npm run test:unit
```

Expected: FAIL — `Cannot find module '../../hero-scene.js'` (el archivo no existe todavía).

- [ ] **Step 4: Crear `hero-scene.js` con las funciones puras**

```js
// hero-scene.js
// Geometría muestreada directamente del triángulo "A" de logo.svg (mismos
// puntos que logo.svg:10 y el brillo de logo.svg:13) — la constelación de
// partículas converge en la marca real, no en una forma inventada.
const MONOGRAM_OUTLINE_2D = [
  [15, 45], [30, 15], [45, 45], [38, 45], [30, 28], [22, 45],
];
const MONOGRAM_SPARKLE_2D = [32, 18];
const MONOGRAM_SCALE = 1 / 15;

function toLocalSpace([x, y], cx, cy) {
  // Y se invierte: en SVG crece hacia abajo, en la escena "arriba" es positivo.
  return [(x - cx) * MONOGRAM_SCALE, (cy - y) * MONOGRAM_SCALE];
}

function monogramCenter() {
  const cx = MONOGRAM_OUTLINE_2D.reduce((sum, p) => sum + p[0], 0) / MONOGRAM_OUTLINE_2D.length;
  const cy = MONOGRAM_OUTLINE_2D.reduce((sum, p) => sum + p[1], 0) / MONOGRAM_OUTLINE_2D.length;
  return [cx, cy];
}

function samplePerimeter(points2D, count) {
  const edgeLengths = points2D.map((p, i) => {
    const next = points2D[(i + 1) % points2D.length];
    return Math.hypot(next[0] - p[0], next[1] - p[1]);
  });
  const perimeter = edgeLengths.reduce((a, b) => a + b, 0);
  const step = perimeter / count;
  const result = [];
  let edgeIndex = 0;
  let traveled = 0;
  for (let i = 0; i < count; i += 1) {
    const targetDistance = i * step;
    while (traveled + edgeLengths[edgeIndex] < targetDistance && edgeIndex < points2D.length - 1) {
      traveled += edgeLengths[edgeIndex];
      edgeIndex += 1;
    }
    const a = points2D[edgeIndex];
    const b = points2D[(edgeIndex + 1) % points2D.length];
    const edgeLen = edgeLengths[edgeIndex] || 1;
    const t = (targetDistance - traveled) / edgeLen;
    result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return result;
}

export function buildMonogramGeometry(count, depth = 0.6) {
  const [cx, cy] = monogramCenter();
  const outlineLocal = MONOGRAM_OUTLINE_2D.map((p) => toLocalSpace(p, cx, cy));
  const sparkleLocal = toLocalSpace(MONOGRAM_SPARKLE_2D, cx, cy);

  const perFace = Math.max(1, Math.floor((count - 1) / 2));
  const outline = samplePerimeter(outlineLocal, perFace);

  const points = [{ x: sparkleLocal[0], y: sparkleLocal[1], z: 0, isCore: true }];
  const edges = [];
  const coreIndex = 0;

  const frontStart = points.length;
  outline.forEach(([x, y]) => points.push({ x, y, z: depth / 2, isCore: false }));
  const backStart = points.length;
  outline.forEach(([x, y]) => points.push({ x, y, z: -depth / 2, isCore: false }));

  for (let i = 0; i < perFace; i += 1) {
    const next = (i + 1) % perFace;
    edges.push([frontStart + i, frontStart + next]);
    edges.push([backStart + i, backStart + next]);
    if (i % 3 === 0) edges.push([frontStart + i, backStart + i]);
    if (i % 5 === 0) edges.push([coreIndex, frontStart + i]);
  }

  // count par: sobra un cupo respecto a 2*perFace+1 — se añade un segundo
  // punto núcleo (misma posición, z distinta) en vez de desperdiciarlo.
  while (points.length < count) {
    points.push({ x: sparkleLocal[0], y: sparkleLocal[1], z: depth / 4, isCore: true });
  }

  return { points, edges };
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

export function projectPoint(point, canvasWidth, canvasHeight, focalLength = 2.2) {
  const scale = focalLength / (focalLength + point.z);
  return {
    x: canvasWidth / 2 + point.x * scale * (canvasHeight / 2),
    y: canvasHeight / 2 - point.y * scale * (canvasHeight / 2),
    scale,
  };
}

export function pickDeviceTier({ hardwareConcurrency = 4, viewportWidth = 1280 } = {}) {
  if (viewportWidth < 480 || hardwareConcurrency <= 2) {
    return { particleCount: 51, dprCap: 1 };
  }
  if (viewportWidth < 1024 || hardwareConcurrency <= 4) {
    return { particleCount: 91, dprCap: 1.5 };
  }
  return { particleCount: 151, dprCap: 2 };
}

export function computeDispersedPositions(points, target, spread = 1.4) {
  return points.map((point, index) => {
    const angle = (index / points.length) * Math.PI * 2;
    return {
      x: target.x + Math.cos(angle) * spread,
      y: target.y + Math.sin(angle) * spread * 0.4,
      z: point.z,
    };
  });
}
```

- [ ] **Step 5: Ejecutar y confirmar que pasa**

```bash
npm run test:unit
```

Expected: PASS — 9 pruebas.

- [ ] **Step 6: Commit**

```bash
git add hero-scene.js tests/unit/hero-scene-math.test.mjs package.json
git commit -m "feat: geometría y matemática pura de la escena del hero (testeada con node --test)"
```

---

### Task 2: Bootstrap WebGL, detección de capacidades y fallback SVG

**Files:**
- Modify: `hero-scene.js` (añade shaders, `ParticleNetwork` (constructor, `resize`, capacidad), `initHeroScene`)
- Create: `hero-scene.css`
- Modify: `index.html:122-126` (reemplaza `.hero-hologram`)
- Test: `tests/e2e/hero-scene.spec.js`

**Interfaces:**
- Consumes: `buildMonogramGeometry`, `pickDeviceTier` de Task 1.
- Produces: `initHeroScene()` (efecto de montaje, no exportado para tests
  de Node — se prueba vía Playwright); `window.AuraHeroScene` con
  `{ setThemeColors(), pause(), resume() }`.

- [ ] **Step 1: Escribir la prueba e2e (debe fallar: no existe el markup nuevo)**

`tests/e2e/hero-scene.spec.js`:

```js
import { expect, test } from '@playwright/test';

test.describe('Escena del hero', () => {
  test('muestra el canvas WebGL cuando está disponible y oculta el fallback', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.hero-scene-canvas')).toBeVisible();
    await expect(page.locator('.hero-scene-fallback')).toBeHidden();
  });

  test('degrada al fallback SVG sin errores de consola cuando WebGL no está disponible', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = function (type) {
        if (type === 'webgl') return null;
        return null;
      };
    });
    await page.goto('/');
    await expect(page.locator('.hero-scene-fallback')).toBeVisible();
    await expect(page.locator('.hero-scene-canvas')).toBeHidden();
    expect(consoleErrors).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

```bash
npx playwright test hero-scene --project=chromium
```

Expected: FAIL — `.hero-scene-canvas` no existe en el DOM todavía.

- [ ] **Step 3: Reemplazar el markup del hológrama en `index.html:122-126`**

Reemplazar:

```html
<div class="hero-hologram" aria-hidden="true">
    <div class="hero-hologram-ring"></div>
    <div class="hero-hologram-core"><img src="logo.svg" width="92" height="92" alt=""></div>
</div>
```

por:

```html
<div class="hero-scene" data-hero-scene>
    <svg class="hero-scene-fallback" aria-hidden="true" viewBox="0 0 200 60" focusable="false">
        <defs>
            <linearGradient id="heroSceneGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#06b6d4" />
                <stop offset="100%" stop-color="#0ea5e9" />
            </linearGradient>
        </defs>
        <path class="hero-scene-fallback-shape" d="M 15 45 L 30 15 L 45 45 L 38 45 L 30 28 L 22 45 Z" fill="url(#heroSceneGradient)" />
        <circle class="hero-scene-fallback-spark" cx="32" cy="18" r="1.5" fill="#fff" />
    </svg>
    <canvas class="hero-scene-canvas" aria-hidden="true" hidden></canvas>
</div>
```

Y añadir, junto a `<link rel="stylesheet" href="byteo.min.css">` (línea 32):

```html
<link rel="stylesheet" href="hero-scene.min.css">
```

Y junto a `<script src="script.min.js"></script>` (línea 991), **antes** de `byteo.min.js`:

```html
<script type="module" src="hero-scene.min.js"></script>
```

- [ ] **Step 4: Crear `hero-scene.css`**

```css
.hero-scene {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
}

.hero-scene-fallback {
    width: 70%;
    max-width: 220px;
    filter: drop-shadow(0 0 18px rgba(14, 165, 233, 0.45));
}

.hero-scene-fallback-shape {
    animation: hero-scene-pulse 2.6s ease-in-out infinite;
}

.hero-scene-fallback-spark {
    animation: hero-scene-spark 2s ease-in-out infinite;
}

@keyframes hero-scene-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.75; }
}

@keyframes hero-scene-spark {
    0%, 100% { opacity: 0.9; }
    50% { opacity: 0.3; }
}

.hero-scene-canvas {
    width: 100%;
    height: 100%;
}

@media (prefers-reduced-motion: reduce) {
    .hero-scene-fallback-shape,
    .hero-scene-fallback-spark {
        animation: none;
    }
}
```

- [ ] **Step 5: Añadir a `hero-scene.js` los shaders, `ParticleNetwork` (parcial) e `initHeroScene`**

Añadir después de las funciones puras de Task 1:

```js
const ASSEMBLE_DURATION_MS = 1600;

const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute float a_pointSize;
  attribute vec4 a_color;
  uniform vec2 u_resolution;
  varying vec4 v_color;
  void main() {
    vec2 clip = (a_position / u_resolution * 2.0 - 1.0) * vec2(1.0, -1.0);
    gl_Position = vec4(clip, 0.0, 1.0);
    gl_PointSize = a_pointSize;
    v_color = a_color;
  }
`;

const FRAGMENT_SHADER_POINTS = `
  precision mediump float;
  varying vec4 v_color;
  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float alpha = smoothstep(0.5, 0.0, length(c)) * v_color.a;
    gl_FragColor = vec4(v_color.rgb, alpha);
  }
`;

const FRAGMENT_SHADER_LINES = `
  precision mediump float;
  varying vec4 v_color;
  void main() {
    gl_FragColor = v_color;
  }
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Error compilando shader: ${info}`);
  }
  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Error enlazando programa WebGL: ${info}`);
  }
  return program;
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '').trim();
  const value = normalized.length === 3
    ? normalized.split('').map((c) => c + c).join('')
    : normalized;
  const int = parseInt(value, 16) || 0x0ea5e9;
  return { r: ((int >> 16) & 255) / 255, g: ((int >> 8) & 255) / 255, b: (int & 255) / 255 };
}

function readThemeColors() {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim();
  return hexToRgb(value || '#0ea5e9');
}

class ParticleNetwork {
  constructor(canvas, geometry, tier) {
    this.canvas = canvas;
    this.geometry = geometry;
    this.tier = tier;
    this.gl = canvas.getContext('webgl', { alpha: true, antialias: true });
    if (!this.gl) throw new Error('WebGL no disponible');

    this.pointProgram = createProgram(this.gl, VERTEX_SHADER, FRAGMENT_SHADER_POINTS);
    this.lineProgram = createProgram(this.gl, VERTEX_SHADER, FRAGMENT_SHADER_LINES);
    this.positionBuffer = this.gl.createBuffer();
    this.pointSizeBuffer = this.gl.createBuffer();
    this.colorBuffer = this.gl.createBuffer();
    this.linePositionBuffer = this.gl.createBuffer();
    this.lineColorBuffer = this.gl.createBuffer();

    this.color = readThemeColors();
    this.reducedMotion = false;
    this.running = false;
    this.startTime = null;
    this.transitionProgress = 0;
    this.pointerOffset = { x: 0, y: 0 };
    this.scatterOffsets = geometry.points.map(() => ({
      x: (Math.random() - 0.5) * 4,
      y: (Math.random() - 0.5) * 4,
      z: (Math.random() - 0.5) * 2,
      delay: Math.random() * 400,
    }));
    this.frame = this.frame.bind(this);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.tier.dprCap);
    const { clientWidth, clientHeight } = this.canvas;
    this.canvas.width = Math.max(1, Math.round(clientWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(clientHeight * dpr));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }
}

export function initHeroScene() {
  const container = document.querySelector('[data-hero-scene]');
  if (!container) return null;
  const canvas = container.querySelector('.hero-scene-canvas');
  const fallback = container.querySelector('.hero-scene-fallback');

  let network = null;
  try {
    const tier = pickDeviceTier({
      hardwareConcurrency: navigator.hardwareConcurrency,
      viewportWidth: window.innerWidth,
    });
    const geometry = buildMonogramGeometry(tier.particleCount);
    network = new ParticleNetwork(canvas, geometry, tier);
  } catch (error) {
    network = null;
  }

  if (!network) {
    fallback.hidden = false;
    canvas.hidden = true;
    return { setThemeColors() {}, pause() {}, resume() {} };
  }

  fallback.hidden = true;
  canvas.hidden = false;
  network.resize();
  window.addEventListener('resize', () => network.resize());

  const api = { setThemeColors() {}, pause() {}, resume() {} };
  window.AuraHeroScene = api;
  return { network, api };
}

if (typeof window !== 'undefined' && window.document) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeroScene);
  } else {
    initHeroScene();
  }
}
```

(El render loop real, la animación de ensamblaje y la Transición A se añaden
en Tasks 3-5 — aquí solo se resuelve detección + fallback + resize, por eso
el canvas se ve estático/negro momentáneamente en este punto; es esperado y
se corrige en el siguiente task.)

- [ ] **Step 6: Añadir `hero-scene.js`/`hero-scene.css` al build**

En `package.json`, modificar `build:css` y `build:js`:

```json
"build:css": "lightningcss --minify --output-file=styles.min.css styles.css && lightningcss --minify --output-file=byteo.min.css byteo.css && lightningcss --minify --output-file=hero-scene.min.css hero-scene.css",
"build:js": "terser script.js -c -m -o script.min.js && terser byteo.js -c -m -o byteo.min.js && terser hero-scene.js -c -m -o hero-scene.min.js --module",
```

(`--module` en terser preserva la sintaxis `export`/ESM al minificar.)

- [ ] **Step 7: Añadir los archivos a los allowlists de publicación**

En `.github/scripts/production-files.mjs`, añadir a `PUBLISH_FILES`:

```js
'hero-scene.min.css',
'hero-scene.min.js',
```

y a `FORBIDDEN`:

```js
'hero-scene.js',
'hero-scene.css',
```

En `app.py`, añadir a `_PUBLIC_FILES` (línea ~126):

```python
"hero-scene.min.css",
"hero-scene.min.js",
```

- [ ] **Step 8: Build y ejecutar la prueba e2e**

```bash
npm run build
npx playwright test hero-scene --project=chromium
```

Expected: PASS — 2 pruebas.

- [ ] **Step 9: Commit**

```bash
git add hero-scene.js hero-scene.css index.html package.json .github/scripts/production-files.mjs app.py tests/e2e/hero-scene.spec.js
git commit -m "feat: bootstrap WebGL de la escena del hero con fallback SVG sin WebGL"
```

---

### Task 3: Render loop, ensamblaje de entrada y `prefers-reduced-motion`

**Files:**
- Modify: `hero-scene.js` (`ParticleNetwork.start/pause/resume/frame/render/drawPoints/drawLines/snapToSettled`, actualizar `initHeroScene`)
- Test: `tests/e2e/hero-scene.spec.js` (añade casos)

**Interfaces:**
- Consumes: `lerp`, `easeInOutCubic`, `projectPoint` (Task 1); `ParticleNetwork` (Task 2).
- Produces: `network.start()`, `network.pause()`, `network.resume()`,
  `network.snapToSettled()`; exposición en `window.__heroSceneDebug` (solo
  para testing) con `{ frameCount, running }`.

- [ ] **Step 1: Escribir las pruebas (deben fallar: aún no se anima nada)**

Añadir a `tests/e2e/hero-scene.spec.js`:

```js
test('con reduced-motion, la escena queda asentada de inmediato (sin fase de ensamblaje)', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  await page.waitForTimeout(100);
  const frameCountEarly = await page.evaluate(() => window.__heroSceneDebug?.frameCount ?? 0);
  expect(frameCountEarly).toBeGreaterThan(0);
  await context.close();
});

test('la escena sigue renderizando frames mientras está en pantalla', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(50);
  const first = await page.evaluate(() => window.__heroSceneDebug.frameCount);
  await page.waitForTimeout(200);
  const second = await page.evaluate(() => window.__heroSceneDebug.frameCount);
  expect(second).toBeGreaterThan(first);
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

```bash
npx playwright test hero-scene --project=chromium
```

Expected: FAIL — `window.__heroSceneDebug` es `undefined`.

- [ ] **Step 3: Añadir el render loop a `ParticleNetwork`**

Añadir estos métodos dentro de la clase `ParticleNetwork` (después de `resize()`):

```js
  start() {
    if (this.running) return;
    this.running = true;
    this.startTime = this.startTime ?? performance.now();
    requestAnimationFrame(this.frame);
  }

  pause() {
    this.running = false;
  }

  resume() {
    if (this.running) return;
    this.start();
  }

  snapToSettled() {
    this.reducedMotion = true;
    this.startTime = performance.now() - ASSEMBLE_DURATION_MS - 1;
  }

  setPointerOffset(x, y) {
    this.pointerOffset = { x, y };
  }

  setTransitionProgress(progress) {
    this.transitionProgress = Math.min(1, Math.max(0, progress));
  }

  frame(now) {
    if (!this.running) return;
    this.render(now);
    window.__heroSceneDebug.frameCount += 1;
    requestAnimationFrame(this.frame);
  }

  render(now) {
    const gl = this.gl;
    const elapsed = now - this.startTime;
    const width = this.canvas.width;
    const height = this.canvas.height;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const projected = this.geometry.points.map((point, index) => {
      const scatter = this.scatterOffsets[index];
      const localProgress = this.reducedMotion
        ? 1
        : Math.min(1, Math.max(0, (elapsed - scatter.delay) / ASSEMBLE_DURATION_MS));
      const eased = easeInOutCubic(localProgress);
      const settledX = lerp(point.x, point.x + this.transitionProgress * 1.6, this.transitionProgress);
      const settledY = point.y - this.transitionProgress * 1.1;
      const driftX = this.reducedMotion ? 0 : Math.sin(now / 1800 + index) * 0.02;
      const driftY = this.reducedMotion ? 0 : Math.cos(now / 2200 + index) * 0.02;
      const x = lerp(point.x + scatter.x, settledX, eased) + driftX + this.pointerOffset.x * (1 - point.z);
      const y = lerp(point.y + scatter.y, settledY, eased) + driftY + this.pointerOffset.y * (1 - point.z);
      const z = lerp(point.z + scatter.z, point.z, eased);
      const proj = projectPoint({ x, y, z }, width, height);
      const alpha = (0.35 + 0.65 * eased) * (1 - this.transitionProgress * 0.8);
      return { ...proj, alpha, isCore: point.isCore };
    });

    this.drawLines(projected);
    this.drawPoints(projected, now);
  }

  drawPoints(projected, now) {
    const gl = this.gl;
    gl.useProgram(this.pointProgram);
    const positions = new Float32Array(projected.length * 2);
    const sizes = new Float32Array(projected.length);
    const colors = new Float32Array(projected.length * 4);
    projected.forEach((p, i) => {
      positions[i * 2] = p.x;
      positions[i * 2 + 1] = p.y;
      const pulse = p.isCore ? 0.6 + 0.4 * Math.sin(now / 300) : 1;
      sizes[i] = (p.isCore ? 7 : 3.5) * p.scale * pulse;
      colors[i * 4] = this.color.r;
      colors[i * 4 + 1] = this.color.g;
      colors[i * 4 + 2] = this.color.b;
      colors[i * 4 + 3] = p.isCore ? Math.min(1, p.alpha * 1.4) : p.alpha;
    });
    this.bindAttribute(this.pointProgram, this.positionBuffer, 'a_position', positions, 2);
    this.bindAttribute(this.pointProgram, this.pointSizeBuffer, 'a_pointSize', sizes, 1);
    this.bindAttribute(this.pointProgram, this.colorBuffer, 'a_color', colors, 4);
    gl.uniform2f(gl.getUniformLocation(this.pointProgram, 'u_resolution'), this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.POINTS, 0, projected.length);
  }

  drawLines(projected) {
    const gl = this.gl;
    gl.useProgram(this.lineProgram);
    const positions = new Float32Array(this.geometry.edges.length * 4);
    const colors = new Float32Array(this.geometry.edges.length * 8);
    this.geometry.edges.forEach(([aIndex, bIndex], i) => {
      const a = projected[aIndex];
      const b = projected[bIndex];
      positions[i * 4] = a.x;
      positions[i * 4 + 1] = a.y;
      positions[i * 4 + 2] = b.x;
      positions[i * 4 + 3] = b.y;
      const alpha = Math.min(a.alpha, b.alpha) * 0.5;
      [0, 1].forEach((v) => {
        colors[i * 8 + v * 4] = this.color.r;
        colors[i * 8 + v * 4 + 1] = this.color.g;
        colors[i * 8 + v * 4 + 2] = this.color.b;
        colors[i * 8 + v * 4 + 3] = alpha;
      });
    });
    this.bindAttribute(this.lineProgram, this.linePositionBuffer, 'a_position', positions, 2);
    this.bindAttribute(this.lineProgram, this.lineColorBuffer, 'a_color', colors, 4);
    gl.uniform2f(gl.getUniformLocation(this.lineProgram, 'u_resolution'), this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.LINES, 0, this.geometry.edges.length * 2);
  }

  bindAttribute(program, buffer, name, data, size) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    const location = gl.getAttribLocation(program, name);
    if (location === -1) return;
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  }
```

- [ ] **Step 4: Actualizar `initHeroScene` para detectar reduced-motion, iniciar el loop y exponer el contador de debug**

Reemplazar el cuerpo del `try` y lo que sigue en `initHeroScene` (de Task 2) por:

```js
export function initHeroScene() {
  window.__heroSceneDebug = { frameCount: 0, running: false };
  const container = document.querySelector('[data-hero-scene]');
  if (!container) return null;
  const canvas = container.querySelector('.hero-scene-canvas');
  const fallback = container.querySelector('.hero-scene-fallback');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let network = null;
  try {
    const tier = pickDeviceTier({
      hardwareConcurrency: navigator.hardwareConcurrency,
      viewportWidth: window.innerWidth,
    });
    const geometry = buildMonogramGeometry(tier.particleCount);
    network = new ParticleNetwork(canvas, geometry, tier);
    if (reducedMotion) network.snapToSettled();
  } catch (error) {
    network = null;
  }

  if (!network) {
    fallback.hidden = false;
    canvas.hidden = true;
    return { setThemeColors() {}, pause() {}, resume() {} };
  }

  fallback.hidden = true;
  canvas.hidden = false;
  network.resize();
  network.start();
  window.__heroSceneDebug.running = true;
  window.addEventListener('resize', () => network.resize());

  const api = {
    setThemeColors() {},
    pause() { network.pause(); window.__heroSceneDebug.running = false; },
    resume() { network.resume(); window.__heroSceneDebug.running = true; },
  };
  window.AuraHeroScene = api;
  return { network, api };
}
```

- [ ] **Step 5: Build y ejecutar las pruebas**

```bash
npm run build
npx playwright test hero-scene --project=chromium
```

Expected: PASS — 4 pruebas.

- [ ] **Step 6: Commit**

```bash
git add hero-scene.js tests/e2e/hero-scene.spec.js
git commit -m "feat: render loop WebGL con ensamblaje de entrada y soporte reduced-motion"
```

---

### Task 4: Interacción con el cursor

**Files:**
- Modify: `hero-scene.js` (`initHeroScene`: listener de `pointermove`)
- Test: `tests/e2e/hero-scene.spec.js`

**Interfaces:**
- Consumes: `network.setPointerOffset(x, y)` (Task 3).

- [ ] **Step 1: Escribir la prueba (debe fallar: el offset nunca cambia)**

```js
test('la escena reacciona al cursor en dispositivos con puntero fino', async ({ page }) => {
  await page.goto('/');
  await page.mouse.move(400, 300);
  await page.waitForTimeout(50);
  const offsetAfterFirst = await page.evaluate(() => window.__heroSceneDebug.pointerOffset);
  await page.mouse.move(700, 150);
  await page.waitForTimeout(50);
  const offsetAfterSecond = await page.evaluate(() => window.__heroSceneDebug.pointerOffset);
  expect(offsetAfterSecond).not.toEqual(offsetAfterFirst);
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

```bash
npx playwright test hero-scene --project=chromium
```

Expected: FAIL — `pointerOffset` es `undefined`.

- [ ] **Step 3: Añadir el listener en `initHeroScene`, antes del `return { network, api }`**

```js
  window.__heroSceneDebug.pointerOffset = { x: 0, y: 0 };
  const canTrackPointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (canTrackPointer) {
    const heroSection = document.getElementById('inicio');
    heroSection.addEventListener('pointermove', (event) => {
      const bounds = heroSection.getBoundingClientRect();
      const nx = (event.clientX - bounds.left) / bounds.width - 0.5;
      const ny = (event.clientY - bounds.top) / bounds.height - 0.5;
      const offset = { x: nx * 0.3, y: -ny * 0.3 };
      network.setPointerOffset(offset.x, offset.y);
      window.__heroSceneDebug.pointerOffset = offset;
    }, { passive: true });
  }
```

- [ ] **Step 4: Build y ejecutar**

```bash
npm run build
npx playwright test hero-scene --project=chromium
```

Expected: PASS — 5 pruebas.

- [ ] **Step 5: Commit**

```bash
git add hero-scene.js tests/e2e/hero-scene.spec.js
git commit -m "feat: interacción de la escena del hero con el cursor"
```

---

### Task 5: Transición A (scroll hero → servicios) + pausa por visibilidad

**Files:**
- Modify: `hero-scene.js` (`initHeroScene`: scroll handler, `IntersectionObserver`, `visibilitychange`)
- Modify: `hero-scene.css` (reglas dirigidas por `--hero-scene-progress`)
- Modify: `styles.css` (bloque existente de `.hero-content`, añadir `transform`/`transition` — ver Step 4)
- Test: `tests/e2e/hero-scene.spec.js`

**Interfaces:**
- Consumes: `network.setTransitionProgress`, `network.pause/resume` (Task 3).
- Produces: `#inicio[data-transition-progress]` y la custom property
  `--hero-scene-progress` en `#inicio`, legibles por CSS y por tests.

- [ ] **Step 1: Escribir las pruebas (deben fallar: el atributo nunca aparece)**

```js
test('hacer scroll a través del hero aumenta el progreso de la Transición A', async ({ page }) => {
  await page.goto('/');
  const initial = await page.locator('#inicio').getAttribute('data-transition-progress');
  expect(Number(initial)).toBe(0);
  const heroHeight = await page.locator('#inicio').evaluate((el) => el.getBoundingClientRect().height);
  await page.evaluate((y) => window.scrollTo(0, y), heroHeight * 0.6);
  await page.waitForFunction(() => Math.abs(window.scrollY) > 0);
  await expect.poll(async () =>
    Number(await page.locator('#inicio').getAttribute('data-transition-progress'))
  ).toBeGreaterThan(0.3);
});

test('al pasar completamente el hero, el loop de render queda en pausa', async ({ page }) => {
  await page.goto('/');
  const heroHeight = await page.locator('#inicio').evaluate((el) => el.getBoundingClientRect().height);
  await page.evaluate((y) => window.scrollTo(0, y), heroHeight * 1.5);
  await page.waitForFunction((h) => window.scrollY >= h, heroHeight * 1.4);
  await page.waitForTimeout(100);
  const running = await page.evaluate(() => window.__heroSceneDebug.running);
  expect(running).toBe(false);
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

```bash
npx playwright test hero-scene --project=chromium
```

Expected: FAIL — `data-transition-progress` no existe.

- [ ] **Step 3: Añadir a `initHeroScene`, antes del `return`**

```js
  const heroSection = document.getElementById('inicio');
  const visibilityObserver = new IntersectionObserver(
    ([entry]) => (entry.isIntersecting ? network.resume() : network.pause()),
    { threshold: 0 }
  );
  visibilityObserver.observe(canvas);
  if (visibilityObserver.takeRecords) window.__heroSceneDebug.running = true;

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      network.pause();
      window.__heroSceneDebug.running = false;
    } else if (heroSection.getBoundingClientRect().bottom > 0) {
      network.resume();
      window.__heroSceneDebug.running = true;
    }
  });

  let scrollFrame = null;
  function updateTransition() {
    scrollFrame = null;
    const rect = heroSection.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, -rect.top / rect.height));
    network.setTransitionProgress(progress);
    if (progress >= 1) {
      network.pause();
      window.__heroSceneDebug.running = false;
    } else if (!window.__heroSceneDebug.running) {
      network.resume();
      window.__heroSceneDebug.running = true;
    }
    heroSection.style.setProperty('--hero-scene-progress', progress.toFixed(3));
    heroSection.dataset.transitionProgress = progress.toFixed(3);
  }
  window.addEventListener('scroll', () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(updateTransition);
  }, { passive: true });
  window.addEventListener('resize', updateTransition);
  updateTransition();
```

Nota: esto hace que `visibilityObserver` y `updateTransition` sean la única
fuente de pausa/resume además de `visibilitychange` — `IntersectionObserver`
ya cubre "hero fuera del viewport" de forma redundante con el chequeo de
progreso ≥ 1, lo cual es intencional (doble seguro, no un bug): si el
usuario hace scroll más allá del hero muy rápido, cualquiera de los dos
detiene el loop igual.

- [ ] **Step 4: Verificar y extender el bloque existente de `.hero-content` en `styles.css`**

Antes de editar, leer el bloque actual de `.hero-content {` en `styles.css`
y añadir dentro de él (sin duplicar la regla si ya existe `transform`):

```css
.hero-content {
    transform: translateY(calc(var(--hero-scene-progress, 0) * -32px));
    transition: transform 0.1s linear;
}
```

- [ ] **Step 5: Añadir a `hero-scene.css`**

```css
.hero-scene {
    opacity: calc(1 - var(--hero-scene-progress, 0) * 0.85);
    transform: scale(calc(1 - var(--hero-scene-progress, 0) * 0.18));
    transition: opacity 0.1s linear, transform 0.1s linear;
}

@media (prefers-reduced-motion: reduce) {
    .hero-scene,
    .hero-content {
        transition: none;
    }
}
```

- [ ] **Step 6: Build y ejecutar**

```bash
npm run build
npx playwright test hero-scene --project=chromium
```

Expected: PASS — 7 pruebas.

- [ ] **Step 7: Commit**

```bash
git add hero-scene.js hero-scene.css styles.css tests/e2e/hero-scene.spec.js
git commit -m "feat: Transición A (scroll hero -> servicios) y pausa del render fuera de vista"
```

---

### Task 6: Hook de tema claro/oscuro

**Files:**
- Modify: `hero-scene.js` (`ParticleNetwork.setThemeColors`, `api.setThemeColors`)
- Modify: `script.js:27-33` (llamar al hook en el handler de `themeToggle`)
- Test: `tests/e2e/hero-scene.spec.js`

**Interfaces:**
- Consumes: `readThemeColors()` (Task 2).
- Produces: nada nuevo consumido por tasks posteriores.

- [ ] **Step 1: Escribir la prueba (debe fallar: el color no cambia)**

```js
test('cambiar de tema actualiza el color de la escena sin reiniciarla', async ({ page }) => {
  await page.goto('/');
  const before = await page.evaluate(() => window.__heroSceneDebug.frameCount);
  await page.click('#themeToggle');
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => window.__heroSceneDebug.frameCount);
  expect(after).toBeGreaterThan(before); // nunca se detuvo el loop
  const colorChanged = await page.evaluate(() => typeof window.AuraHeroScene?.setThemeColors === 'function');
  expect(colorChanged).toBe(true);
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

```bash
npx playwright test hero-scene --project=chromium
```

Expected: FAIL — `setThemeColors` es un no-op (función vacía de Task 2).

- [ ] **Step 3: Implementar `setThemeColors` en `ParticleNetwork`**

Añadir dentro de la clase, junto a `setPointerOffset`:

```js
  setThemeColors() {
    this.color = readThemeColors();
  }
```

- [ ] **Step 4: Conectar el hook real en `initHeroScene`**

Cambiar `setThemeColors() {}` en el objeto `api` (Task 2/3) por:

```js
    setThemeColors() { network.setThemeColors(); },
```

- [ ] **Step 5: Llamar al hook desde `script.js`**

En `script.js:27-33`, dentro del listener de `themeToggle`, después de `setThemeIcon(isDark);`:

```js
    window.AuraHeroScene?.setThemeColors();
```

- [ ] **Step 6: Build y ejecutar**

```bash
npm run build
npx playwright test hero-scene --project=chromium
```

Expected: PASS — 8 pruebas.

- [ ] **Step 7: Commit**

```bash
git add hero-scene.js script.js tests/e2e/hero-scene.spec.js
git commit -m "feat: la escena del hero sigue el cambio de tema claro/oscuro"
```

---

### Task 7: Fix del bucle perpetuo de la barra de progreso + limpieza de código muerto

**Files:**
- Modify: `script.js:69, 118-125, 361-372, 383` (ver detalle)
- Modify: `byteo.js:258`

**Interfaces:** ninguna consumida/producida por otros tasks — limpieza aislada.

- [ ] **Step 1: Confirmar las 4 advertencias actuales de ESLint**

```bash
npx eslint .
```

Expected: 4 warnings (`lastScroll`, `animateValue`, `sectionHeight` en
`script.js`; `eyes` en `byteo.js`).

- [ ] **Step 2: Eliminar `lastScroll` (script.js:69, 80)**

Eliminar la línea `let lastScroll = 0;` y la línea `lastScroll = currentScroll;`
dentro del listener de `scroll` del navbar — ninguna se lee nunca.

- [ ] **Step 3: Reemplazar el bucle perpetuo de la barra de progreso (`script.js:111-125`)**

Reemplazar todo el bloque (comentario incluido) por:

```js
// Barra de lectura: transform evita recalcular layout en cada scroll.
// Antes: un bucle de rAF perpetuo (60 veces/segundo para siempre, incluso
// con la página completamente quieta) para no depender de que "scroll" se
// disparase de forma confiable en todos los motores/entornos (ver git log
// de este archivo — hubo una intermitencia real en CI por esto, ya resuelta
// en otro punto cambiando scrollIntoView por window.scrollTo en las
// pruebas). Ahora: ráfagas de rAF de alta frecuencia solo durante ~1s tras
// cada "scroll"/"resize" real (fluido mientras el usuario interactúa), más
// un pulso de respaldo cada 500ms en reposo — corrige el valor igual si
// algún motor no disparase el evento, pero sin gastar un frame por cada
// uno de los 60fps durante el resto del tiempo que la página está quieta.
const scrollProgress = document.querySelector('.scroll-progress');
let lastRenderedProgress = -1;

function readScrollProgress() {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    return maxScroll > 0 ? Math.min(1, window.scrollY / maxScroll) : 0;
}

function applyScrollProgress() {
    const progress = readScrollProgress();
    if (progress !== lastRenderedProgress) {
        scrollProgress.style.transform = `scaleX(${progress})`;
        lastRenderedProgress = progress;
    }
}

let activeUntil = performance.now() + 1000;
let rafPending = false;

function scrollProgressTick(now) {
    rafPending = false;
    applyScrollProgress();
    if (now < activeUntil) {
        rafPending = true;
        window.requestAnimationFrame(scrollProgressTick);
    }
}

function nudgeScrollProgress() {
    activeUntil = performance.now() + 1000;
    if (!rafPending) {
        rafPending = true;
        window.requestAnimationFrame(scrollProgressTick);
    }
}

window.addEventListener('scroll', nudgeScrollProgress, { passive: true });
window.addEventListener('resize', nudgeScrollProgress);
applyScrollProgress();
window.setInterval(applyScrollProgress, 500);
```

- [ ] **Step 4: Eliminar `animateValue` (script.js:361-372, antes "Contador de scroll para animar números (opcional)")**

Eliminar la función completa y su comentario — sin llamadas en todo el repo.

- [ ] **Step 5: Eliminar `sectionHeight` no usado (script.js:383)**

En el handler de resaltado de nav activo, cambiar:

```js
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        if (window.pageYOffset >= sectionTop - 200) {
```

por:

```js
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        if (window.pageYOffset >= sectionTop - 200) {
```

- [ ] **Step 6: Eliminar `eyes` no usado (byteo.js:258)**

En `setEmotion`, eliminar la línea:

```js
        const eyes = this.robot.querySelectorAll('.byteo-eye');
```

(no se lee en ningún punto de la función — los estados de ojos los maneja el CSS vía `this.robot.className`).

- [ ] **Step 7: Confirmar ESLint limpio y que la prueba existente de la barra sigue pasando**

```bash
npx eslint .
npm run build
npx playwright test home --project=chromium -g "progreso de lectura"
```

Expected: `0 problems`; la prueba de la barra de progreso sigue en PASS.

- [ ] **Step 8: Commit**

```bash
git add script.js byteo.js
git commit -m "fix: barra de progreso sin bucle de rAF perpetuo; elimina código muerto (4 warnings de ESLint)"
```

---

### Task 8: Zonas de exclusión para el roam de Byteo

**Files:**
- Modify: `byteo.js` (lógica de selección de destino aleatorio, ~líneas 300-320)
- Test: `tests/e2e/byteo.spec.js` (nuevo)

**Interfaces:** ninguna compartida con otros tasks.

- [ ] **Step 1: Leer la función actual de selección de destino antes de editar**

```bash
sed -n '290,325p' byteo.js
```

(Confirmar los nombres reales de la función y las variables `maxX`/`maxY`
antes de aplicar el Step 3 — si difieren de lo mostrado en el contexto de
este plan, ajustar el patching en consecuencia.)

- [ ] **Step 2: Escribir la prueba (debe fallar: Byteo puede solapar el botón de WhatsApp)**

`tests/e2e/byteo.spec.js`:

```js
import { expect, test } from '@playwright/test';

function rectsOverlap(a, b) {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

test('Byteo nunca se posiciona sobre el botón de WhatsApp o las CTAs del hero', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.byteo-robot');

  const protectedRects = await page.evaluate(() => {
    const selectors = ['.whatsapp-float', '.cta-buttons'];
    return selectors
      .map((selector) => document.querySelector(selector)?.getBoundingClientRect())
      .filter(Boolean)
      .map((rect) => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }));
  });

  for (let i = 0; i < 6; i += 1) {
    await page.waitForTimeout(500);
    const byteoRect = await page.locator('.byteo-robot').boundingBox();
    if (!byteoRect) continue;
    const byteoBox = {
      left: byteoRect.x,
      top: byteoRect.y,
      right: byteoRect.x + byteoRect.width,
      bottom: byteoRect.y + byteoRect.height,
    };
    for (const protectedRect of protectedRects) {
      expect(rectsOverlap(byteoBox, protectedRect)).toBe(false);
    }
  }
});
```

- [ ] **Step 3: Ejecutar y confirmar que falla (o es intermitente)**

```bash
npx playwright test byteo --project=chromium --repeat-each=3
```

Expected: FAIL en al menos una repetición (Byteo puede roamear sobre
`.whatsapp-float`, esquina inferior derecha, por diseño actual).

- [ ] **Step 4: Añadir la función de exclusión y usarla al elegir destino**

Añadir cerca de la función de selección de destino en `byteo.js`:

```js
    getProtectedRects() {
        const selectors = ['.whatsapp-float', '.navbar', '.cta-buttons'];
        const margin = 24;
        return selectors
            .map(selector => document.querySelector(selector)?.getBoundingClientRect())
            .filter(Boolean)
            .map(rect => ({
                left: rect.left - margin,
                top: rect.top - margin,
                right: rect.right + margin,
                bottom: rect.bottom + margin,
            }));
    }

    isTargetSafe(x, y) {
        const size = 80; // ancho/alto aproximado del robot con margen
        const target = { left: x, top: y, right: x + size, bottom: y + size };
        return this.getProtectedRects().every(rect =>
            target.right <= rect.left || target.left >= rect.right ||
            target.bottom <= rect.top || target.top >= rect.bottom
        );
    }
```

Y, en la función que genera el destino aleatorio (la que usa `maxX`/`maxY`,
confirmada en el Step 1), envolver la elección en un reintento acotado:

```js
    pickRoamTarget() {
        const margin = 20;
        const maxX = window.innerWidth - margin;
        const maxY = window.innerHeight - margin;
        for (let attempt = 0; attempt < 8; attempt += 1) {
            const x = margin + Math.random() * (maxX - margin);
            const y = margin + Math.random() * (maxY - margin);
            if (this.isTargetSafe(x, y)) return { x, y };
        }
        // Tras 8 intentos sin destino libre (viewport muy pequeño/saturado
        // de zonas protegidas), cae al centro de la pantalla: siempre es
        // una posición válida y nunca deja a Byteo sin destino.
        return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }
```

(Si el código existente ya tenía una función equivalente con otro nombre,
renombrar las llamadas existentes a `pickRoamTarget()` en vez of duplicar
lógica — confirmar contra el Step 1.)

- [ ] **Step 5: Ejecutar y confirmar que pasa**

```bash
npx playwright test byteo --project=chromium --repeat-each=5
```

Expected: PASS en las 5 repeticiones.

- [ ] **Step 6: Commit**

```bash
git add byteo.js tests/e2e/byteo.spec.js
git commit -m "fix: Byteo evita superponerse con WhatsApp, la navbar y las CTAs del hero"
```

---

### Task 9: Validación completa de build, lint y backend

**Files:** ninguno nuevo — solo verificación.

- [ ] **Step 1: Build completo**

```bash
npm run build
```

Expected: genera/actualiza `styles.min.css`, `byteo.min.css`,
`hero-scene.min.css`, `script.min.js`, `byteo.min.js`, `hero-scene.min.js`
sin errores.

- [ ] **Step 2: Lint y formato**

```bash
npx eslint .
npx stylelint "**/*.css"
npx html-validate index.html
npm run format:check
```

Expected: sin errores (si `format:check` falla por los archivos nuevos,
ejecutar `npx prettier --write hero-scene.js hero-scene.css tests/unit/hero-scene-math.test.mjs tests/e2e/hero-scene.spec.js tests/e2e/byteo.spec.js` y repetir).

- [ ] **Step 3: Backend**

```bash
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m bandit -r app.py
.\.venv\Scripts\python.exe -m flake8 app.py tests/
```

Expected: 10 pruebas de pytest siguen en PASS (nada en `app.py` cambia su
comportamiento salvo `_PUBLIC_FILES`); bandit/flake8 limpios.

- [ ] **Step 4: Unit tests de la geometría**

```bash
npm run test:unit
```

Expected: PASS — 9 pruebas.

- [ ] **Step 5: Commit si hubo cambios de formato**

```bash
git add -A
git commit -m "chore: aplica formato a los archivos nuevos del hero cinematográfico" --allow-empty
```

(usar `--allow-empty` solo si no hay diffs reales; si `git status` no
muestra cambios, omitir este commit.)

---

### Task 10: Suite Playwright completa, accesibilidad y evidencia visual

**Files:** ninguno nuevo — ejecución y captura.

- [ ] **Step 1: Suite completa en los 3 navegadores**

```bash
npx playwright test
```

Expected: todas las pruebas en PASS — las 36 existentes + las ~17 nuevas
(hero-scene: 8, byteo: 1, más las reutilizadas) × 3 navegadores.

- [ ] **Step 2: Accesibilidad**

```bash
npx playwright test accessibility
```

Expected: PASS — 0 violaciones serias/críticas (confirma que el nuevo
markup `.hero-scene`/`.hero-scene-fallback` no introduce regresiones de
contraste o estructura).

- [ ] **Step 3: Capturar evidencia visual con Playwright (script ad-hoc, no se commitea)**

Ejecutar vía `npx playwright test --project=chromium` un script temporal
(o usar `page.screenshot`/`page.video` dentro de un test marcado
`test.skip` en CI) que capture:

```bash
node -e "
const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: 'evidence/' } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5000/');
  await page.screenshot({ path: 'evidence/hero-desktop.png' });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'evidence/hero-desktop-ensamblado.png' });
  const heroHeight = await page.locator('#inicio').evaluate(el => el.getBoundingClientRect().height);
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), heroHeight * 0.9);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'evidence/transicion-a.png' });
  await context.close();

  const mobileContext = await browser.newContext({ ...require('@playwright/test').devices['iPhone 13'] });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto('http://127.0.0.1:5000/');
  await mobilePage.screenshot({ path: 'evidence/hero-movil.png' });
  await mobileContext.close();

  const darkContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const darkPage = await darkContext.newPage();
  await darkPage.goto('http://127.0.0.1:5000/');
  await darkPage.click('#themeToggle');
  await darkPage.waitForTimeout(300);
  await darkPage.screenshot({ path: 'evidence/hero-oscuro.png' });
  await darkContext.close();

  await browser.close();
})();
" 
```

(Requiere que `python app.py` esté corriendo en `127.0.0.1:5000` en otra
terminal — usar el mismo comando que `playwright.config.js:36`. La carpeta
`evidence/` es solo para esta verificación manual, no se commitea — añadir
`evidence/` a `.gitignore` si no está ya cubierta por una regla existente.)

- [ ] **Step 4: Revisar visualmente las capturas/el video**

Confirmar: el hero se ve claramente distinto al anterior (partículas +
líneas formando el monograma, no un anillo genérico), la Transición A
muestra la escena transformándose (no solo desapareciendo), el modo oscuro
mantiene la paleta coherente, y el móvil no muestra scroll horizontal.

- [ ] **Step 5: Si algo no se ve bien, volver a las tasks correspondientes y ajustar**

(Parámetros razonables a tocar sin romper pruebas: `ASSEMBLE_DURATION_MS`,
tamaños de punto en `drawPoints`, `depth` en `buildMonogramGeometry`,
multiplicadores de `settledX`/`settledY` en `render()`.)

---

### Task 11: Rollout

**Files:** ninguno — operaciones de git/CI.

- [ ] **Step 1: Push y PR**

```bash
git push -u origin feature/hero-cinematico
gh pr create --title "Hero cinematográfico + Transición A (sub-proyecto 1/4 del rediseño)" --body "$(cat <<'EOF'
## Resumen
- Reemplaza el hológrama estático del hero por una escena WebGL de partículas que converge en el monograma de marca (logo.svg), con fallback SVG sin WebGL y respeto total a prefers-reduced-motion.
- Transición A: el scroll hero->servicios transforma la escena (no solo oculta/muestra secciones).
- Fix: barra de progreso ya no corre un bucle de rAF perpetuo; limpieza de las 4 advertencias de ESLint; Byteo ya no se solapa con WhatsApp/CTAs.

Sub-proyecto 1 de 4 del rediseño cinematográfico — ver docs/superpowers/specs/2026-10-16-cinematic-hero-transition-a-design.md. Transición B (servicios) y C (idea->producto) quedan para sub-proyectos siguientes.

## Test plan
- [x] npm run test:unit
- [x] npx playwright test (3 navegadores)
- [x] npx playwright test accessibility
- [x] pytest / bandit / flake8
- [x] Evidencia visual (capturas + video) revisada manualmente
EOF
)"
```

- [ ] **Step 2: Monitorear CI y corregir cualquier falla real**

```bash
gh pr checks --watch
```

Si algo falla, diagnosticar la causa real (no reintentar a ciegas ni
desactivar el check) y corregir con un commit nuevo en la misma rama.

- [ ] **Step 3: Merge una vez el CI esté verde**

```bash
gh pr merge --merge
```

- [ ] **Step 4: Verificar el despliegue en GitHub Pages**

Confirmar que el workflow de Pages corrió tras el merge a `master`, y
visitar `https://josedavidosorio2005.github.io/Aurabyte/` para confirmar
visualmente que el hero cinematográfico está en producción (no solo en
local).

- [ ] **Step 5: Reportar**

Resumen con: enlace de producción, capturas antes/después, qué falta
explícitamente (Transición B, Transición C, microinteracciones generales,
legal, auditoría de ramas) — sin declarar terminado el rediseño completo.
