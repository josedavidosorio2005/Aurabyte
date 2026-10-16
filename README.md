# Aurabyte — Sitio Web Corporativo

Sitio web de Aurabyte, equipo multidisciplinario de desarrollo de software remoto
(Python, web, automatización). Frontend estático (HTML/CSS/JS, sin framework) con
**WhatsApp Business como canal de cotizaciones, e Instagram como red social** — el sitio no requiere backend
para funcionar.

🔗 **Sitio publicado:** https://josedavidosorio2005.github.io/Aurabyte/

## Características

- Los precios no se publican: cada proyecto se cotiza directamente con el equipo.
- Instagram oficial: https://www.instagram.com/aurabyte_software/

- Diseño futurista responsivo con hero holográfico, tarjeta de código, progreso de lectura, halos interactivos y animaciones accesibles; modo claro/oscuro persistente
- Formulario de contacto que arma un mensaje y lo abre en WhatsApp — sin backend,
  sin email, sin almacenar datos en ningún servidor
- Rendimiento: 90-95/100 en Lighthouse móvil, 100/100 en escritorio, accesibilidad,
  mejores prácticas y SEO
- Accesible (WCAG 2.1/2.2 AA): navegación por teclado, foco visible, lectores de
  pantalla, contraste de color verificado
- Mascota animada "Byteo" y mensajería de cotización personalizada para cada tipo de solución
- API REST en Flask (`app.py`) — **no se usa en el sitio publicado**, se conserva
  como capacidad disponible para el futuro (ver "Arquitectura" abajo)

## Arquitectura

```
index.html, styles.css, script.js        Sitio principal
byteo.css, byteo.js                      Mascota "Byteo"
icons/sprite.svg                         Íconos propios (sin Font Awesome por CDN)
fonts/*.woff2, fonts/fonts.css           Fuentes auto-alojadas (sin Google Fonts externo)
*.min.css, *.min.js                      Generados con `npm run build` — ver abajo
robots.txt, sitemap.xml, og-cover.jpg    SEO / redes sociales
app.py, requirements.txt                 Backend Flask (API REST, hoy sin usar en producción)
tests/                                   Pytest (backend) + Playwright (E2E/accesibilidad)
.github/workflows/                       CI: pruebas, lint, seguridad, despliegue a Pages
```

El frontend no hace ninguna llamada a `/api/*` — todo el contacto pasa por
WhatsApp directamente en el navegador. Esto significa que el sitio se puede
publicar como archivos estáticos puros (GitHub Pages), sin necesidad de un
servidor Python corriendo. El backend Flask sigue existiendo y probado (10
pruebas), por si en el futuro se activa un canal de email real — ver
`CLAUDE.md` para el detalle completo de cada decisión.

## Desarrollo local

```bash
# Backend (opcional — solo si vas a tocar app.py)
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.venv\Scripts\python.exe app.py      # http://127.0.0.1:5000

# Frontend
npm install
npm run build        # Regenera los *.min.css/*.min.js — necesario tras editar
                      # styles.css/script.js/byteo.css/byteo.js
```

## Pruebas

```bash
.venv\Scripts\python.exe -m pytest -q    # Backend: 10 pruebas
npx playwright test                       # E2E + accesibilidad: 27 pruebas
npx eslint . && npx stylelint "**/*.css" && npm run lint:html   # Lint
.venv\Scripts\python.exe -m bandit -r app.py   # Seguridad estática
```

Ver `CLAUDE.md` para la documentación técnica completa (decisiones de diseño,
rendimiento, seguridad, limitaciones conocidas) y `DEPLOYMENT.md` para el
despliegue.

## Pendientes conocidos

- **Legal**: `privacidad.html` y `terminos.html` existen como borrador en el
  repositorio pero **no se publican** todavía — faltan datos jurídicos reales
  (NIT, razón social, dirección) que no se deben inventar. Ver `CLAUDE.md`.

## Licencia

Proyecto privado y confidencial de Aurabyte.
