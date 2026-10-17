// process-scene.js — Transición C: IDEA -> DISEÑO -> DESARROLLO -> SOLUCIÓN
//
// Reutiliza el motor de scroll compartido (scroll-progress.min.js) igual que
// hero-scene y services-scene: un solo registerScrollRegion, cero listeners
// ni requestAnimationFrame propios. También reutiliza matemática ya probada
// de las fases anteriores en vez de reescribirla: computeScrubIndex/
// computePanelDistance (de services-scene, idénticas a lo que esta escena
// necesita para "qué tan lejos estoy de cada etapa") y lerp/easeInOutCubic/
// pickDeviceTier (de hero-scene). Importa los companions MINIFICADOS por la
// misma razón que el resto del proyecto (ver CLAUDE.md, "Build de
// producción"): no hay bundler que reescriba specifiers entre fuente y
// build, y los *.min.* ya son lo que de verdad se ejecuta/importa.
import { registerScrollRegion, clampProgress } from './scroll-progress.min.js';
import { computeScrubIndex, computePanelDistance, computeTargetScrollTop } from './services-scene.min.js';
import { lerp, easeInOutCubic, pickDeviceTier } from './hero-scene.min.js';

export { computeScrubIndex as computeStageFloat, computePanelDistance as computeStageDistance };

const STAGE_COUNT = 4;
const SEGMENT_COUNT = STAGE_COUNT - 1;

export function computeSegment(stageFloat) {
  const segment = Math.min(SEGMENT_COUNT - 1, Math.max(0, Math.floor(stageFloat)));
  const localT = Math.min(1, Math.max(0, stageFloat - segment));
  return { segment, localT };
}

// --- Geometría pura (testable en Node sin DOM) ---------------------------
//
// Las 4 escenas comparten el mismo número de puntos y el mismo orden de
// "slots" (estructura primaria/secundaria/contenido/acento, pesos fijos) —
// así el punto en el índice i siempre es la MISMA partícula a lo largo de
// las 4 etapas, y interpolar posición por índice entre dos etapas se ve
// como una reorganización continua, no como un salto. Sin esto (p. ej. con
// conteos de puntos distintos por slot entre etapas), lerp() mezclaría
// partículas no relacionadas entre sí.
const SLOT_WEIGHTS = [0.45, 0.25, 0.2, 0.1];

