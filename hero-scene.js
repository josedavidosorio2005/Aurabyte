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
