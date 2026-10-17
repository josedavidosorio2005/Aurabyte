// hero-scene.js
// Geometría muestreada directamente del triángulo "A" de logo.svg (mismos
// puntos que logo.svg:10 y el brillo de logo.svg:13) — la constelación de
// partículas converge en la marca real, no en una forma inventada.
const MONOGRAM_OUTLINE_2D = [
  [15, 45], [30, 15], [45, 45], [38, 45], [30, 28], [22, 45],
];
const MONOGRAM_SPARKLE_2D = [32, 18];
// No 1/8, como en un commit anterior de este mismo branch: a 1/8 el
// contorno proyectado medía ~881px de alto en un canvas de ~470px — la
// apex del monograma quedaba recortada muy por fuera del canvas, y lo
// único visible eran fragmentos de línea en los bordes (confirmado por
// captura y por revisión de rama completa). El spec marca la forma del
// monograma como "Decisiones ya tomadas con el usuario (no reabrir sin
// que él lo pida)" — 1/8 reabría esa decisión sin pedirlo.
//
// El valor exacto (1/30, no la estimación lineal ingenua de ~1/22) sale
// de computar el peor caso real: la cara trasera de la extrusión
// (z = -depth/2) se agranda por la proyección en perspectiva en vez de
// achicarse, así que la apex del triángulo en esa cara es el punto que
// más se acerca al borde del canvas — ver el test de regresión en
// tests/unit/hero-scene-math.test.mjs que verifica esto directamente en
// vez de confiar en un cálculo a mano.
const MONOGRAM_SCALE = 1 / 30;

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

// --- Orquestación WebGL/DOM (sin equivalente de prueba unitaria: requiere
// un canvas real, se prueba vía Playwright en tests/e2e/hero-scene.spec.js) ---

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
  // --primary-color no cambia entre temas (ver CLAUDE.md, "Contraste de
  // color: ya resuelto") — --primary-text sí (#0369a1 claro / #0ea5e9
  // oscuro), por eso es la variable correcta para un color que de verdad
  // debe reaccionar al cambio de tema.
  const value = getComputedStyle(document.body).getPropertyValue('--primary-text').trim();
  return hexToRgb(value || '#0ea5e9');
}

class ParticleNetwork {
  constructor(canvas, geometry, tier) {
    this.canvas = canvas;
    this.geometry = geometry;
    this.tier = tier;
    // antialias:false — el multisampling en un rasterizador por software
    // (WebKit/Firefox headless sin GPU) puede ser drásticamente más caro
    // que en hardware; los puntos/líneas ya llevan su propio suavizado
    // vía smoothstep en el fragment shader, así que MSAA no aporta mucho
    // aquí a cambio de ese costo.
    this.gl = canvas.getContext('webgl', { alpha: true, antialias: false });
    if (!this.gl) throw new Error('WebGL no disponible');

    this.pointProgram = createProgram(this.gl, VERTEX_SHADER, FRAGMENT_SHADER_POINTS);
    this.lineProgram = createProgram(this.gl, VERTEX_SHADER, FRAGMENT_SHADER_LINES);
    this.positionBuffer = this.gl.createBuffer();
    this.pointSizeBuffer = this.gl.createBuffer();
    this.colorBuffer = this.gl.createBuffer();
    this.linePositionBuffer = this.gl.createBuffer();
    this.lineColorBuffer = this.gl.createBuffer();

    // Cachear locations una sola vez: gl.getAttribLocation/getUniformLocation
    // hacen una búsqueda por nombre en el driver — repetirlas en cada frame
    // (antes: 7 búsquedas/frame entre ambos programas) es caro de verdad
    // bajo un rasterizador por software, donde se confirmó frameCount
    // atascado en 1 durante >15s en CI (WebKit sin GPU).
    this.pointLocations = {
      position: this.gl.getAttribLocation(this.pointProgram, 'a_position'),
      pointSize: this.gl.getAttribLocation(this.pointProgram, 'a_pointSize'),
      color: this.gl.getAttribLocation(this.pointProgram, 'a_color'),
      resolution: this.gl.getUniformLocation(this.pointProgram, 'u_resolution'),
    };
    this.lineLocations = {
      position: this.gl.getAttribLocation(this.lineProgram, 'a_position'),
      color: this.gl.getAttribLocation(this.lineProgram, 'a_color'),
      resolution: this.gl.getUniformLocation(this.lineProgram, 'u_resolution'),
    };

    // Buffers tipados reutilizables: el tamaño nunca cambia tras construir
    // la escena (geometry.points/edges son fijos), así que se reserva una
    // sola vez en vez de un Float32Array nuevo (con su reserva + GC) en
    // cada uno de los dos draw calls de cada frame.
    const pointCount = geometry.points.length;
    const edgeCount = geometry.edges.length;
    this.pointPositions = new Float32Array(pointCount * 2);
    this.pointSizes = new Float32Array(pointCount);
    this.pointColors = new Float32Array(pointCount * 4);
    this.linePositions = new Float32Array(edgeCount * 4);
    this.lineColors = new Float32Array(edgeCount * 8);

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
    this.rafId = null;
    this.frame = this.frame.bind(this);
    // Punto hacia el que migra la red en la Transición A — por defecto el
    // mismo vector que antes (abajo a la derecha) hasta que
    // setDispersedTarget() lo reemplace con la posición real de
    // #servicios; computeDispersedPositions() reparte cada partícula en
    // un anillo alrededor de ese punto en vez de desplazarlas todas por
    // el mismo delta uniforme.
    this.setDispersedTarget({ x: 1.6, y: -1.1 });
  }

