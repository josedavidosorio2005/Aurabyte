# Despliegue de Aurabyte

Este proyecto está desplegado y disponible en línea.

## 🚀 Opciones de Despliegue

### Opción 1: GitHub Pages (Solo Frontend - Recomendado para demo)

1. Ve a tu repositorio: https://github.com/josedavidosorio2005/Aurabyte
2. Click en **Settings** (Configuración)
3. En el menú lateral, click en **Pages**
4. En **Source**, selecciona **Deploy from a branch**
5. En **Branch**, selecciona **master** y carpeta **/ (root)**
6. Click en **Save**
7. Espera unos minutos y tu sitio estará disponible en:
   ```
   https://josedavidosorio2005.github.io/Aurabyte/
   ```

**Nota:** GitHub Pages solo sirve archivos estáticos, el formulario de contacto no funcionará sin backend.

### Opción 2: Vercel (Frontend + Backend - Recomendado)

1. Ve a [vercel.com](https://vercel.com)
2. Click en **Sign Up** o **Login** con tu cuenta de GitHub
3. Click en **Add New Project**
4. Importa tu repositorio: `josedavidosorio2005/Aurabyte`
5. Vercel detectará automáticamente la configuración
6. Click en **Deploy**
7. Tu sitio estará disponible en:
   ```
   https://aurabyte.vercel.app
   ```

### Opción 3: Netlify (Frontend + Backend)

1. Ve a [netlify.com](https://netlify.com)
2. Click en **Sign Up** o **Login** con GitHub
3. Click en **Add new site** → **Import an existing project**
4. Selecciona tu repositorio de GitHub
5. Configuración:
   - Build command: `(dejar vacío)`
   - Publish directory: `./`
6. Click en **Deploy site**

### Opción 4: Railway (Backend completo)

1. Ve a [railway.app](https://railway.app)
2. Login con GitHub
3. Click en **New Project** → **Deploy from GitHub repo**
4. Selecciona `Aurabyte`
5. Railway detectará Python automáticamente
6. Tu API estará disponible en una URL como:
   ```
   https://aurabyte-production.up.railway.app
   ```

## 📝 Configuración del Formulario

Si usas GitHub Pages, necesitarás un backend separado. Puedes:

1. Desplegar `app.py` en Railway/Render/Heroku
2. Actualizar la URL de la API en `script.js`:
   ```javascript
   const response = await fetch('https://tu-backend.railway.app/api/contact', {
   ```

## 🎯 Recomendación

**Para máxima simplicidad:** Usa **Vercel** - despliega todo (frontend + backend) automáticamente con un click.

## 🔗 Enlaces Útiles

- Repositorio: https://github.com/josedavidosorio2005/Aurabyte
- Documentación Vercel: https://vercel.com/docs
- Documentación GitHub Pages: https://pages.github.com
