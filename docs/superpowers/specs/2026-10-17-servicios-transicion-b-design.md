# Transición B — Filmstrip cinematográfico de servicios (Fase 2)

**Estado:** Aprobado por el usuario (2026-10-17), con 10 condiciones adicionales vinculantes (ver "Condiciones del usuario" abajo).

**Depende de:** Fase 1 (hero WebGL + Transición A), mergeada en `01f1b7b`. No se reinicia ni se deshace ese trabajo.

## Objetivo

Reemplazar la cuadrícula estática de 8 tarjetas de `#servicios` por una experiencia de scroll continua ("filmstrip horizontal pineado") en escritorio, con una alternativa vertical ligera en móvil y con `prefers-reduced-motion`. No es un carrusel con más efectos — es una escena con profundidad, movimiento de cámara simulado y tipografía animada, conectada visualmente con la Transición A del hero.

## Decisiones ya tomadas con el usuario (no reabrir sin que él lo pida)

1. **Metáfora de interacción:** filmstrip horizontal pineado (elegido explícitamente sobre "mazo de profundidad apilado").
2. **Una sola fuente de contenido:** el HTML es siempre la lista plana de 8 `<article class="service-panel">` con el contenido real. JS, solo en escritorio y sin `prefers-reduced-motion`, **mueve** esos mismos nodos a una estructura pineada — nunca los clona ni duplica.
3. **Sin WebGL nuevo, sin dependencias nuevas.** Todo con CSS transforms/filters nativos + un bucle JS acotado a 8 elementos por frame de scroll.
4. **Motor de scroll compartido:** se extrae la lógica de "un listener de scroll + un rAF" de `hero-scene.js` a un módulo nuevo (`scroll-progress.js`) del que ambas transiciones (A y B) se suscriben. Transición A se refactoriza para usarlo; su comportamiento observable no cambia.
5. **Reduced-motion y móvil = bypass completo** a la lista plana (no una versión atenuada) — justificado porque el efecto es un pineo a toda la viewport, no un movimiento pequeño como en el hero.

## Condiciones del usuario (vinculantes, de su mensaje de aprobación)

1. **Impacto visual:** debe percibirse movimiento de cámara, profundidad y cambio de composición — no un carrusel convencional.
2. **Continuidad:** el hero y los servicios no deben sentirse como componentes independientes.
3. **Servicios:** los 8 servicios reales y sus descripciones reales, cada uno con identidad visual propia y un botón de cotización personalizada por WhatsApp (sin precios).
4. **Rendimiento:** no aplicar blur pesado a los 8 paneles simultáneamente — acotar cuántos paneles reciben filtros costosos a la vez.
5. **Navegación:** el recorrido no debe sentirse excesivamente largo ni atrapar al usuario; debe poder avanzar, retroceder y saltar directo a cualquier servicio.
6. **Accesibilidad:** controles operables por teclado y lector de pantalla, ARIA correcto, sin elementos ocultos que rompan el foco.
7. **Responsive:** verificar también cambios de orientación y tamaño de ventana, no solo el breakpoint estático.
8. **Arquitectura:** el refactor del motor de scroll no debe romper las pruebas existentes de Transición A/hero; no tocar componentes estables sin necesidad.
9. **Evidencia visual:** capturas de varios puntos del recorrido + video si las herramientas lo permiten.
10. **Despliegue:** PR → CI verde → merge a master → GitHub Pages, verificado.

## Arquitectura

### Archivos nuevos

- **`scroll-progress.js`** — motor de scroll compartido de toda la página.
  - `export function registerScrollRegion(element, onProgress)` → devuelve `unregister()`. Un único listener `scroll` (passive) + un único `resize` a nivel de módulo; un único `requestAnimationFrame` en vuelo (el patrón ya usado en `hero-scene.js`, generalizado). En cada frame, recorre los callbacks registrados y les pasa `element.getBoundingClientRect()`.
  - Pura función auxiliar exportada: `export function clampProgress(value)` → `Math.min(1, Math.max(0, value))`.
