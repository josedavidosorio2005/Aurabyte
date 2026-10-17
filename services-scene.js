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
  let hasRenderedOnce = false;

  function shouldEnhance() {
    return desktopQuery.matches && !reducedMotionQuery.matches;
  }

  function buildIndicators() {
    indicatorsContainer.innerHTML = '';
    indicatorsContainer.toggleAttribute('hidden', false);
    panels.forEach((panel, index) => {
      const heading = panel.querySelector('h3');
      const fullName = heading ? heading.textContent.trim() : `Servicio ${index + 1}`;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'services-indicator';
      // Texto visible corto (primera palabra del título real — distinta
      // para los 8 servicios) para que la fila de indicadores quepa en
      // una sola línea; el nombre completo sigue disponible para lectores
      // de pantalla y como tooltip. Una fila que se parte en 3-4 renglones
      // (con el título completo) empujaba el CTA del panel activo fuera
      // de su alcance de click — encontrado en revisión de rama completa.
      button.textContent = fullName.split(' ')[0];
      button.setAttribute('aria-label', fullName);
      button.title = fullName;
      button.addEventListener('click', () => jumpToPanel(index));
      indicatorsContainer.appendChild(button);
    });
  }

  // Mide la altura real de la navbar fija y de la franja de indicadores
  // (que varía con el ancho de viewport y el contenido) en vez de asumir
  // valores fijos — un valor adivinado solo queda bien en el viewport
  // donde se probó (encontrado en revisión: a 1280×768/1024×768 el título
  // y el ícono de cada panel quedaban detrás de la navbar, y en varios
  // anchos el CTA del panel activo quedaba tapado por los indicadores).
  function measureStageMetrics() {
    if (!wrapper) return;
    const stage = wrapper.querySelector('.services-stage');
    if (!stage) return;
    const navEl = document.querySelector('.navbar');
    const navHeight = navEl ? navEl.getBoundingClientRect().height : 0;
    const progressRail = stage.querySelector('.services-progress-rail');
    const indicatorsHeight = indicatorsContainer.getBoundingClientRect().height;
    const progressHeight = progressRail ? progressRail.getBoundingClientRect().height : 0;
    const reservePx = indicatorsHeight + progressHeight + 48;
    stage.style.setProperty('--stage-top', `${navHeight}px`);
    stage.style.setProperty('--indicator-reserve', `${reservePx}px`);
  }

  function jumpToPanel(index) {
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const wrapperTop = window.scrollY + rect.top;
    const target = computeTargetScrollTop(index, wrapperTop, rect.height, window.innerHeight, count);
    window.scrollTo({ top: target, behavior: reducedMotionQuery.matches ? 'auto' : 'smooth' });
  }

  function updateScrub(rect, viewportHeight) {
    // El spec (sección "Rendimiento") pide pausar la escritura por frame
    // cuando la sección no está en viewport — sin esto, cada scroll en
    // CUALQUIER parte del resto de la página (footer, contacto, etc.)
    // seguía recalculando y escribiendo 8+ propiedades por panel para
    // siempre, aunque el resultado ya estuviera clamped en 0 o 1 y no
    // fuera a cambiar visualmente. rect es el del propio wrapper pineado
    // (hasta ~485vh de alto), así que esta condición solo es cierta
    // cuando estamos lejos de él en cualquier dirección.
    // La primera llamada (registro inicial en registerScrollRegion) nunca
    // se salta, aunque la sección esté lejos del viewport — es la que
    // establece el estado de reposo correcto (rail-offset, distancias)
    // antes de cualquier scroll real. Sin esta excepción, "centrado" y
    // "asentado" se rompían: #servicios normalmente empieza fuera de
    // vista al cargar la página (misión-visión y valores quedan antes),
    // así que el guard de rendimiento saltaba también esa primera
    // escritura necesaria.
    if (hasRenderedOnce && (rect.bottom < 0 || rect.top > viewportHeight)) return;
    hasRenderedOnce = true;
    window.__servicesSceneDebug.updateScrubCalls = (window.__servicesSceneDebug.updateScrubCalls || 0) + 1;
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

    // .reveal-on-scroll.is-visible (script.js, IntersectionObserver) tiene
    // más especificidad CSS que las reglas de profundidad del riel — una
    // vez que un panel pasa cerca del centro y el observer lo marca
    // .is-visible, esa clase fijaba opacity:1/transform:none PARA SIEMPRE,
    // incluso lejos del centro después (encontrado en revisión de rama
    // completa, confirmado con scroll gradual real — un salto instantáneo
    // no lo revela, porque el observer nunca llega a disparar para los
    // paneles intermedios). El riel gestiona su propia visibilidad por
    // completo vía --panel-distance; el mecanismo genérico de
    // reveal-on-scroll no debe competir con él mientras está pineado.
    panels.forEach((panel) => {
      panel.classList.remove('reveal-on-scroll', 'is-visible');
      rail.appendChild(panel);
    });
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
    // Cada ciclo enhance() es un nuevo "primer frame": si la sección se
    // revierte (móvil/resize) y se vuelve a mejorar más tarde, su propia
    // primera escritura tampoco debe saltarse aunque en ese momento esté
    // lejos del viewport.
    hasRenderedOnce = false;
    scrollHandle = registerScrollRegion(wrapper, updateScrub);
  }

  function revert() {
    if (!window.__servicesSceneDebug.enhanced) return;
    if (scrollHandle) scrollHandle.unregister();
    const freshPanelsContainer = document.createElement('div');
    freshPanelsContainer.className = 'services-panels';
    panels.forEach((panel) => {
      panel.style.removeProperty('--panel-distance');
      panel.style.removeProperty('--blur-amount');
      panel.classList.add('reveal-on-scroll');
      freshPanelsContainer.appendChild(panel);
    });
    section.style.removeProperty('--services-progress');
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
      // Siempre, no solo la primera vez: si la ventana se redimensiona
      // sin cruzar el breakpoint (p. ej. 1920 -> 1280), enhance() ya
      // estaba activo y no vuelve a medir por sí solo — la franja de
      // indicadores puede envolver distinto en el nuevo ancho.
      measureStageMetrics();
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