  setDispersedTarget(target) {
    this.dispersedTarget = target;
    this.dispersedPositions = computeDispersedPositions(this.geometry.points, target);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.tier.dprCap);
    const { clientWidth, clientHeight } = this.canvas;
    this.canvas.width = Math.max(1, Math.round(clientWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(clientHeight * dpr));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.startTime = this.startTime ?? performance.now();
    // Puede haber un rAF ya agendado (p. ej. pause() seguido de resume()
    // en el mismo tick, antes de que el callback anterior corriera) — sin
    // cancelarlo primero, ambas cadenas quedan vivas y cada una se
    // reagenda sola para siempre, multiplicando el frame rate real.
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(this.frame);
  }

  pause() {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  resume() {
    if (this.running) return;
    this.start();
  }

  snapToSettled() {
    this.reducedMotion = true;
    this.startTime = performance.now() - ASSEMBLE_DURATION_MS - 1;
  }

  // Distinto de snapToSettled(): esto solo corta la animación de
  // ensamblaje en curso al estado final (spec: "cualquier scroll o click
  // durante la secuencia la corta al estado final de inmediato"), sin
  // activar reducedMotion — el drift ambiental y la reacción al puntero
  // siguen funcionando después, a diferencia de snapToSettled().
  skipIntro() {
    this.startTime = performance.now() - ASSEMBLE_DURATION_MS - 1;
  }

  setPointerOffset(x, y) {
    this.pointerOffset = { x, y };
  }

  setThemeColors() {
    this.color = readThemeColors();
  }

  setTransitionProgress(progress) {
    this.transitionProgress = Math.min(1, Math.max(0, progress));
  }

  frame(now) {
    this.rafId = null;
    if (!this.running) return;
    this.render(now);
    window.__heroSceneDebug.frameCount += 1;
    this.rafId = requestAnimationFrame(this.frame);
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
      // Spec: con reduced-motion, la Transición A es de baja amplitud —
      // también aplica al desplazamiento de las partículas, no solo al
      // opacity/scale por CSS.
      const transitionAmplitude = this.reducedMotion ? 0.3 : 1;
      // Migra hacia la posición real de #servicios (ver
      // setDispersedTarget(), llamado desde initHeroScene) en vez de un
      // delta uniforme — cada partícula se abre hacia su propio punto en
      // el anillo que computeDispersedPositions() reparte alrededor del
      // objetivo, así que la red se "dispersa hacia" el área de
      // servicios en vez de solo desplazarse en bloque.
      const dispersed = this.dispersedPositions[index];
      const dispersedProgress = this.transitionProgress * transitionAmplitude;
      const settledX = lerp(point.x, dispersed.x, dispersedProgress);
      const settledY = lerp(point.y, dispersed.y, dispersedProgress);
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

  // El estado de "vertex attribute array" (enabled + puntero) es del
  // contexto WebGL, no del programa — si el compilador asigna índices de
  // atributo distintos entre pointProgram (3 atributos) y lineProgram (2),
  // un atributo que quedó habilitado del draw anterior puede leerse con el
  // layout equivocado en el siguiente ("Vertex buffer is not big enough
  // for the draw call", confirmado en WebKit). Se deshabilitan todos antes
  // de cada draw y solo se habilitan los que ese draw realmente usa.
  resetAttributes() {
    const gl = this.gl;
    for (let location = 0; location < 4; location += 1) {
      gl.disableVertexAttribArray(location);
    }
  }

  drawPoints(projected, now) {
    const gl = this.gl;
    gl.useProgram(this.pointProgram);
    this.resetAttributes();
    const positions = this.pointPositions;
    const sizes = this.pointSizes;
    const colors = this.pointColors;
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
    this.bindAttribute(this.positionBuffer, this.pointLocations.position, positions, 2);
    this.bindAttribute(this.pointSizeBuffer, this.pointLocations.pointSize, sizes, 1);
    this.bindAttribute(this.colorBuffer, this.pointLocations.color, colors, 4);
    gl.uniform2f(this.pointLocations.resolution, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.POINTS, 0, projected.length);
  }

  drawLines(projected) {
    const gl = this.gl;
    gl.useProgram(this.lineProgram);
    this.resetAttributes();
    const positions = this.linePositions;
    const colors = this.lineColors;
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
    this.bindAttribute(this.linePositionBuffer, this.lineLocations.position, positions, 2);
    this.bindAttribute(this.lineColorBuffer, this.lineLocations.color, colors, 4);
    gl.uniform2f(this.lineLocations.resolution, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.LINES, 0, this.geometry.edges.length * 2);
  }

  bindAttribute(buffer, location, data, size) {
    if (location === -1) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  }
}

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
    console.warn('hero-scene: fallback a SVG —', error);
    network = null;
  }

