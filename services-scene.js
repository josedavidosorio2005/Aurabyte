// services-scene.js
import { clampProgress } from './scroll-progress.min.js';

export function computeScrubProgress(rect, viewportHeight) {
  return clampProgress(-rect.top / (rect.height - viewportHeight));
}

export function computeScrubIndex(progress, count) {
  return progress * (count - 1);
}

export function computePanelDistance(index, scrubIndex) {
  return Math.abs(index - scrubIndex);
}

export function computeTargetScrollTop(index, wrapperTop, wrapperHeight, viewportHeight, count) {
  const progress = index / (count - 1);
  return wrapperTop + progress * (wrapperHeight - viewportHeight);
}
