# Hero cinematográfico + Transición A (Hero → Servicios)

Sub-proyecto 1 de 4 del rediseño cinematográfico de Aurabyte. Los otros tres
(exploración interactiva de servicios, secuencia idea→producto,
microinteracciones generales) son proyectos separados, cada uno con su
propio diseño — este documento cubre **solo** el hero y la transición hacia
`#servicios`.

## Contexto

El hero actual (`index.html:96-154`) ya tiene una capa "futurista" del PR #3:
`.hero-hologram` (anillo + logo estático, `styles.css:2564-2636`), un
`.code-window` decorativo y clases `animate-fade-in`/`-delay`/`-delay-2`
para la entrada de texto. El usuario considera esto insuficiente —
"brillos, gradientes y animaciones de aparición", no una transformación
visual real. Este sub-proyecto reemplaza `.hero-hologram` por una escena
3D real y añade una transición de scroll que transforma la escena en vez
de solo mostrar/ocultar secciones.

Decisiones ya tomadas con el usuario (no reabrir sin que él lo pida):

1. Sin dependencias nuevas: WebGL/Canvas escrito a mano, sin Three.js/GSAP.
2. El objeto 3D es una red de partículas que converge en el propio monograma
   "A" de `logo.svg` (mismo path del triángulo, `logo.svg:10`) — no una
   forma abstracta inventada.
3. El motor de scroll-progreso es una utilidad propia (rAF + listeners de
   `scroll`/`resize`, no un bucle de rAF perpetuo) compartida entre la
   barra de progreso existente y la Transición A.
4. Alcance: solo hero + Transición A. Transición B (servicios) y C
   (idea→producto) son sub-proyectos futuros separados.

## Objetivo

Un hero que se sienta "de agencia creativa internacional" de verdad: una
constelación de partículas con profundidad e iluminación que se ensambla
visualmente en la marca Aurabyte al cargar, reacciona al cursor, y se
transforma (no se oculta) al hacer scroll hacia Servicios.

## Arquitectura

### Archivos nuevos

- `hero-scene.js` — módulo autocontenido. Exporta una función de init que:
  - Detecta soporte WebGL (`canvas.getContext('webgl')`); si falla, no hace
    nada más (el fallback SVG ya vive en el HTML, ver abajo).
  - Instancia una clase `ParticleNetwork` (buffers de posición/color,
    shaders mínimos: un vertex shader con proyección de perspectiva hecha a
    mano — matriz 4x4, ~20 líneas — y un fragment shader de punto/línea con
    color sólido + glow simple vía `gl_PointSize`/alpha).
  - Expone `pause()`/`resume()` para que el `IntersectionObserver` y
    `visibilitychange` controlen el loop desde fuera.
  - Expone un setter de color que `script.js` llama desde el handler de
    `themeToggle` existente (`script.js:27-33`).
- `hero-scene.css` — contenedor del canvas, estados de la secuencia de
  entrada (clases que togglea `hero-scene.js`, no estilos inline), y el
  fallback SVG (gradiente + pulso + puntos decorativos, mismo path que
  `logo.svg:10`).

### Archivos modificados

- `index.html`: `.hero-hologram` (líneas 122-126) se reemplaza por:
  - Un `<canvas class="hero-scene-canvas" aria-hidden="true">` (oculto por
    defecto vía CSS).
  - Un fallback SVG inline con el mismo triángulo, visible por defecto
    (`display: block`) — `hero-scene.js` lo oculta y muestra el canvas
    solo si WebGL + `prefers-reduced-motion: no-preference` son ciertos.
    Sin JS, el fallback SVG es lo que se ve — nunca hay un hueco vacío.
  - `<script type="module" src="hero-scene.min.js" defer>` añadido junto a
    los scripts existentes.
  - `<link rel="stylesheet" href="hero-scene.min.css">` junto a los otros.
- `script.js`:
  - Nueva utilidad `createScrollProgress(onUpdate)` (reemplaza el bucle de
    `script.js:118-125`): un único listener de `scroll`+`resize`
    (passive, rAF-throttled — se agenda un rAF solo si no hay uno
    pendiente) que calcula el progreso 0-1 y llama `onUpdate(progress)`.
    La barra de progreso existente se suscribe con un callback que hace lo
    que ya hace hoy (`scaleX`); el hero/Transición A se suscribe con un
    segundo callback acotado a la altura del hero.
  - Elimina código muerto: `lastScroll` (línea 69, nunca leída),
    `animateValue` (líneas 361-372, sin llamadas en el repo), `sectionHeight`
    (línea 383, asignada y no usada — el `if` solo necesita `sectionTop`).
- `byteo.js`: la lógica de destino aleatorio (~líneas 302-320) resta del
  pool de candidatos cualquier rectángulo que intersecte
  `.whatsapp-float`, `.navbar` o `.cta-buttons` del hero (+ margen de 24px),
  recalculado en cada resize. Elimina `eyes` no usado (línea 258).
- `package.json`: `build:css`/`build:js` incluyen `hero-scene.css`/`.js`.
- `.github/scripts/production-files.mjs` y `app.py` (`_PUBLIC_FILES`):
  añaden `hero-scene.min.css`/`hero-scene.min.js`.

## Secuencia de entrada (al cargar)

