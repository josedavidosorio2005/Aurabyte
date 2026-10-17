# Aurabyte — Guía del proyecto para Claude Code

Sitio web corporativo de Aurabyte: frontend estático (HTML/CSS/JS). El canal
de contacto es WhatsApp (+57 317 390 7301), resuelto 100% en el navegador —
ver "Canal de contacto" más abajo antes de tocar el formulario o el backend.
Repositorio: https://github.com/josedavidosorio2005/Aurabyte

Es una página empresarial de captación de clientes, **no** una plataforma
educativa ni de laboratorios — no añadas esas features salvo pedido explícito.

## Arquitectura actual

```
├── index.html, styles.css, script.js   # Sitio principal
├── privacidad.html, terminos.html      # Páginas legales (ver "Legal" abajo)
├── legal.css                           # Estilos compartidos de esas 2 páginas
├── byteo.css, byteo.js                  # Mascota/widget "Byteo"
├── icons/sprite.svg                     # Sprite SVG de íconos (ver "Rendimiento")
├── fonts/*.woff2, fonts/fonts.css       # Fuentes auto-alojadas (ver "Rendimiento")
├── *.min.css, *.min.js                  # Generados — ver "Build de producción"
├── robots.txt, sitemap.xml              # SEO
├── app.py                               # Servidor Flask + API REST
├── tests/
│   ├── test_app.py                      # Pytest (backend)
│   └── e2e/*.spec.js                    # Playwright (frontend + API real)
├── requirements.txt / requirements-dev.txt
├── package.json                         # Tooling JS (lint/format/tests/build)
└── vercel.json                          # Despliegue serverless (Vercel)
```

No hay bundler ni framework de frontend (React/Vue, etc.): el JS es vanilla.
Lo único "build" en este proyecto es la minificación CSS/JS (ver abajo) — no
es un paso de compilación, no cambia el lenguaje ni la arquitectura. No migres
a un framework sin discutirlo antes: es una decisión de alcance, no un olvido.

## Transiciones cinematográficas (scroll) — Transición A/B/C

El sitio tiene 3 escenas de scroll encadenadas, cada una en su propio par de
archivos, todas montadas sobre el mismo motor de scroll compartido
(`scroll-progress.js`: un único listener de `scroll`/`resize` y un único
`requestAnimationFrame` en vuelo para toda la página vía
`registerScrollRegion(element, onProgress)` — no crees un segundo motor ni un
rAF propio para una escena nueva, regístrate en este).

| Transición | Dónde | Archivos | Qué hace |
|---|---|---|---|
| A | `#inicio` (hero) | `hero-scene.js/css` | Red de partículas WebGL (fallback SVG si no hay WebGL) que se dispersa hacia `#servicios` según el scroll del hero. |
| B | `#servicios` | `services-scene.js/css` | 8 paneles de servicio en un riel horizontal pineado (`position: sticky`) que se desplaza con el scroll vertical; en escritorio sin reduced-motion. |
| C | `#proceso` (entre Servicios y Tecnologías) | `process-scene.js/css` | Red de partículas en Canvas2D que se reorganiza en 4 geometrías (IDEA → DISEÑO → DESARROLLO → SOLUCIÓN) según el scroll; en escritorio sin reduced-motion. |

Patrones que las 3 comparten (cópialos si agregas una Transición D, no
reinventes):

- **`enhance()`/`revert()`/`sync()`**: `sync()` decide mejora vs. bypass según
  `matchMedia` (`min-width:1024px` y `!prefers-reduced-motion`) y corre en el
  evento inicial más `resize`/`change` de esos media queries — nunca solo una
  vez al cargar. `enhance()` MUEVE los nodos reales del DOM a la estructura
  pineada (no los clona — nunca hay dos copias del contenido). `revert()`
  deshace exactamente eso, limpiando estilos inline y el `scrollHandle` del
  motor compartido.
- **Bypass = contenido plano accesible, no una versión degradada**: en móvil
  y con reduced-motion, cada transición cae a su marcado original (tarjetas
  en flujo normal, sin canvas/riel) — el contenido real siempre existe en el
  DOM, incluso sin JS. No "ocultes" la versión simple pensando que es solo
  para desktop.
