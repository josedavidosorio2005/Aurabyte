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