- **`services-scene.js`** — funciones puras + orquestación:
  - `computeScrubProgress(rect, viewportHeight)` → progreso 0–1 a partir del rect del wrapper pineable (misma fórmula que Transición A: `-rect.top / (rect.height - viewportHeight)`, clamped).
  - `computeScrubIndex(progress, count)` → `progress * (count - 1)` (fraccional, 0..count-1).
  - `computePanelDistance(index, scrubIndex)` → `Math.abs(index - scrubIndex)`.
  - `computeTargetScrollTop(index, wrapperRectTop, wrapperHeight, viewportHeight, count)` → scrollY exacto para saltar al panel `index` (usado por los botones indicadores).
  - `initServicesScene()` — decide enhancement vs. bypass (`matchMedia('(min-width: 1024px)')` Y NO `prefers-reduced-motion: reduce`); si procede, mueve los 8 `<article>` dentro de la estructura pineada, construye los botones indicadores desde los `<h3>` reales, se registra en `scroll-progress.js`, escribe `--services-scrub-index` y `--panel-distance` por panel en cada frame.
- **`services-scene.css`** — estilos de `.service-panel` en su estado base (lista plana — es lo que ve cualquiera sin JS, en móvil, y con reduced-motion), más las reglas `.services[data-scene="rail"]` que solo se activan cuando `initServicesScene()` añade ese atributo tras decidir mejorar la experiencia.

### Archivos modificados

- **`hero-scene.js`** — su bloque `updateTransition`/listener de scroll se reemplaza por una llamada a `registerScrollRegion(heroSection, callback)`. Sin cambio de comportamiento observable; las pruebas e2e existentes de Transición A deben seguir pasando sin modificación.
- **`index.html`** — `#servicios` pasa de `.services-grid` con 8 `.service-card` a 8 `<article class="service-panel" data-service-index="N">`, mismo contenido (`h3`, `p`, `ul.service-features`, `div.service-tech`), más un `<a class="service-panel-cta">` por panel hacia `https://wa.me/573173907301?text=<mensaje codificado mencionando el servicio>`. Se añade un `<div class="services-indicators" hidden></div>` vacío que JS llena solo si decide mejorar.
- **`app.py`, `.github/scripts/production-files.mjs`, `eslint.config.js`, `package.json`** — mismas adiciones que en Fase 1 para los 2 archivos min nuevos (`services-scene.min.js`/`.min.css`) y el nuevo módulo `scroll-progress.js`/`.min.js`.

## Composición visual del filmstrip (requisitos 1 y 4 del usuario)

- El riel (`.services-rail`) es un `flex` horizontal centrado; cada panel tiene `flex: 0 0 var(--panel-width)`. La traslación del riel es `transform: translateX(calc(var(--services-scrub-index) * -1 * var(--panel-step)))`.
- Cada panel recibe su propio `--panel-distance` (escrito por JS en cada frame, 8 escrituras acotadas por el mismo rAF del motor compartido — no es un bucle adicional).
- **Profundidad/cámara:** `transform: scale(calc(1 - min(var(--panel-distance), 2) * 0.12))`; `opacity: clamp(0.3, 1 - var(--panel-distance) * 0.35, 1)`.
- **Blur acotado (requisito 4):** el filtro `blur()` solo se aplica cuando `--panel-distance >= 1` Y `<= 2` (los vecinos inmediatos del activo); a partir de distancia 2 el panel pasa a `opacity` baja sin `filter` (evita pagar blur en los 8 paneles a la vez — como mucho 2-4 paneles tienen `filter` activo en cualquier momento, los extremos del riel nunca lo tienen).
- **Tipografía:** el `h3` de cada panel usa `clip-path: inset(0 calc(var(--panel-distance) * 60%) 0 0)` y `letter-spacing: calc(0.02em + var(--panel-distance) * 0.08em)` — el título se "ensambla" al acercarse al centro, no solo aparece.
- **Iluminación:** reutiliza `--spot-x`/`--spot-y` (halo de puntero, ya en `styles.css`) para el hover gated a `(hover: hover) and (pointer: fine)`, y agrega `--active-glow-x` (posición en viewport del panel activo, escrita por JS) para un resplandor que sigue al panel activo independientemente del cursor.
- **Conexión visual:** una barra de progreso fina bajo los indicadores, `width: calc(var(--services-progress) * 100%)` — mismo lenguaje visual que la barra de scroll que ya existe en el sitio.