- **Companions MINIFICADOS, no la fuente**: cada `*-scene.js` importa de
  `./otro-archivo.min.js`, no `./otro-archivo.js` — no hay bundler que
  reescriba specifiers entre fuente y build, así que los `.min.js` ya
  commiteados son lo que de verdad se ejecuta/importa (ver "Build de
  producción"). Esto también es lo que permite reutilizar matemática ya
  probada entre escenas sin duplicarla: p. ej. `process-scene.js` importa
  `lerp`/`easeInOutCubic`/`pickDeviceTier` de `hero-scene.min.js` y
  `computeScrubIndex`/`computePanelDistance`/`computeTargetScrollTop` de
  `services-scene.min.js`. Si cambias la firma de una función exportada por
  una escena, revisa qué otra escena la importa antes de romperla.
- **`pickDeviceTier()`** (definida en `hero-scene.js`, reutilizada por las
  demás): reduce el conteo de partículas/el cap de DPR en viewports angostos
  o con `hardwareConcurrency` bajo — no inventes un segundo esquema de tiers.
- **`[data-scene="..."]`**: cada sección mejorada marca
  `section.dataset.scene` (`"rail"` en B, `"canvas"` en C) — úsalo para
  reglas CSS que solo deben aplicar mientras la escena está pineada, en vez
  de depender de clases que también existen en el estado plano.
- **Guard de rendimiento fuera de viewport**: el callback de
  `registerScrollRegion` corta temprano si `rect.bottom < 0 || rect.top >
  viewportHeight` (excepto la primera llamada, que nunca se salta — fija el
  estado de reposo correcto) — sin esto, cualquier scroll en el RESTO de la
  página sigue recalculando y escribiendo estilos de una escena que ni
  siquiera está a la vista.

## Entorno de desarrollo

```powershell
# Backend (usa SIEMPRE el venv del proyecto, no el Python global)
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe app.py              # http://127.0.0.1:5000

# Frontend / tooling
npm install
npm run build           # Regenera *.min.css/*.min.js — ver abajo, IMPORTANTE
npm run lint:js         # ESLint
npm run lint:css        # Stylelint
npm run format:check    # Prettier (solo verifica; no reformatea sin --write)
```

Variables de entorno: copiar `.env.example` a `.env`. Nunca commitear `.env`.
Por defecto el servidor corre con `debug=0` y `HOST=127.0.0.1` — **nunca** fuerces
`FLASK_DEBUG=1` ni `HOST=0.0.0.0` en una rama que vaya a producción.

## Build de producción — `npm run build` (IMPORTANTE, gotcha real)

`index.html` carga `styles.min.css`/`byteo.min.css`/`script.min.js`/`byteo.min.js`,
**no** los `.css`/`.js` originales. Son generados con `lightningcss`/`terser`
(`npm run build:css` / `build:js` / `build`, ver `package.json`).

**Si editas `styles.css`, `byteo.css`, `script.js` o `byteo.js` y no corres
`npm run build` después, tus cambios no se ven** — ni localmente ni en
producción. No hay watcher automático. Este patrón se adoptó por una razón
de rendimiento concreta (ver abajo), no es accidental: no lo deshagas
sirviendo los archivos sin minificar.

Como no hay paso de build en el deploy (Vercel sirve los archivos del repo
tal cual, `@vercel/static`), **los `*.min.*` se commitean** — no son
gitignored como un `dist/` típico. Si olvidas regenerarlos antes de un
commit, el sitio desplegado queda desactualizado aunque el código fuente
esté bien.

## Pruebas (ejecútalas antes de dar algo por terminado)

```powershell
.\.venv\Scripts\python.exe -m pytest -q        # Backend: 10 pruebas
npx playwright test                             # E2E real contra el servidor Flask
npx playwright test accessibility               # Auditoría WCAG 2.1 AA/2.2 con axe-core
.\.venv\Scripts\python.exe -m bandit -r app.py  # Seguridad estática
.\.venv\Scripts\python.exe -m flake8 app.py tests/
```

`playwright.config.js` levanta el servidor Flask automáticamente
(`webServer`) antes de correr los tests E2E — no necesitas arrancarlo a mano.

**Pruebas intermitentes (dev-server, no bug de producto):** el servidor de
desarrollo de Flask es un solo proceso; con los 3 navegadores de Playwright
pidiendo en paralelo fuentes/CSS/JS/sprite SVG a la vez, ocasionalmente
responde tarde y una prueba falla por timeout — sobre todo Firefox. Por eso
`playwright.config.js` tiene `retries: 1` y `workers: 3` localmente (no
oculta fallos reales: si algo está realmente roto, vuelve a fallar en el
reintento). En producción (Vercel) esto no aplica — es infraestructura
serverless, no este proceso único.

## Rendimiento — de 70/100 a 95/100 (Lighthouse móvil)

Historial completo y metodología en el reporte de la Fase 3 (artefacto
compartido con el usuario). Resumen de lo que se hizo y por qué, para no
deshacerlo sin querer:

1. **Fuentes auto-alojadas** (`fonts/*.woff2` + `fonts/fonts.css`): antes
   Google Fonts vía CDN bloqueaba el render (~1s). Son los mismos archivos
   variables que serviría Google, solo que desde este origen — mismo
   resultado visual, sin el round-trip DNS/TLS externo. Subconjuntos latin +
   latin-ext (suficiente para español).
2. **Íconos propios en vez de Font Awesome por CDN**: Font Awesome completo
   descargaba 278KB de fuentes de íconos para mostrar 65 distintos.
   `icons/sprite.svg` (~46KB, un `<symbol>` por ícono, solo los usados) los
   reemplaza vía `<svg class="icon"><use href="icons/sprite.svg#icon-X">`.
   La clase `.icon` en `styles.css` imita el comportamiento de
   `<i class="fas fa-x">` (tamaño por `font-size`, color por `currentColor`),
   así que el resto del CSS que ya fijaba esos valores en el contenedor
   padre sigue funcionando. **Para un ícono nuevo**: añadir su `<symbol
   id="icon-NOMBRE">` a `icons/sprite.svg` (p. ej. descargando el SVG de
   `https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.1/svgs/{solid|brands}/{nombre}.svg`
   — ojo, varios íconos de Font Awesome 5 se renombraron en la v6, ver notas
   en el historial de este archivo si un nombre da 404) y usar
   `<svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-NOMBRE"></use></svg>`.
   Atribución CC BY 4.0 en el footer del sitio — no la quites.
3. **Minificación CSS/JS** (`npm run build`, ver sección arriba).
4. **Animación de scroll-reveal movida de JS a CSS**: antes `script.js`
   escribía `opacity`/`transform` inline en un `forEach` al cargar la
   página (costoso bajo CPU limitado). Ahora el estado oculto vive en CSS
   (`.js .service-card`, etc. — el prefijo `.js` lo añade `script.js` vía
   `document.documentElement.classList.add('js')`, así que sin JavaScript
   las tarjetas se ven normales desde el principio en vez de quedar
   invisibles para siempre). El `IntersectionObserver` solo togglea la clase
   `.is-visible`. Si tocas esta zona, prueba con JS desactivado antes de dar
   por buena la página.
5. **`theme-toggle`/spinner/notificaciones dinámicas**: ya no togglean
   clases `fa-moon`/`fa-sun` (no existen más) — cambian el atributo `href`
   del `<use>` del ícono. Ver `script.js`, función `setThemeIcon`.
6. **Rediseño futurista (`.scroll-progress`, `.reveal-on-scroll`
   en tarjetas de precios/equipo/destacados, halo de puntero en `.service-panel`/
   `.pricing-card`/`.value-card`)**: mismo patrón de arriba, con una regla
   extra. `.js .reveal-on-scroll` usa **`opacity: 0` Y `visibility: hidden`**
   en su estado inicial, no opacity sola — axe-core mide el contraste real
   de un texto con `opacity: 0` (que compone al color de fondo) y lo marca
   como violación "serious" de WCAG, aunque nadie lo vea así (encontrado y
   corregido en la revisión del PR #3: 32 nodos afectados). Si agregas una
   clase de revelado nueva, replica ambas propiedades — opacity sola no
   basta. El halo de puntero (`--spot-x`/`--spot-y`) solo se activa si
   `(hover: hover) and (pointer: fine)`, así que no interfiere en táctil.

**Nota honesta sobre la métrica:** Lighthouse móvil simula red lenta (Slow
4G) y CPU limitada; el 95/100 es bajo esas condiciones simuladas. En escritorio
(sin throttling) el sitio ya daba 96-100 incluso antes de esta optimización.
No se desactivó ni manipuló ninguna categoría de Lighthouse para subir el
número — los cambios son reducciones reales de payload (505KB → 265KB) y de
trabajo en el hilo principal.

**Actualización Fase 4 (auditoría de acabado premium, tras sumar la
Transición C):** remedido con `npx lighthouse` contra el servidor local.
Accesibilidad/mejores prácticas/SEO siguen en 100/100 (2 hallazgos reales de
accesibilidad corregidos en esta fase: `aria-label` de Instagram sin el texto
visible, y los puntos de navegación de `.process-dot` por debajo del tamaño
táctil mínimo de 24×24px — ver git log). Rendimiento móvil bajó a un rango
~84-87/100 (varias corridas, TBT 170-350ms según la corrida — hay ruido real
de laboratorio en esta máquina, documentado también antes en "Pruebas
intermitentes" para Playwright). El costo real es el de inicializar 3 escenas
de scroll en vez de 2 (WebGL del hero + dos escenas Canvas2D/DOM) durante la
carga — se intentó diferir la construcción de la geometría de
`process-scene.js` a `requestIdleCallback` (no bloquea FCP/LCP, que siguen
≤0.8s/≤2.9s), pero el TBT medido no mejoró de forma concluyente bajo el ruido
de esta máquina. **No se manipuló la auditoría para subir el número** — este
es el estado real. Queda como candidato razonable para una fase futura:
inicializar escenas fuera de viewport solo cuando se acercan (p. ej. con
`IntersectionObserver`) en vez de las 3 al cargar la página.

**Actualización Fase 5 (diagnóstico real con el perfilador de Lighhouse —
la hipótesis de la nota anterior era incorrecta):** el audit `long-tasks` de
Lighthouse identificó la causa real: una sola tarea de **860ms+63ms en
`hero-scene.min.js`** (compilar los 2 shaders de `ParticleNetwork` + crear
sus 5 buffers + el primer draw call, síncrono, bajo rasterización por
software) — por lejos el mayor bloqueo de toda la carga.
`services-scene.js`/`process-scene.js` ni aparecían en el perfil; no eran el
problema, al contrario de lo que sugería la nota de la Fase 4. Corrección:
`initHeroScene()` separa los listeners de interacción (scroll/click para
saltar la intro, cursor, visibilidad) — que se adjuntan de inmediato, igual
que antes — de la construcción de WebGL en sí, que se difiere un solo
`requestAnimationFrame` (no `requestIdleCallback`: el hero debe conservar su
impacto visual desde la entrada, y el fallback SVG ya es el estado por
defecto del HTML sin JS). **Intento inicial fallido, documentado para no
repetirlo:** diferir también los listeners de interacción dentro del mismo
callback rompió 2 pruebas de WebKit de forma reproducible (confirmado
comparando contra el código sin el cambio) — `requestAnimationFrame` puede
tardar más de lo esperado en WebKit sin GPU, el mismo tipo de límite que
"frameCount atascado en 1" ya documentado en Fase 1. Resultado medido
(mediana de 5 corridas, antes/después, sin manipular la auditoría):
rendimiento móvil 83.5 → **91/100** (TBT 340ms → 46ms mediana); escritorio
100/95 → **100/100/100** estable (TBT 0ms en las 3 corridas). Accesibilidad/
mejores prácticas/SEO: 100/100, sin cambios.

## Canal de contacto — WhatsApp (sin backend), no email

Aurabyte **no tiene correo empresarial**. El canal de contacto real y único
es WhatsApp Business: **+57 317 390 7301** (`https://wa.me/573173907301`).
`info@aurabyte.com`, que aparecía en todo el sitio, era contenido heredado
de versiones anteriores — se quitó de todo el sitio (footer, formulario,
`privacidad.html`, `terminos.html`, datos estructurados). Si alguna vez
reaparece "info@aurabyte.com" en una búsqueda del repo, es una regresión.

**Cómo funciona el formulario (`#contactForm` en `index.html`,
`script.js`):** arma un mensaje de texto a partir de nombre/servicio/
presupuesto opcional/teléfono opcional/descripción y abre
`https://wa.me/573173907301?text=<mensaje codificado>` con
`window.open(..., '_blank', 'noopener,noreferrer')`. **No hace ningún
fetch/POST** — todo ocurre en el navegador, sin tocar el backend. El envío
real (confirmado) solo ocurre cuando la persona presiona Enviar **dentro de
WhatsApp** — nunca afirmamos "mensaje enviado" desde este sitio, porque no
podemos saberlo. El mensaje que se muestra tras completar el formulario dice
"vas a continuar en WhatsApp", no "se envió".

Todos los CTAs de cotización (hero, planes de precios, tarjeta de
proyectos) son enlaces `<a href="https://wa.me/...?text=...">` directos con
mensajes pre-escritos según el contexto (plan, servicio) — no pasan por el
formulario. Hay también un botón flotante (`.whatsapp-float`, fijo
abajo-derecha, z-index por encima de Byteo) visible en todo el sitio.

**`minlength` nativo removido de `#name`/`#message`:** con `minlength`, el
navegador bloqueaba el envío de forma nativa (mostrando su propio tooltip)
antes de que corriera la validación JS del sitio — el usuario veía a veces
el mensaje de error bonito del sitio y a veces un tooltip genérico del
navegador, de forma inconsistente (y en las pruebas E2E, esa carrera entre
validación nativa y JS causaba fallos intermitentes difíciles de diagnosticar).
Ahora toda la validación de longitud la hace `script.js`, con mensajes
consistentes. **No vuelvas a agregar `minlength` a esos campos** sin quitar
también la validación JS equivalente, o reaparece la inconsistencia.

### El backend Flask queda dormido, no eliminado

`app.py` sigue existiendo con `/api/contact` (incluye `send_contact_email()`,
capaz de enviar por SMTP si algún día se configura `SMTP_HOST`/`SMTP_USER`/
`SMTP_PASSWORD`/`CONTACT_EMAIL_TO` — ver `.env.example`) y
`/api/services`/`/api/technologies`/`/api/projects`. **Nada en el frontend
llama a estos endpoints** — se conservaron porque "no eliminar
funcionalidad que funciona" sigue aplicando, no porque el sitio los
necesite hoy. Esto tiene una consecuencia real para el despliegue: **ya no
hace falta Vercel/un backend para que el sitio funcione** — ver
`DEPLOYMENT.md`, ahora recomienda GitHub Pages como opción simple por
defecto.

## Legal — borradores pendientes de aprobación

`privacidad.html` y `terminos.html` son borradores reales (Ley 1581 de 2012,
Colombia — Habeas Data), **no texto legal definitivo**. Ambos llevan un
aviso visible de "Borrador en revisión" y campos `[PENDIENTE: ...]` donde
falta NIT, razón social, dirección y representante legal — esos datos no se
inventaron. **No quites el aviso de borrador ni rellenes los `[PENDIENTE]`
con datos inventados** — solo reemplázalos cuando el dueño del sitio
confirme los datos jurídicos reales, y solo con su aprobación explícita
antes de considerarlos publicables.

**Fase 5: estos borradores ya NO se publican** — al no poder completarse
responsablemente sin los datos jurídicos reales, se excluyeron del sitio en
vivo en vez de publicarse con marcadores `[PENDIENTE]` como si fueran
definitivos (ver `DEPLOYMENT.md`, "Qué se publica"). `index.html` ya no
enlaza a `privacidad.html` ni `terminos.html` en ningún lugar (ni footer ni
checkbox de consentimiento) — ambos archivos siguen en el repo como
borrador para cuando existan los datos reales, pero no en el artefacto
desplegado. El formulario de contacto no depende de ellos: no envía datos a
ningún servidor (solo abre WhatsApp), así que no hay un vacío de
cumplimiento por no tenerlos públicos todavía. Si en el futuro se completan
y se publican, hay que: (1) quitar el aviso de "Borrador en revisión", (2)
volver a enlazarlos desde el footer, (3) decidir si el formulario necesita
de nuevo un checkbox de consentimiento explícito.

## API REST — debe reflejar el contenido real, no datos de relleno

`/api/services` y `/api/projects` antes devolvían datos hardcodeados que no
coincidían con `index.html` — `/api/projects` en particular devolvía 3
"casos de éxito" ficticios (Tienda Online, Portal Corporativo, Dashboard
Analytics) que no existen en ningún otro lado del repo, accesibles para
cualquiera que hiciera `curl /api/projects` aunque la página visible ya no
los mostrara. Se corrigieron para reflejar exactamente las secciones
`#servicios` y `#proyectos` de `index.html`. **Si cambias el contenido de
esas secciones, actualiza también el endpoint correspondiente** — hay un
test de regresión (`test_projects_endpoint_no_inventa_casos_de_exito`) que
falla si vuelven a aparecer esos 3 nombres.

## Seguridad — reglas ya aplicadas, no las reviertas

- `debug` y `host` del servidor Flask se controlan por variable de entorno
  (`FLASK_DEBUG`, `HOST`), nunca hardcodeados. `debug=True` expone el debugger
  de Werkzeug (ejecución de código arbitrario) si queda activo en producción.
- CORS restringido vía `ALLOWED_ORIGINS` (lista vacía = sin orígenes cruzados).
  No pongas `CORS(app)` sin argumentos (equivale a `*`).
- `/api/contact` tiene rate limit (`5 per minute`) para mitigar spam/abuso.
  El `flask-limiter` usa almacenamiento en memoria: válido para una sola
  instancia; si se despliega en serverless (Vercel) con múltiples instancias
  frías, el límite no persiste entre invocaciones — ver "Limitaciones
  conocidas".
- **Fase 5: `static_folder=None`, no `"."`** — servir `static_folder="."`
  expone TODO el directorio del proyecto por HTTP (`app.py`,
  `requirements.txt`, un `.env` real si existiera). En su lugar hay rutas
  explícitas (`public_file`, `icons`, `fonts`) que solo sirven lo que
  también publica GitHub Pages — ver `_PUBLIC_FILES` en `app.py` y
  `.github/scripts/production-files.mjs`. **Estas tres rutas llevan
  `@limiter.exempt`**: el endpoint `static` que registra Flask por defecto
  queda exento del límite global de `flask-limiter` automáticamente, pero
  una ruta propia no — sin el exempt, cargar la página unas pocas veces
  agota `default_limits=["50 per hour"]` (son ~10 archivos estáticos por
  carga) y el sitio entero empieza a responder 429. Si agregas una ruta
  nueva que sirva un archivo estático, no olvides el mismo `@limiter.exempt`.
- Cabeceras `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` se
  añaden en `after_request`. No las quites.
- `SECRET_KEY` se lee de entorno; nunca hardcodear un secreto en `app.py`.
- `app.run(..., threaded=True)`: el dev server de un solo hilo se saturaba
  con requests concurrentes. No sustituye un WSGI de producción (gunicorn,
  runtime de Vercel), que ya maneja esto correctamente.

## Contraste de color: ya resuelto

Se añadió el token `--primary-text` (`#0369a1`, ≥5.3:1 contra los fondos
donde se usa como texto) y se aplicó donde `--primary-color` (`#0ea5e9`,
~2.5:1) se usaba como texto sobre fondos claros: `.logo`, `.pricing-badge`,
`.price-amount`, `.member-role`, `.member-skills span`,
`.form-checkbox label a`. En modo oscuro `--primary-text` vuelve a ser
`--primary-color` porque ahí sí cumple. **No reintroduzcas
`color: var(--primary-color)` como texto sobre fondo claro** — usa
`--primary-text`.

## Limitaciones conocidas (pendientes, no bloquean el uso actual)

1. **Entrega del formulario depende de WhatsApp**, no de este sitio: una
   vez que `window.open` abre `wa.me`, el sitio no tiene forma de saber si
   la persona realmente presionó Enviar allí. No hay nada que "arreglar"
   aquí — es la naturaleza de este canal, documentado para que quede claro.
2. **Rate limiting en serverless**: solo aplica si algún día se reactiva
   `/api/contact` vía SMTP — ver arriba.
3. **Legal pendiente de aprobación**: ver sección "Legal" arriba — borradores
   excluidos del sitio publicado hasta tener NIT/razón social/dirección reales.
4. **`npm audit`: 7 "high" en `braces`** (transitivo vía `stylelint`,
   dev-only, sin fix upstream real, nunca se envía a producción — aceptado
   y documentado, no oculto).

## Herramientas instaladas (no las reinstales si ya están)

Plugins de Claude Code (`claude plugin list`): frontend-design, feature-dev,
playwright, security-guidance, code-review, code-simplifier,
claude-md-management, pyright-lsp, typescript-lsp, superpowers, context-mode.

MCP: `context7` (docs de librerías actualizadas), `playwright`, `context-mode`.

Herramientas de build añadidas en la Fase 3: `lightningcss-cli` (minifica
CSS), `terser` (minifica JS) — ambas devDependencies, ver `package.json`.

Auditoría de rendimiento real (no está en `package.json`, se resuelve vía
`npx` bajo demanda — no hace falta instalarla a propósito):
`npx lighthouse http://127.0.0.1:5000/ --preset=desktop --chrome-flags="--headless=new" --output=json --output=html --output-path=evidence/lighthouse/desktop`
(quita `--preset=desktop` para la corrida móvil por defecto, que es la que
importa para el número histórico de esta sección). El servidor Flask debe
estar corriendo antes. Cierra cualquier navegador Playwright/MCP abierto
antes de medir — compartir CPU con un Chromium en segundo plano infla el
Total Blocking Time y hace que el número no sea comparable (confirmado en
la Fase 4: la misma página midió 85-95 en escritorio solo por eso).

## Próximos pasos sugeridos (crecimiento razonable, no una reescritura)

Aurabyte es hoy una página empresarial de captación de clientes con un
backend mínimo. Antes de añadir infraestructura, confirma con el dueño del
sitio qué problema real resuelve cada paso — no construyas por construir:

1. **Completar los datos legales** (`[PENDIENTE: ...]` en `privacidad.html`/
   `terminos.html`) y pedirle revisión a un abogado antes de considerarlos
   definitivos — es lo más urgente, no es técnico. Sigue pendiente a la
   Fase 5.
2. **Lighthouse automatizado en CI**: hoy se corre manualmente (`npx
   lighthouse`, ver "Rendimiento" arriba) — agregarlo como paso del workflow
   evitaría que una regresión de rendimiento pase desapercibida en un PR.

Ya resueltos, no reabrir sin evidencia nueva de que hace falta:
- ~~Decidir el hosting~~ — GitHub Pages, decidido y desplegado desde la
  Fase 3.
- ~~CI~~ — `.github/workflows/ci-cd.yml` ya corre pytest/playwright/bandit/
  flake8/eslint/stylelint en cada PR y push a `master`.
- ~~Comprimir `og-cover.png`~~ — ya es `og-cover.jpg`, 1024×1024, 30KB; no
  aparece en ningún audit de Lighthouse (no se carga en el render de la
  página, solo como meta `og:image`). Verificado en la Fase 5.

No se necesita autenticación de usuarios, base de datos compleja ni
contenedores para una página de este tipo — eso solo tendría sentido si el
negocio evoluciona hacia algo con cuentas/paneles, y ese es un cambio de
alcance que debe decidirse explícitamente, no asumirse.
