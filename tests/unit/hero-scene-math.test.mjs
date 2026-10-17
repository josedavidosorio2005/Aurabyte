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