## Navegación e indicadores (requisitos 5 y 6)

- `.services-indicators` contiene 8 `<button type="button">` con el texto corto del título real de cada servicio (nunca solo un punto decorativo — un lector de pantalla necesita texto).
- El botón del panel activo lleva `aria-current="true"`; el contenedor es `role="tablist"`-like simplificado: cada botón es un `button` normal (no reinventa el patrón ARIA tab completo, que exige manejo de flechas; con `Tab`/`Enter`/`Espacio` estándar es suficiente y más robusto).
- Click o activación por teclado → `computeTargetScrollTop()` + `window.scrollTo({ top, behavior: reducedMotion ? 'auto' : 'smooth' })`.
- Duración total del recorrido pineado acotada: `SCRUB_VH_PER_PANEL = 55` (vh por transición entre paneles consecutivos) — con 8 paneles, el alto total del wrapper es `100vh + 7 * 55vh ≈ 485vh`, un recorrido perceptible pero no "atrapante" (referencia: la Fase 1 ya usó recorridos de tamaño de viewport similar para la Transición A).
- El contenedor `.services-indicators` solo lleva `hidden` cuando no hay mejora activa; cuando `initServicesScene()` decide mejorar, se le quita `hidden` **antes** de insertar los botones — nunca queda un contenedor enfocable vacío ni oculto-pero-en-el-árbol-de-tabulación (requisito 6).

## Continuidad con Transición A (requisito 2)

**Corrección post-implementación:** `#inicio` y `#servicios` NO son hermanos consecutivos — `misión-visión` y `valores` quedan entre medio en el documento actual. La continuidad no es "pegado físicamente al hero" (ese supuesto era incorrecto y se descubrió al implementar, no al diseñar) sino: el primer panel (`--panel-distance = 0` en `scrubIndex = 0`) ya está en su estado "asentado" (escala 1, sin blur) desde el instante en que el riel pineado empieza su propio recorrido — no hay un segundo fade-in independiente superpuesto al de `.reveal-on-scroll`. Mismos tokens de color (`--primary-color`/`--primary-text`) y mismo valor de easing que el hero, para que la escena se sienta de la misma familia visual aunque no sea el hermano inmediato en el documento.

## Responsive, reduced-motion y fallback sin JS (requisito 7, decisión ya tomada #5)

- **Sin JS:** `.service-panel` en su CSS base es un bloque normal de página, con `.reveal-on-scroll` (mecanismo ya existente, sin código nuevo) para el fade-in al entrar en viewport. Totalmente legible y operable, CTA de WhatsApp funcional.
- **Móvil (`max-width: 1023px`):** `initServicesScene()` ni siquiera evalúa mejora — nunca se construye el DOM pineado, nunca se registra en el motor de scroll. Cero costo adicional.
- **`prefers-reduced-motion: reduce`:** mismo bypass, independiente del ancho de viewport.
- **Cambio de orientación/tamaño de ventana en vivo (requisito 7):** un listener de `resize` (ya parte del motor compartido) re-evalúa las media queries; si una sesión mejorada cruza el breakpoint hacia móvil en vivo (p. ej. rotar un tablet, o redimensionar una ventana de escritorio), `initServicesScene()` debe **revertir** la estructura pineada a la lista plana original (mover los nodos de vuelta, quitar `data-scene="rail"`, limpiar las variables CSS) en vez de dejar un híbrido roto. Cruzar de móvil a escritorio en vivo construye la mejora si aún no existía.

## Rendimiento (requisito 4, decisión ya tomada #3 y #4)

- Un solo listener de scroll/resize para toda la página (motor compartido), un solo `requestAnimationFrame` en vuelo.
- Sin WebGL, sin librerías nuevas.
- Blur acotado a los vecinos inmediatos del panel activo (ver arriba) — nunca los 8 paneles con `filter` simultáneamente.
- `IntersectionObserver` sobre el wrapper de servicios para pausar la escritura de `--panel-distance` por frame cuando la sección no está en viewport (mismo patrón de pausa ya usado en el hero).

