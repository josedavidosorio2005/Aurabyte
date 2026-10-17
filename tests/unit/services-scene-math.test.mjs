import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeScrubProgress,
  computeScrubIndex,
  computePanelDistance,
  computeTargetScrollTop,
  computeRailOffsetRem,
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

test('computeRailOffsetRem trae el panel en scrubIndex al centro visual, no al índice 0 (regresión: el riel arranca centrado por justify-content:center)', () => {
  // Con 8 paneles, el centro natural de la fila (translateX=0, sin
  // offset) es el panel 3.5 — a scrubIndex=0 el offset debe desplazar
  // la fila hacia la derecha exactamente 3.5 pasos para traer el panel
  // 0 al centro, no dejarla en su posición natural (que mostraría el
  // panel ~3-4 centrado, confirmado por evidencia visual real antes de
  // este fix).
  const panelStepRem = 23;
  assert.equal(computeRailOffsetRem(0, 8, panelStepRem), 3.5 * panelStepRem);
  assert.equal(computeRailOffsetRem(3.5, 8, panelStepRem), 0);
  assert.equal(computeRailOffsetRem(7, 8, panelStepRem), -3.5 * panelStepRem);
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