  const heroSection = document.getElementById('inicio');
  let api;

  if (!network) {
    fallback.toggleAttribute('hidden', false);
    canvas.toggleAttribute('hidden', true);
    api = { setThemeColors() {}, pause() {}, resume() {} };
  } else {
    fallback.toggleAttribute('hidden', true);
    canvas.toggleAttribute('hidden', false);
    network.resize();
    network.start();
    window.__heroSceneDebug.running = true;
    window.addEventListener('resize', () => network.resize());

    // Hacia dónde migra la red en la Transición A: la posición real de
    // #servicios relativa al hero (horizontal normalizado por el ancho
    // del hero; vertical siempre hacia abajo, el flujo normal de la
    // página) — no un delta inventado. Se recalcula en resize porque el
    // layout (y por tanto esa relación) puede cambiar.
    function computeServicesTarget() {
      const servicios = document.getElementById('servicios');
      if (!servicios) return { x: 1.6, y: -1.1 };
      const heroRect = heroSection.getBoundingClientRect();
      const svcRect = servicios.getBoundingClientRect();
      const heroCenterX = heroRect.left + heroRect.width / 2;
      const svcCenterX = svcRect.left + svcRect.width / 2;
      const x = ((svcCenterX - heroCenterX) / heroRect.width) * 3.2;
      return { x, y: -1.1 };
    }
    network.setDispersedTarget(computeServicesTarget());
    window.addEventListener('resize', () => network.setDispersedTarget(computeServicesTarget()));

    // Spec: "cualquier scroll o click durante la secuencia la corta al
    // estado final de inmediato" — no bloquea nada (pointer-events:none
    // ya evita que la escena tape los CTAs), solo evita que el usuario
    // vea partículas todavía volando si interactúa antes de que termine.
    window.__heroSceneDebug.introSkipped = false;
    if (!reducedMotion) {
      const skipIntroOnInteraction = () => {
        network.skipIntro();
        window.__heroSceneDebug.introSkipped = true;
        window.removeEventListener('scroll', skipIntroOnInteraction);
        document.removeEventListener('pointerdown', skipIntroOnInteraction);
      };
      window.addEventListener('scroll', skipIntroOnInteraction, { passive: true, once: true });
      document.addEventListener('pointerdown', skipIntroOnInteraction, { once: true });
    }

    window.__heroSceneDebug.color = network.color;
    api = {
      setThemeColors() {
        network.setThemeColors();
        window.__heroSceneDebug.color = network.color;
      },
      pause() {
        network.pause();
        window.__heroSceneDebug.running = false;
      },
      resume() {
        network.resume();
        window.__heroSceneDebug.running = true;
      },
    };

    window.__heroSceneDebug.pointerOffset = { x: 0, y: 0 };
    const canTrackPointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (canTrackPointer) {
      heroSection.addEventListener('pointermove', (event) => {
        const bounds = heroSection.getBoundingClientRect();
        const nx = (event.clientX - bounds.left) / bounds.width - 0.5;
        const ny = (event.clientY - bounds.top) / bounds.height - 0.5;
        const offset = { x: nx * 0.3, y: -ny * 0.3 };
        network.setPointerOffset(offset.x, offset.y);
        window.__heroSceneDebug.pointerOffset = offset;
      }, { passive: true });
    }

    const visibilityObserver = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? api.resume() : api.pause()),
      { threshold: 0 }
    );
    visibilityObserver.observe(canvas);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        api.pause();
      } else if (heroSection.getBoundingClientRect().bottom > 0) {
        api.resume();
      }
    });
  }
  window.AuraHeroScene = api;

  // Transición A (el CSS var/atributo que .hero-scene y .hero-content leen
  // para transformarse con el scroll) no depende de WebGL — es solo
  // opacity/transform por CSS. Se agenda después de que la escena (si
  // existe) ya quedó inicializada/arrancada, para no arrancarla antes de
  // tiempo — pero igual corre siempre, también en el fallback.
  let scrollFrame = null;
  function updateTransition() {
    scrollFrame = null;
    const rect = heroSection.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, -rect.top / rect.height));
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
  window.addEventListener('scroll', () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(updateTransition);
  }, { passive: true });
  window.addEventListener('resize', updateTransition);
  updateTransition();

  return { network, api };
}

if (typeof window !== 'undefined' && window.document) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeroScene);
  } else {
    initHeroScene();
  }
}