## Testing

- **Unit (`tests/unit/services-scene-math.test.mjs`):** `computeScrubProgress` clamp en los extremos; `computeScrubIndex` para varios counts; `computePanelDistance` simétrica; `computeTargetScrollTop` para el primer/último panel.
- **Unit (`tests/unit/scroll-progress.test.mjs`):** `clampProgress` en los extremos; `registerScrollRegion`/`unregister` no lanza con elementos falsos (rect inyectado).
- **E2E (`tests/e2e/services-scene.spec.js`):**
  - Scroll hacia adelante y hacia atrás cambia el panel activo (ida y vuelta, no solo ida).
  - Click en un indicador salta directamente al panel correspondiente.
  - Navegación completa por teclado (Tab a través de los 8 indicadores, Enter activa).
  - JS deshabilitado → los 8 servicios son visibles y legibles, con su CTA funcional.
  - `prefers-reduced-motion` → nunca se aplica `position: sticky` ni se construye el riel (verificado por ausencia del atributo `data-scene="rail"`).
  - Viewport móvil → mismo bypass.
  - Redimensionar la ventana en vivo cruzando el breakpoint revierte/construye la mejora correctamente.
  - Ningún viewport probado introduce `scrollWidth > innerWidth` (scroll horizontal accidental).
  - axe-core sobre `#servicios` en ambos modos (mejorado y plano) sin violaciones "serious"/"critical".
  - **Regresión obligatoria:** la suite existente de `hero-scene.spec.js` (Transición A) pasa sin modificarse — prueba de que el refactor de `scroll-progress.js` no cambió el comportamiento observable del hero.

## Evidencia visual (requisito 9)

Script Playwright de captura (scratch, no committeado, mismo patrón que `evidence/capture-evidence.mjs` de la Fase 1): capturas en el punto de entrada desde el hero, inicio/intermedio/final del recorrido de servicios, versión móvil, y modo de movimiento reducido; grabación de video del recorrido completo si el entorno de Playwright lo permite.

## Addendum post-revisión de rama completa (2026-10-17)

Una revisión de rama completa (modelo más capaz, contexto fresco) encontró 3 hallazgos Críticos que los 78+ tests existentes no detectaban porque cada uno solo se manifestaba fuera de la única combinación panel/viewport/posición-de-scroll que esos tests cubrían. Correcciones reales, no cosméticas:

- **El riel pineado ahora empieza debajo de la navbar fija** (`--stage-top`, medido en caliente desde la altura real de `.navbar`, no asumido en `top:0`) — a 1280×720/1024×768 el título e ícono del panel activo quedaban detrás de la navbar.
- **La franja de indicadores se mide en caliente** (`--indicator-reserve`), no se asume una altura fija — con el título completo de cada servicio como texto del botón, la fila se partía en 3-4 líneas en viewports más angostos y tapaba el CTA del panel activo. Los indicadores ahora muestran solo la primera palabra del servicio (visualmente distinta para los 8), con el nombre completo en `aria-label`/`title`.
- **El CTA de WhatsApp de cada panel es `position:sticky; bottom:0`** dentro del propio scroll interno del panel (que gana `max-height`/`overflow-y:auto` como red de seguridad en viewports bajos) — siempre visible y clicable sin que la persona necesite descubrir que la tarjeta se puede desplazar.
- **Los paneles ya no llevan `.reveal-on-scroll`/`.is-visible` mientras el riel está activo.** Esa clase genérica (IntersectionObserver, `script.js`) tiene más especificidad CSS que las reglas de profundidad del riel — una vez que un panel pasaba cerca del centro durante un scroll gradual real, quedaba fijo en `opacity:1/transform:none` para siempre, incluso lejos del centro después. El riel gestiona su propia visibilidad por completo vía `--panel-distance`; `enhance()` quita esas clases, `revert()` las restaura para la lista plana.

Detalle completo de cada hallazgo, su test de regresión y su commit en `.superpowers/sdd/2026-10-17-servicios-transicion-b/progress.md`.

## Fuera de alcance (Fase 3)

Transición C (Idea → Diseño → Desarrollo → Solución) no se toca en este sub-proyecto.
