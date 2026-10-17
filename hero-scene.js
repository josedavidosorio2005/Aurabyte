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
    this.frame = this.frame.bind(this);
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

  setThemeColors() {
    this.color = readThemeColors();
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
    this.resetAttributes();
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

  if (!network) {
    fallback.toggleAttribute('hidden', false);
    canvas.toggleAttribute('hidden', true);
    const api = { setThemeColors() {}, pause() {}, resume() {} };
    window.AuraHeroScene = api;
    return api;
  }

  fallback.toggleAttribute('hidden', true);
  canvas.toggleAttribute('hidden', false);
  network.resize();
  network.start();
  window.__heroSceneDebug.running = true;
  window.addEventListener('resize', () => network.resize());

  window.__heroSceneDebug.color = network.color;
  const api = {
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
  window.AuraHeroScene = api;

  const heroSection = document.getElementById('inicio');

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

  let scrollFrame = null;
  function updateTransition() {
    scrollFrame = null;
    const rect = heroSection.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, -rect.top / rect.height));
    network.setTransitionProgress(progress);
    if (progress >= 1) {
      api.pause();
    } else if (!window.__heroSceneDebug.running) {
      api.resume();
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