1. **0–~0.4s**: canvas/fallback hace fade-in, partículas dispersas con
   drift lento (o, con `prefers-reduced-motion`, aparecen ya asentadas).
2. **~0.4–1.6s**: partículas se mueven (easing, no lineal) hacia posiciones
   muestreadas del path del triángulo de `logo.svg` (outline + puntos
   interiores, con variación de profundidad z para dar lectura de objeto
   3D, no de triángulo plano). Las líneas de conexión aparecen según
   proximidad. Punto núcleo pulsante en la posición del brillo del logo
   original (`logo.svg:13`).
3. **~1.6–2.4s**: texto del hero (ya tiene `animate-fade-in*`, se mantienen
   esas clases/timing — no se duplica el mecanismo).
4. **~2.4–2.8s**: CTAs se asientan con stagger (extiende el patrón
   `animate-fade-in-delay-2` ya existente, no uno nuevo).

Interrumpible: cualquier scroll o click durante la secuencia la corta al
estado final de inmediato — nunca bloquea el acceso a los CTAs.

## Transición A (scroll hero → servicios)

Usa el mismo `createScrollProgress` con un rango acotado a la altura del
`<section id="inicio">`. Con progreso 0→1:

- La red de partículas se "desensambla" de la forma de la "A" y migra
  hacia donde caen los primeros íconos de `#servicios` (coordenadas
  leídas una vez vía `getBoundingClientRect` al entrar en la sección).
- El canvas aplica `transform: scale()`/`translateZ` y `opacity` en
  función del progreso (cámara "retrocede").
- `.hero-content` (texto/CTAs) se desplaza en `translateY` a una tasa
  distinta a la del canvas (parallax, señal de profundidad).
- Al llegar a progreso 1, `ParticleNetwork.pause()` — el loop de render se
  detiene por completo, no solo se oculta visualmente.
- Scroll hacia arriba revierte la misma transformación; la secuencia de
  entrada nunca se repite (es estado de "ya ensamblado", controlado por un
  flag, no por recrear la escena).

## Fallbacks y accesibilidad

- **Sin WebGL**: SVG del triángulo con gradiente CSS animado (pulso) y 4-6
  puntos decorativos con `@keyframes` CSS — mismo path de marca, cero
  dependencia de canvas/WebGL.
- **`prefers-reduced-motion: reduce`**: sin importar soporte WebGL, la
  escena se renderiza ya ensamblada y estática (drift mínimo o nulo);
  Transición A pasa a un cross-fade de baja amplitud en vez del
  movimiento de cámara completo — sigue atada al scroll, pero contenida.
- **Visibilidad/batería**: `IntersectionObserver` sobre el hero
  (reutilizando el patrón ya usado para `.whatsapp-float`,
  `script.js:105-109`) llama `pause()`/`resume()`; `visibilitychange`
  hace lo mismo para pestaña oculta.
- **Rendimiento por dispositivo**: en el init, una sola comprobación
  síncrona (`navigator.hardwareConcurrency`, ancho de viewport) fija conteo
  de partículas (~150/90/50) y tope de `devicePixelRatio` (2/1.5/1). Sin
  bucles de benchmarking.
- **Tema claro/oscuro**: el handler de `themeToggle` (`script.js:27-33`)
  llama al setter de color de la escena además de lo que ya hace hoy.

## Testing

Nuevos specs en `tests/e2e/`:

- El canvas se muestra y el fallback SVG se oculta cuando WebGL está
  disponible (comportamiento por defecto en Chromium/Firefox/WebKit de
  Playwright).
- Con WebGL mockeado como no disponible (`page.addInitScript` que anula
  `getContext`), el fallback SVG permanece visible y no hay errores de
  consola.
- Con `page.emulateMedia({ reducedMotion: 'reduce' })`, la escena no
  ejecuta la animación de ensamblaje (se verifica estado ya asentado casi
  de inmediato, no tras ~2.4s).
- Hacer scroll a través del hero cambia el progreso de la Transición A
  (se verifica vía un atributo/CSS var que `hero-scene.js` expone para
  testing) y, al pasar de la sección, el loop de render queda en pausa.
- Byteo, muestreado en varias posiciones durante un roam corto, nunca
  solapa el bounding box de `.whatsapp-float` ni de `.cta-buttons` del hero.
- Regresión de accesibilidad (axe-core) sin nuevas violaciones; sin scroll
  horizontal en viewports móviles; WhatsApp/Instagram siguen funcionando.
- Se mantienen las pruebas existentes (36 actuales) — ninguna se elimina.

## Rollout

Rama `feature/hero-cinematico` desde `master`. Implementación → suite
local completa (pytest, Playwright × 3 navegadores, eslint, stylelint,
html-validate, bandit) → capturas/video de Playwright (hero desktop,
hero móvil, secuencia de entrada, scroll de Transición A, claro/oscuro,
reduced-motion) → push → PR → CI verde → merge a `master` → redeploy
GitHub Pages → verificación en producción.

Explícitamente fuera de este sub-proyecto: Transición B (servicios),
Transición C (idea→producto), microinteracciones generales fuera del
hero, documentos legales, auditoría de ramas. Se reporta solo lo de este
documento; no se declara terminado el rediseño completo.
