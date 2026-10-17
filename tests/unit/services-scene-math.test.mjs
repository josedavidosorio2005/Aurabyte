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
