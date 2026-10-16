# Despliegue de Aurabyte

## 🚀 Despliegue actual: GitHub Pages vía GitHub Actions

El sitio se publica en **https://josedavidosorio2005.github.io/Aurabyte/**
mediante `.github/workflows/ci-cd.yml`, un único workflow con dos jobs:

1. **`test`** (corre en cada push y pull request a `master`): build,
   lint de HTML/CSS/JS, pruebas de backend (pytest), seguridad estática
   (bandit), auditoría de dependencias (`npm audit` / `pip-audit`),
   pruebas E2E + accesibilidad (Playwright, 3 navegadores) y verificación de
   enlaces internos y de los archivos a publicar.
2. **`deploy`** (`needs: test`, solo en push a `master`): construye el
   artefacto con *únicamente* los archivos de producción y lo despliega a
   GitHub Pages con las acciones oficiales de GitHub
   (`actions/upload-pages-artifact` + `actions/deploy-pages`).

Un solo workflow con `needs: test` — en vez de dos workflows separados — para
que el despliegue solo pueda arrancar si las pruebas ya pasaron en el mismo
commit, sin ninguna forma de disparo asíncrono (`workflow_run`, etc.) que
pudiera competir o publicar una versión distinta a la que se probó. Si
`test` falla, `deploy` no corre — el despliegue queda bloqueado.

**No hay backend en este despliegue.** El formulario de contacto arma un
mensaje de WhatsApp en el propio navegador y abre `wa.me` — no hace ninguna
llamada a `/api/*`, así que el sitio funciona completo como archivos
estáticos puros. El backend Flask (`app.py`) sigue en el repositorio,
probado (10 pruebas), pero **no se publica** — ver "Qué se publica" abajo.

### Qué se publica (y qué no)

El job `deploy` copia únicamente lo que lista
`.github/scripts/production-files.mjs` (fuente única de verdad, usada tanto
para el chequeo como para el empaquetado real): `index.html`, `*.min.css`,
`*.min.js`, `fonts/`, `icons/`, `logo.svg`, `og-cover.jpg`, `robots.txt`,
`sitemap.xml`.

**Explícitamente excluido** del artefacto publicado:
- `app.py`, `requirements*.txt`, `.env*` — nada de backend ni configuración
  de servidor en un host estático.
- `.venv/`, `node_modules/`, `tests/` — entornos y pruebas, no es contenido
  del sitio.
- `styles.css`, `script.js`, `byteo.css`, `byteo.js` (los originales, no
  minificados) — se sirven los `.min.*`.
- `privacidad.html`, `terminos.html`, `legal.css` — **borradores legales
  pendientes de datos jurídicos reales (NIT, razón social, dirección)**. No
  se publican como documentos definitivos con marcadores `[PENDIENTE: ...]`
  — ver `CLAUDE.md`, sección "Legal". El formulario de contacto no depende
  de ellos: no envía datos a ningún servidor, así que no hay un vacío de
  cumplimiento al no tenerlos públicos todavía.
- `CLAUDE.md`, `package.json`/`package-lock.json`, configs de linters —
  documentación interna y herramientas de desarrollo, no contenido público.

### Rutas bajo `/Aurabyte/`

GitHub Pages de proyecto (no de usuario) sirve el sitio bajo un subdirectorio
(`/Aurabyte/`, no la raíz del dominio). Todos los enlaces del sitio
(`styles.min.css`, `fonts/fonts.css`, `icons/sprite.svg#icon-x`, etc.) usan
rutas **relativas**, no absolutas (`/algo`) — por eso funcionan igual bajo
`/Aurabyte/` que en local bajo `/`. Si agregas un recurso nuevo, usa siempre
una ruta relativa al archivo que lo referencia, nunca `href="/archivo"`.

## 🔐 Variables de entorno (solo si se reactiva el backend)

El sitio publicado no necesita ninguna variable de entorno. Esta tabla
aplica **solo** si en el futuro se despliega `app.py` en un host con backend
(Vercel, Railway, Render) para reactivar el envío de contacto por email:

| Variable | Obligatoria | Por qué |
|---|---|---|
| `SECRET_KEY` | Sí, en serverless | Si no la defines, cada arranque frío genera una aleatoria distinta. No se usa para sesiones hoy, pero evita invalidaciones si en el futuro se agrega login. Genera una con `python -c "import secrets; print(secrets.token_hex(32))"`. |
| `ALLOWED_ORIGINS` | Solo si frontend y backend NO comparten dominio | Por defecto no se permite ningún origen cruzado. |
| `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD`/`CONTACT_EMAIL_TO` | Solo para reactivar el email | Ver `.env.example`. Sin esto, `/api/contact` sigue funcionando pero no afirma haber enviado nada. |
| `FLASK_DEBUG` | No (dejar sin definir = `0`) | Nunca en `1` en producción. |

**Nota sobre el rate limit de `/api/contact`:** usa almacenamiento en memoria
(`flask-limiter`), válido para un proceso persistente (Railway/Render) pero
no se comparte entre invocaciones frías de Vercel. Irrelevante mientras el
backend no esté desplegado.

## Alternativas (solo si se reactiva el backend)

Si en el futuro se necesita el backend Flask en producción (email real), las
opciones siguen siendo las mismas que antes de pasar a WhatsApp:

- **Vercel**: `vercel.json` ya está configurado (frontend + API en el mismo
  dominio, sin necesitar `ALLOWED_ORIGINS`).
- **Railway/Render**: backend solo; si el frontend sigue en GitHub Pages,
  configurar `ALLOWED_ORIGINS` con el dominio de Pages.

Ninguna de estas está activa ni configurada — es documentación para cuando
haga falta, no una recomendación a ejecutar ahora.

## 🔗 Enlaces Útiles

- Repositorio: https://github.com/josedavidosorio2005/Aurabyte
- Sitio publicado: https://josedavidosorio2005.github.io/Aurabyte/
- Configuración de Pages: https://github.com/josedavidosorio2005/Aurabyte/settings/pages
- Workflows: https://github.com/josedavidosorio2005/Aurabyte/actions
- Documentación GitHub Pages: https://docs.github.com/pages
