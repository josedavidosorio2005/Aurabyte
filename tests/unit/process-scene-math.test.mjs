import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSegment,
  computeSlotCounts,
  hashUnit,
  buildIdeaLayout,
  buildDesignLayout,
  buildDevelopmentLayout,
  buildSolutionLayout,
  buildStageLayouts,
  lerpColorChannel,
  hexToRgbTuple,
  computeJourneyColor,
} from '../../process-scene.js';

test('computeSegment ubica el progreso en el segmento correcto, acotado a [0, SEGMENT_COUNT-1]', () => {
  assert.deepEqual(computeSegment(0), { segment: 0, localT: 0 });
  assert.deepEqual(computeSegment(0.5), { segment: 0, localT: 0.5 });
  assert.deepEqual(computeSegment(1), { segment: 1, localT: 0 });
  const atSegment2 = computeSegment(2.9);
  assert.equal(atSegment2.segment, 2);
  assert.ok(Math.abs(atSegment2.localT - 0.9) < 1e-9, `localT inesperado: ${atSegment2.localT}`);
  // 4 etapas -> 3 segmentos (SEGMENT_COUNT=3), índices de segmento válidos 0..2.
  assert.deepEqual(computeSegment(3), { segment: 2, localT: 1 });
  // stageFloat negativo o mayor que el máximo se acota, no revienta.
  assert.deepEqual(computeSegment(-1), { segment: 0, localT: 0 });
  assert.deepEqual(computeSegment(10), { segment: 2, localT: 1 });
});

test('computeSlotCounts reparte el total exacto entre los 4 slots fijos (sin perder ni sobrar partículas)', () => {
  for (const total of [51, 91, 151, 4, 1000]) {
    const counts = computeSlotCounts(total);
    assert.equal(counts.length, 4);
    assert.equal(counts.reduce((a, b) => a + b, 0), total);
    counts.forEach((c) => assert.ok(c >= 0, `slot negativo en total=${total}: ${counts}`));
  }
});

test('hashUnit es determinístico y cae siempre en [0, 1)', () => {
  for (const i of [0, 1, 2, 500, 12345]) {
    const a = hashUnit(i);
    const b = hashUnit(i);
    assert.equal(a, b);
    assert.ok(a >= 0 && a < 1, `hashUnit(${i}) = ${a} fuera de rango`);
  }
});

test('las 4 escenas devuelven exactamente `total` puntos — identidad de partícula estable entre etapas', () => {
  for (const total of [51, 91, 151]) {
    const layouts = buildStageLayouts(total);
    layouts.forEach((layout, stageIndex) => {
      assert.equal(layout.points.length, total, `etapa ${stageIndex} con total=${total}`);
      layout.points.forEach((p) => {
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `punto no finito en etapa ${stageIndex}`);
      });
    });
  }
});

test('las aristas de cada escena solo referencian índices válidos de su propio arreglo de puntos', () => {
  const layouts = buildStageLayouts(91);
  layouts.forEach((layout, stageIndex) => {
    layout.edges.forEach(([i, j]) => {
      assert.ok(i >= 0 && i < layout.points.length, `arista fuera de rango en etapa ${stageIndex}: ${i}`);
      assert.ok(j >= 0 && j < layout.points.length, `arista fuera de rango en etapa ${stageIndex}: ${j}`);
    });
  });
});

test('buildIdeaLayout: el anillo principal (slot A) queda centrado en el origen, no desplazado', () => {
  const { points } = buildIdeaLayout(151);
  const slotACount = computeSlotCounts(151)[0];
  const ring = points.slice(0, slotACount);
  const avgX = ring.reduce((sum, p) => sum + p.x, 0) / ring.length;
  const avgY = ring.reduce((sum, p) => sum + p.y, 0) / ring.length;
  assert.ok(Math.abs(avgX) < 0.01, `centro X del anillo desviado: ${avgX}`);
  assert.ok(Math.abs(avgY) < 0.01, `centro Y del anillo desviado: ${avgY}`);
});

test('buildDesignLayout/buildDevelopmentLayout/buildSolutionLayout mantienen el marco exterior (slot A) dentro de los mismos límites en las 3 etapas', () => {
  const total = 151;
  const slotACount = computeSlotCounts(total)[0];
  [buildDesignLayout(total), buildDevelopmentLayout(total), buildSolutionLayout(total)].forEach((layout) => {
    const frame = layout.points.slice(0, slotACount);
    frame.forEach((p) => {
      assert.ok(Math.abs(p.x) <= 0.86, `punto del marco fuera de ancho esperado: ${p.x}`);
      assert.ok(Math.abs(p.y) <= 0.53, `punto del marco fuera de alto esperado: ${p.y}`);
    });
  });
});

test('lerpColorChannel interpola linealmente y redondea a entero', () => {
  assert.equal(lerpColorChannel(0, 100, 0), 0);
  assert.equal(lerpColorChannel(0, 100, 1), 100);
  assert.equal(lerpColorChannel(0, 100, 0.5), 50);
});

test('hexToRgbTuple decodifica los 3 colores de marca usados en el recorrido', () => {
  assert.deepEqual(hexToRgbTuple('#22d3ee'), [34, 211, 238]);
  assert.deepEqual(hexToRgbTuple('#3b82f6'), [59, 130, 246]);
  assert.deepEqual(hexToRgbTuple('#8b5cf6'), [139, 92, 246]);
});

test('computeJourneyColor recorre cian -> azul -> violeta de forma continua (sin saltos en el punto medio)', () => {
  const stops = [[0, 0, 0], [100, 100, 100], [200, 200, 200]];
  assert.deepEqual(computeJourneyColor(0, stops), [0, 0, 0]);
  assert.deepEqual(computeJourneyColor(0.5, stops), [100, 100, 100]);
  assert.deepEqual(computeJourneyColor(1, stops), [200, 200, 200]);
  // Continuidad en el punto medio: justo antes y justo después de 0.5 deben
  // dar casi el mismo color (ambos tramos convergen en el stop del medio).
  const justBefore = computeJourneyColor(0.4999, stops);
  const justAfter = computeJourneyColor(0.5001, stops);
  justBefore.forEach((v, i) => assert.ok(Math.abs(v - justAfter[i]) <= 1));
});
