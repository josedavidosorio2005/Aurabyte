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

// El riel arranca centrado por justify-content:center — su centro natural
// (sin ningún translateX) es el panel del medio, (count-1)/2, no el
// panel 0. El offset necesario para traer el panel en scrubIndex al
// centro se mide desde ESE centro natural, en pasos de panelStepRem
// (ancho de panel + gap entre paneles, ver services-scene.css).
export function computeRailOffsetRem(scrubIndex, count, panelStepRem) {
  const centerIndex = (count - 1) / 2;
  return (centerIndex - scrubIndex) * panelStepRem;
}

const DESKTOP_QUERY = '(min-width: 1024px)';
const SCRUB_VH_PER_PANEL = 55;
// Debe coincidir con services-scene.css: flex: 0 0 20rem (ancho) + gap:
// 3rem entre paneles consecutivos = 23rem de centro a centro.
const PANEL_WIDTH_REM = 20;
const PANEL_GAP_REM = 3;
const PANEL_STEP_REM = PANEL_WIDTH_REM + PANEL_GAP_REM;

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
    const railOffsetRem = computeRailOffsetRem(scrubIndex, count, PANEL_STEP_REM);
    rail.style.setProperty('--rail-offset', `${railOffsetRem.toFixed(3)}rem`);
    panels.forEach((panel, index) => {
      const distance = computePanelDistance(index, scrubIndex);
      panel.style.setProperty('--panel-distance', distance.toFixed(3));
      // Blur acotado a los vecinos inmediatos (distancia 1-2): fuera de
      // ese rango el panel nunca paga el costo de un filtro — ni el
      // activo (distancia 0) ni los paneles lejanos (distancia > 2).
      const blur = distance >= 1 && distance <= 2 ? (distance - 1) * 6 : 0;
      panel.style.setProperty('--blur-amount', `${blur.toFixed(2)}px`);
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

    // Los indicadores y la barra de progreso van DENTRO de .services-stage
    // (position:sticky, height:100vh), no como hermanos del scrubber
    // completo (que mide 100vh + 7*55vh) — si quedaran fuera, solo serían
    // visibles después de scrollear las casi 5 pantallas del recorrido
    // completo, inútiles como navegación mientras se hace scrub.
    buildIndicators();
    stage.appendChild(indicatorsContainer);
    const progressRail = document.createElement('div');
    progressRail.className = 'services-progress-rail';
    stage.appendChild(progressRail);

    wrapper.appendChild(stage);
    panelsContainer.replaceWith(wrapper);

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
    // indicatorsContainer vive dentro de .services-stage mientras está
    // mejorado — hay que sacarlo de ahí ANTES de descartar wrapper, o se
    // pierde junto con el resto del riel en vez de volver a su lugar
    // original (hermano de .services-panels).
    indicatorsContainer.innerHTML = '';
    indicatorsContainer.toggleAttribute('hidden', true);
    wrapper.replaceWith(freshPanelsContainer);
    freshPanelsContainer.insertAdjacentElement('afterend', indicatorsContainer);
    panelsContainer = freshPanelsContainer;
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