export function computeSlotCounts(total) {
  const counts = SLOT_WEIGHTS.map((w) => Math.round(w * total));
  // Ajusta el último slot para que la suma sea exactamente `total` (el
  // redondeo de los 4 pesos puede desviarse en +-1/2 del total real).
  const sum = counts[0] + counts[1] + counts[2];
  counts[3] = total - sum;
  return counts;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// Ruido determinístico 0..1 a partir del índice (mismo patrón sin*43758 de
// hashes de shader GLSL, aquí en CPU): no hace falta rigor estadístico,
// solo que cada índice caiga siempre en el mismo punto del área a rellenar
// — necesario para que el morph entre etapas sea estable, no solo "parecido".
export function hashUnit(i) {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function diskPoints(count, cx, cy, r, seedOffset = 0) {
  const pts = [];
  for (let k = 0; k < count; k += 1) {
    const i = k + seedOffset;
    const t = (k + 0.5) / count;
    const radius = Math.sqrt(t) * r;
    const theta = i * GOLDEN_ANGLE;
    pts.push({ x: cx + radius * Math.cos(theta), y: cy + radius * Math.sin(theta) });
  }
  return pts;
}

function ringPoints(count, cx, cy, r) {
  const pts = [];
  for (let k = 0; k < count; k += 1) {
    const theta = (k / count) * Math.PI * 2;
    pts.push({ x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) });
  }
  return pts;
}

// Perímetro de un polígono cerrado (lista de vértices), muestreado a
// distancia constante — mismo principio que samplePerimeter en hero-scene.js
// (no exportado desde allí, así que esta es una copia local deliberada: es
// un utilitario genérico de ~15 líneas, no justifica un módulo compartido
// nuevo para una sola función).
function sampleClosedPolygon(count, vertices) {
  const edgeLengths = vertices.map((p, i) => {
    const next = vertices[(i + 1) % vertices.length];
    return Math.hypot(next[0] - p[0], next[1] - p[1]);
  });
  const perimeter = edgeLengths.reduce((a, b) => a + b, 0);
  const step = perimeter / count;
  const pts = [];
  let edgeIndex = 0;
  let traveled = 0;
  for (let k = 0; k < count; k += 1) {
    const targetDistance = k * step;
    while (traveled + edgeLengths[edgeIndex] < targetDistance && edgeIndex < vertices.length - 1) {
      traveled += edgeLengths[edgeIndex];
      edgeIndex += 1;
    }
    const a = vertices[edgeIndex];
    const b = vertices[(edgeIndex + 1) % vertices.length];
    const edgeLen = edgeLengths[edgeIndex] || 1;
    const t = (targetDistance - traveled) / edgeLen;
    pts.push({ x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t });
  }
  return pts;
}

function rectVertices(cx, cy, w, h) {
  const hw = w / 2;
  const hh = h / 2;
  return [[cx - hw, cy - hh], [cx + hw, cy - hh], [cx + hw, cy + hh], [cx - hw, cy + hh]];
}

function rectStrokePoints(count, cx, cy, w, h) {
  return sampleClosedPolygon(count, rectVertices(cx, cy, w, h));
}

// Relleno determinístico de un rectángulo: jitter por hash, no una grilla
// perfecta — una grilla uniforme se ve mecánica para "componentes de UI";
// un jitter pequeño (<= 18% de la celda) se lee como relleno sólido sin
// perder la distribución pareja de una grilla real.
function rectFillPoints(count, cx, cy, w, h, seedOffset = 0) {
  const cols = Math.max(1, Math.round(Math.sqrt((count * w) / h)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const cellW = w / cols;
  const cellH = h / rows;
  const pts = [];
  for (let k = 0; k < count; k += 1) {
    const col = k % cols;
    const row = Math.floor(k / cols) % rows;
    const i = k + seedOffset;
    const jitterX = (hashUnit(i) - 0.5) * cellW * 0.36;
    const jitterY = (hashUnit(i + 991) - 0.5) * cellH * 0.36;
    pts.push({
      x: cx - w / 2 + cellW * (col + 0.5) + jitterX,
      y: cy - h / 2 + cellH * (row + 0.5) + jitterY,
    });
  }
  return pts;
}

// Bloque de "líneas de código": filas horizontales de ancho variable
// (determinístico por fila), apiladas verticalmente — la silueta reconocible
// de un editor de código sin dibujar texto real.
function codeLineRowPoints(count, cx, cy, w, h, rows = 6) {
  const perRow = Math.max(1, Math.floor(count / rows));
  const rowH = h / rows;
  const pts = [];
  let placed = 0;
  for (let r = 0; r < rows && placed < count; r += 1) {
    const rowWidth = w * (0.35 + 0.55 * hashUnit(r * 7 + 3));
    const n = r === rows - 1 ? count - placed : Math.min(perRow, count - placed);
    const y = cy - h / 2 + rowH * (r + 0.5);
    for (let k = 0; k < n; k += 1) {
      const x = cx - w / 2 + (rowWidth * (k + 0.5)) / n;
      pts.push({ x, y });
      placed += 1;
    }
  }
  return pts;
}

// Conexiones por vecino-más-cercano REAL (distancia euclidiana), no por
// índice consecutivo: los puntos de disk/fill se generan en orden de
// espiral de ángulo dorado (o de grilla), donde el índice k+1 puede caer
// espacialmente lejos de k — conectar por índice producía una maraña de
// líneas cruzando todo el área (confirmado con evidencia visual real: la
// etapa IDEA se veía como un ovillo enredado, no como una red organizándose
// "con pequeñas conexiones", que es lo que pide el brief). Esta geometría se
// construye UNA SOLA VEZ al iniciar la escena (no por frame), así que el
// costo O(n^2) de buscar los k vecinos más cercanos entre ~30-70 puntos es
// insignificante — no es el mismo presupuesto que el render por frame.
function nearestNeighborEdges(points, indices, k = 2) {
  const edges = [];
  const seen = new Set();
  indices.forEach((i) => {
    const ranked = indices
      .filter((j) => j !== i)
      .map((j) => ({ j, d: Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) }))
      .sort((p, q) => p.d - q.d)
      .slice(0, k);
    ranked.forEach(({ j }) => {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push([i, j]);
      }
    });
  });
  return edges;
}

function chainEdges(indices, closed) {
  const edges = [];
  for (let k = 0; k < indices.length - 1; k += 1) edges.push([indices[k], indices[k + 1]]);
  if (closed && indices.length > 2) edges.push([indices[indices.length - 1], indices[0]]);
  return edges;
}

// --- Las 4 escenas, en los 4 slots fijos descritos arriba -----------------
//
// Slot A (0.45): la silueta persiste en TODAS las etapas — la misma forma
// que empieza como el anillo de la idea termina siendo el marco del
// dispositivo en la solución. Es la continuidad visual central de la
// Transición C: no son 4 escenas distintas, es una sola forma mutando.
// Slot B (0.25): estructura secundaria (chispas -> navbar/sidebar -> tarjetas
// -> bloques de contenido). Slot C (0.20): detalle/contenido. Slot D (0.10):
// acento/núcleo (núcleo de la idea -> marcadores -> highlight -> botón CTA).
export function buildIdeaLayout(total) {
  const [a, b, c, d] = computeSlotCounts(total);
  const points = [
    ...ringPoints(a, 0, 0, 0.62),
    ...diskPoints(b, 0, 0.05, 0.5, 101),
    ...diskPoints(c, 0, 0, 0.3, 211),
    ...diskPoints(d, 0, 0, 0.08, 331),
  ];
  const offsets = [0, a, a + b, a + b + c];
  const idx = (slot, n) => Array.from({ length: n }, (_, k) => offsets[slot] + k);
  const edges = [
    ...chainEdges(idx(0, a), true),
    ...nearestNeighborEdges(points, idx(1, b), 2),
    ...nearestNeighborEdges(points, idx(2, c), 2),
  ];
  return { points, edges };
}

export function buildDesignLayout(total) {
  const [a, b, c, d] = computeSlotCounts(total);
  // El reparto de `c` en 3 tarjetas con Math.floor puede dejar restos (c no
  // siempre es múltiplo de 3) — se completan en la última tarjeta para que
  // el total de puntos siga siendo exactamente `total`.
  const perCard = Math.floor(c / 3);
  const cardRemainder = c - perCard * 3;
  const basePoints = [
    ...rectStrokePoints(a, 0, 0, 1.7, 1.05),
    ...sampleClosedPolygon(b, [[-0.85, 0.42], [0.85, 0.42], [0.85, 0.3], [-0.85, 0.3]]),
    ...rectStrokePoints(perCard, -0.56, -0.05, 0.42, 0.55),
    ...rectStrokePoints(perCard, 0, -0.05, 0.42, 0.55),
    ...rectStrokePoints(perCard + cardRemainder, 0.56, -0.05, 0.42, 0.55),
    ...diskPoints(d, 0, -0.42, 0.05, 441),
  ];
  const offsets = [0, a, a + b, a + b + perCard, a + b + perCard * 2, a + b + perCard * 2 + perCard + cardRemainder];
  const idx = (start, n) => Array.from({ length: n }, (_, k) => start + k);
  const edges = [
    ...chainEdges(idx(offsets[0], a), true),
    ...chainEdges(idx(offsets[1], b), false),
    ...chainEdges(idx(offsets[2], perCard), true),
    ...chainEdges(idx(offsets[3], perCard), true),
    ...chainEdges(idx(offsets[4], perCard + cardRemainder), true),
  ];
  return { points: basePoints, edges };
}

export function buildDevelopmentLayout(total) {
  const [a, b, c, d] = computeSlotCounts(total);
  const perCard = Math.floor(b / 3);
  const cardRemainder = b - perCard * 3;
  const codeCount = Math.floor(c * 0.5);
  const fillCount = c - codeCount;
  const points = [
    ...rectStrokePoints(a, 0, 0, 1.7, 1.05),
    ...rectFillPoints(perCard, -0.56, -0.05, 0.4, 0.5, 501),
    ...rectFillPoints(perCard, 0, -0.05, 0.4, 0.5, 611),
    ...rectFillPoints(perCard + cardRemainder, 0.56, -0.05, 0.4, 0.5, 721),
    ...codeLineRowPoints(codeCount, 0.58, 0.3, 0.46, 0.2, 4),
    ...rectFillPoints(fillCount, -0.56, 0.32, 0.36, 0.14, 831),
    ...diskPoints(d, 0, -0.42, 0.06, 941),
  ];
  const offsets = [0, a, a + perCard, a + perCard * 2, a + perCard * 2 + perCard + cardRemainder];
  const idx = (start, n) => Array.from({ length: n }, (_, k) => start + k);
  const edges = [
    ...chainEdges(idx(offsets[0], a), true),
    ...nearestNeighborEdges(points, idx(offsets[1], perCard), 1),
    ...nearestNeighborEdges(points, idx(offsets[2], perCard), 1),
    ...nearestNeighborEdges(points, idx(offsets[3], perCard + cardRemainder), 1),
  ];
  return { points, edges };
}

export function buildSolutionLayout(total) {
  const [a, b, c, d] = computeSlotCounts(total);
  const headerCount = Math.floor(b * 0.4);
  const heroCount = b - headerCount;
  const perCard = Math.floor(c / 2);
  const cardRemainder = c - perCard * 2;
  const points = [
    ...rectStrokePoints(a, 0, 0, 1.7, 1.05),
    ...rectFillPoints(headerCount, 0, 0.42, 1.5, 0.14, 1051),
    ...rectFillPoints(heroCount, 0, 0.1, 1.5, 0.42, 1161),
    ...rectFillPoints(perCard, -0.42, -0.34, 0.66, 0.26, 1271),
    ...rectFillPoints(perCard + cardRemainder, 0.42, -0.34, 0.66, 0.26, 1381),
    ...rectFillPoints(d, 0, -0.42, 0.34, 0.1, 1491),
  ];
  const buttonStart = a + b + perCard * 2 + cardRemainder;
  const idx = (start, n) => Array.from({ length: n }, (_, k) => start + k);
  const edges = [
    ...chainEdges(idx(0, a), true),
    // Acento sutil en el botón del CTA: vecino-más-cercano entre sus propios
    // puntos (un cúmulo pequeño y compacto), no una cadena por índice de
    // grilla — eso fue lo que antes dibujaba un garabato diagonal cruzando
    // la tarjeta 2 (offset mal calculado, apuntaba a los puntos de relleno
    // de la tarjeta, no del botón; confirmado con evidencia visual real).
    ...nearestNeighborEdges(points, idx(buttonStart, d), 1),
  ];
  return { points, edges };
}

export function buildStageLayouts(total) {
  return [buildIdeaLayout(total), buildDesignLayout(total), buildDevelopmentLayout(total), buildSolutionLayout(total)];
}

export function lerpColorChannel(a, b, t) {
  return Math.round(lerp(a, b, t));
}

export function hexToRgbTuple(hex) {
  const normalized = hex.replace('#', '').trim();
  const value = normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized;
  const int = parseInt(value, 16) || 0;
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

// Recorrido de color cian -> azul -> violeta sobre el progreso GLOBAL de la
// escena (no por segmento): un solo barrido continuo de dos tramos en vez
// de 3 colores fijos por etapa, para que el color también "fluya" con el
// scroll en vez de cambiar a saltos en cada frontera de etapa.
export function computeJourneyColor(progress, stops) {
  const clamped = Math.min(1, Math.max(0, progress));
  if (clamped <= 0.5) {
    const t = clamped / 0.5;
    return stops[0].map((v, i) => lerpColorChannel(v, stops[1][i], t));
  }
  const t = (clamped - 0.5) / 0.5;
  return stops[1].map((v, i) => lerpColorChannel(v, stops[2][i], t));
}

// --- Orquestación Canvas2D/DOM (sin equivalente de prueba unitaria: se
// prueba vía Playwright en tests/e2e/process-scene.spec.js) -------------

// Recorrido cian -> azul -> violeta pedido en el brief ("Condiciones:
// conservar la identidad de Aurabyte... cian, azul y violeta").
const COLOR_STOPS = ['#22d3ee', '#3b82f6', '#8b5cf6'].map(hexToRgbTuple);

class ProcessCanvas {
  constructor(canvas, pointCount) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) throw new Error('Canvas 2D no disponible');
    this.layouts = buildStageLayouts(pointCount);
  }

  resize(dprCap) {
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const { clientWidth, clientHeight } = this.canvas;
    this.canvas.width = Math.max(1, Math.round(clientWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(clientHeight * dpr));
  }

  render(stageFloat, progress) {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    const scale = Math.min(width, height) / 2.3;
    const cx = width / 2;
    const cy = height / 2;
    const { segment, localT } = computeSegment(stageFloat);
    const eased = easeInOutCubic(localT);
    const from = this.layouts[segment];
    const to = this.layouts[segment + 1];
    const color = computeJourneyColor(progress, COLOR_STOPS);
    const [r, g, b] = color;

    ctx.clearRect(0, 0, width, height);

    const project = (p) => ({ x: cx + p.x * scale, y: cy - p.y * scale });

    const drawEdgeSet = (edges, alpha) => {
      if (alpha <= 0.01) return;
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      edges.forEach(([i, j]) => {
        const pa = project({
          x: lerp(from.points[i].x, to.points[i].x, eased),
          y: lerp(from.points[i].y, to.points[i].y, eased),
        });
        const pb = project({
          x: lerp(from.points[j].x, to.points[j].x, eased),
          y: lerp(from.points[j].y, to.points[j].y, eased),
        });
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
      });
      ctx.stroke();
    };

    // Crossfade real de los dos conjuntos de aristas de la etapa (saliente
    // y entrante) en vez de un corte — es lo que hace que la silueta se
    // sienta "derretirse" de una forma a la siguiente en vez de reemplazarse.
    drawEdgeSet(from.edges, 1 - eased);
    drawEdgeSet(to.edges, eased);

    // Las partículas crecen con el progreso GLOBAL de la escena (no por
    // segmento): en IDEA son chispas diminutas sueltas; en SOLUCIÓN el mismo
    // radio, multiplicado, hace que el relleno disperso de los bloques de
    // UI se vea sólido en vez de puntos sueltos (evidencia visual real: sin
    // este crecimiento, el bloque "header/hero/tarjetas" final se leía como
    // ruido disperso, no como una interfaz terminada). Cuenta además la
    // propia historia visual: la idea "crece" hasta volverse software.
    const growth = 1 + progress * 4.5;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
    for (let i = 0; i < from.points.length; i += 1) {
      const x = lerp(from.points[i].x, to.points[i].x, eased);
      const y = lerp(from.points[i].y, to.points[i].y, eased);
      const p = project({ x, y });
      const size = (1.6 + hashUnit(i) * 1.1) * growth;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function initProcessScene() {
  const section = document.getElementById('proceso');
  if (!section) return null;
  let stagesContainer = section.querySelector('.process-stages');
  const stageArticles = Array.from(stagesContainer.querySelectorAll('.process-stage'));
  if (stageArticles.length !== STAGE_COUNT) return null;

  window.__processSceneDebug = { enhanced: false, canvasAvailable: true };

  const desktopQuery = window.matchMedia('(min-width: 1024px)');
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const VH_PER_SEGMENT = 90;

  let wrapper = null;
  let stage = null;
  let dotsContainer = null;
  let scrollHandle = null;
  let canvasEngine = null;
  let hasRenderedOnce = false;

  function shouldEnhance() {
    return desktopQuery.matches && !reducedMotionQuery.matches;
  }

  function buildDots() {
    dotsContainer = document.createElement('div');
    dotsContainer.className = 'process-dots';
    stageArticles.forEach((article, index) => {
      const heading = article.querySelector('h3');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'process-dot';
      button.setAttribute('aria-label', heading ? heading.textContent.trim() : `Etapa ${index + 1}`);
      button.addEventListener('click', () => jumpToStage(index));
      dotsContainer.appendChild(button);
    });
  }

  function measureStageMetrics() {
    if (!stage) return;
    const navEl = document.querySelector('.navbar');
    const navHeight = navEl ? navEl.getBoundingClientRect().height : 0;
    stage.style.setProperty('--stage-top', `${navHeight}px`);
  }

  function jumpToStage(index) {
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const wrapperTop = window.scrollY + rect.top;
    const target = computeTargetScrollTop(index, wrapperTop, rect.height, window.innerHeight, STAGE_COUNT);
    window.scrollTo({ top: target, behavior: reducedMotionQuery.matches ? 'auto' : 'smooth' });
  }

  function updateCopyVisibility(stageFloat) {
    const activeIndex = Math.round(stageFloat);
    stageArticles.forEach((article, index) => {
      const distance = computePanelDistance(index, stageFloat);
      article.style.setProperty('--stage-distance', distance.toFixed(3));
      // Igual que .reveal-on-scroll (ver CLAUDE.md, "Rediseño futurista"):
      // opacity sola no basta, axe mide el contraste de un texto en
      // opacity:0 contra el fondo que compone detrás. visibility explícito
      // saca del árbol de accesibilidad a las 3 etapas no activas.
      article.style.visibility = distance < 0.5 ? 'visible' : 'hidden';
      if (dotsContainer) {
        const dot = dotsContainer.children[index];
        if (index === activeIndex) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      }
    });
  }

  function updateProcess(rect, viewportHeight) {
    // Mismo guard de rendimiento que services-scene (CLAUDE.md, sección
    // "Rendimiento"): sin él, cualquier scroll en el resto de la página
    // sigue recalculando y escribiendo estilos para siempre aunque el
    // resultado ya esté clamped y no vaya a cambiar visualmente.
    if (hasRenderedOnce && (rect.bottom < 0 || rect.top > viewportHeight)) return;
    hasRenderedOnce = true;
    window.__processSceneDebug.updateCalls = (window.__processSceneDebug.updateCalls || 0) + 1;
    const progress = clampProgress(-rect.top / (rect.height - viewportHeight));
    const stageFloat = computeScrubIndex(progress, STAGE_COUNT);
    section.style.setProperty('--process-progress', progress.toFixed(3));
    window.__processSceneDebug.stageFloat = stageFloat;
    updateCopyVisibility(stageFloat);
    if (canvasEngine) canvasEngine.render(stageFloat, progress);
  }

  function enhance() {
    if (window.__processSceneDebug.enhanced) return;
    wrapper = document.createElement('div');
    wrapper.className = 'process-scrubber';
    wrapper.style.height = `calc(100vh + ${SEGMENT_COUNT * VH_PER_SEGMENT}vh)`;

    stage = document.createElement('div');
    stage.className = 'process-stage-pinned';

    const visual = document.createElement('div');
    visual.className = 'process-visual';
    const canvas = document.createElement('canvas');
    canvas.className = 'process-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    visual.appendChild(canvas);

    const copy = document.createElement('div');
    copy.className = 'process-copy';
    stageArticles.forEach((article) => {
      article.classList.remove('reveal-on-scroll', 'is-visible');
      copy.appendChild(article);
    });

    buildDots();
    // Mismo patrón que .services-progress-rail (Transición B): sin esto, el
    // tramo final del recorrido (cuando el stage se despega del pineado y
    // sigue desplazándose con la página antes de llegar a #tecnologias)
    // se veía como un vacío mucho más grande que el de la Transición B en
    // el mismo punto geométrico — B llena ese tramo con su fila de
    // indicadores + barra; C solo tenía 4 puntos diminutos (confirmado con
    // evidencia visual real, mismo stageBottom/gap en ambas, pero B se leía
    // "lleno" y C "vacío"). Reutilizar la barra unifica el lenguaje visual
    // de las dos transiciones con scrub pineado, como pide la Fase 4.
    const progressRail = document.createElement('div');
    progressRail.className = 'process-progress-rail';
    stage.append(visual, copy, dotsContainer, progressRail);
    wrapper.appendChild(stage);
    stagesContainer.replaceWith(wrapper);

    section.dataset.scene = 'canvas';
    hasRenderedOnce = false;

    function buildCanvasEngine() {
      try {
        const tier = pickDeviceTier({
          hardwareConcurrency: navigator.hardwareConcurrency,
          viewportWidth: window.innerWidth,
        });
        canvasEngine = new ProcessCanvas(canvas, tier.particleCount);
        canvasEngine.resize(tier.dprCap);
        window.__processSceneDebug.canvasAvailable = true;
      } catch (error) {
        // Degradación silenciosa (requisito: "comportamiento cuando Canvas/
        // WebGL no están disponibles"): la escena sigue funcionando sin el
        // lienzo — el texto de las 4 etapas y el CTA siguen presentes y
        // funcionales, solo sin el dibujo de partículas.
        console.warn('process-scene: Canvas2D no disponible —', error);
        canvasEngine = null;
        canvas.toggleAttribute('hidden', true);
        window.__processSceneDebug.canvasAvailable = false;
      }
      window.__processSceneDebug.canvasBuilt = true;
    }

    // Construir la geometría de las 4 etapas (buildStageLayouts, dentro del
    // constructor de ProcessCanvas) es el trabajo más caro de esta escena, y
    // #proceso queda muy por debajo del pliegue — nadie lo ve ni interactúa
    // con él en el primer momento tras cargar la página. Diferirlo a tiempo
    // de inactividad (en vez de construirlo de inmediato en sync(), como
    // antes) saca ese costo del camino crítico de carga: medido con
    // Lighthouse (Fase 4, auditoría de rendimiento) el Total Blocking Time
    // bajó de forma consistente al mover esta construcción fuera del
    // arranque síncrono. requestIdleCallback no existe en Safari/WebKit —
    // setTimeout(0) como respaldo sigue sacándolo del flujo síncrono inicial
    // aunque no aproveche tiempo de inactividad real.
    // updateProcess() ya tolera canvasEngine === null (guard existente), así
    // que no hay ventana donde esto pueda fallar si el usuario hace scroll
    // antes de que termine.
    const scheduleIdle = typeof requestIdleCallback === 'function'
      ? requestIdleCallback
      : (cb) => setTimeout(cb, 0);
    scheduleIdle(buildCanvasEngine);

    window.addEventListener('resize', () => {
      if (canvasEngine) {
        const tier = pickDeviceTier({
          hardwareConcurrency: navigator.hardwareConcurrency,
          viewportWidth: window.innerWidth,
        });
        canvasEngine.resize(tier.dprCap);
      }
    });

    window.__processSceneDebug.enhanced = true;
    scrollHandle = registerScrollRegion(wrapper, updateProcess);
  }

  function revert() {
    if (!window.__processSceneDebug.enhanced) return;
    if (scrollHandle) scrollHandle.unregister();
    const freshStages = document.createElement('div');
    freshStages.className = 'process-stages';
    stageArticles.forEach((article) => {
      article.style.removeProperty('--stage-distance');
      article.style.removeProperty('visibility');
      article.classList.add('reveal-on-scroll');
      freshStages.appendChild(article);
    });
    section.style.removeProperty('--process-progress');
    wrapper.replaceWith(freshStages);
    stagesContainer = freshStages;
    delete section.dataset.scene;
    wrapper = null;
    stage = null;
    dotsContainer = null;
    canvasEngine = null;
    window.__processSceneDebug.enhanced = false;
  }

  function sync() {
    if (shouldEnhance()) {
      enhance();
      measureStageMetrics();
    } else {
      revert();
    }
  }

  sync();
  desktopQuery.addEventListener('change', sync);
  reducedMotionQuery.addEventListener('change', sync);
  window.addEventListener('resize', sync);

  return { jumpToStage, sync };
}

if (typeof window !== 'undefined' && window.document) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProcessScene);
  } else {
    initProcessScene();
  }
}
