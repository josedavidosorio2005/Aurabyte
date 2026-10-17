// services-scene.js
import { clampProgress, registerScrollRegion } from './scroll-progress.min.js';

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

const DESKTOP_QUERY = '(min-width: 1024px)';
const SCRUB_VH_PER_PANEL = 55;

// La Transición B solo se construye en escritorio y sin movimiento
// reducido (ver spec: "reduced-motion y móvil = bypass completo"). El
// marcado de #servicios siempre existe como lista plana con contenido
// real — esta función MUEVE esos mismos nodos a la estructura pineada
// en vez de clonarlos, así nunca hay dos copias del contenido en el DOM.
export function initServicesScene() {
  const section = document.getElementById('servicios');
  if (!section) return null;
  let panelsContainer = section.querySelector('.services-panels');
  const indicatorsContainer = section.querySelector('.services-indicators');
  const panels = Array.from(panelsContainer.querySelectorAll('.service-panel'));
  const count = panels.length;

  window.__servicesSceneDebug = { enhanced: false };

  const desktopQuery = window.matchMedia(DESKTOP_QUERY);
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  let wrapper = null;
  let rail = null;
  let scrollHandle = null;

  function shouldEnhance() {
    return desktopQuery.matches && !reducedMotionQuery.matches;
  }

  function buildIndicators() {
    indicatorsContainer.innerHTML = '';
    indicatorsContainer.toggleAttribute('hidden', false);
    panels.forEach((panel, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'services-indicator';
      button.textContent = panel.querySelector('h3').textContent;
      button.addEventListener('click', () => jumpToPanel(index));
      indicatorsContainer.appendChild(button);
    });
  }

  function jumpToPanel(index) {
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const wrapperTop = window.scrollY + rect.top;
    const target = computeTargetScrollTop(index, wrapperTop, rect.height, window.innerHeight, count);
    window.scrollTo({ top: target, behavior: reducedMotionQuery.matches ? 'auto' : 'smooth' });
  }

  function updateScrub(rect, viewportHeight) {
    const progress = computeScrubProgress(rect, viewportHeight);
    const scrubIndex = computeScrubIndex(progress, count);
    section.style.setProperty('--services-progress', progress.toFixed(3));
    rail.style.setProperty('--services-scrub-index', scrubIndex.toFixed(3));
    panels.forEach((panel, index) => {
      panel.style.setProperty('--panel-distance', computePanelDistance(index, scrubIndex).toFixed(3));
    });
    const activeIndex = Math.round(scrubIndex);
    Array.from(indicatorsContainer.children).forEach((button, index) => {
      if (index === activeIndex) {
        button.setAttribute('aria-current', 'true');
      } else {
        button.removeAttribute('aria-current');
      }
    });
  }

  function enhance() {
    if (window.__servicesSceneDebug.enhanced) return;
    wrapper = document.createElement('div');
    wrapper.className = 'services-scrubber';
    wrapper.style.height = `calc(100vh + ${(count - 1) * SCRUB_VH_PER_PANEL}vh)`;

    const stage = document.createElement('div');
    stage.className = 'services-stage';

    rail = document.createElement('div');
    rail.className = 'services-rail';

    panels.forEach((panel) => rail.appendChild(panel));
    stage.appendChild(rail);
    wrapper.appendChild(stage);
    panelsContainer.replaceWith(wrapper);

    buildIndicators();
    section.dataset.scene = 'rail';
    window.__servicesSceneDebug.enhanced = true;
    scrollHandle = registerScrollRegion(wrapper, updateScrub);
  }

  function revert() {
    if (!window.__servicesSceneDebug.enhanced) return;
    if (scrollHandle) scrollHandle.unregister();
    const freshPanelsContainer = document.createElement('div');
    freshPanelsContainer.className = 'services-panels';
    panels.forEach((panel) => {
      panel.style.removeProperty('--panel-distance');
      freshPanelsContainer.appendChild(panel);
    });
    wrapper.replaceWith(freshPanelsContainer);
    panelsContainer = freshPanelsContainer;
    indicatorsContainer.innerHTML = '';
    indicatorsContainer.toggleAttribute('hidden', true);
    delete section.dataset.scene;
    wrapper = null;
    rail = null;
    window.__servicesSceneDebug.enhanced = false;
  }

  function sync() {
    if (shouldEnhance()) {
      enhance();
    } else {
      revert();
    }
  }

  sync();
  desktopQuery.addEventListener('change', sync);
  reducedMotionQuery.addEventListener('change', sync);
  window.addEventListener('resize', sync);

  return { jumpToPanel, sync };
}

if (typeof window !== 'undefined' && window.document) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initServicesScene);
  } else {
    initServicesScene();
  }
}
