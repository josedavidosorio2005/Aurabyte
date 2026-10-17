"""
Aurabyte - Servidor Web Flask
Aplicación web para empresa de desarrollo de software
"""

from flask import Flask, render_template, request, jsonify, send_from_directory, abort
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from dotenv import load_dotenv
from email.mime.text import MIMEText
import os
import smtplib
import sys

# En Windows, cuando el proceso no tiene una consola interactiva adjunta
# (p. ej. lanzado por Playwright, un gestor de procesos o un servicio),
# stdout/stderr caen por defecto al codepage ANSI (cp1252) en vez de UTF-8,
# y los print() con emojis de este archivo lanzan UnicodeEncodeError y
# tumban el arranque del servidor. Forzamos UTF-8 de forma defensiva.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8")  # pyright: ignore[reportAttributeAccessIssue]
        except (ValueError, OSError):
            pass

load_dotenv()

# static_folder=None desactiva la ruta estática automática de Flask
# (/<path:filename> sirviendo TODO el directorio del proyecto, incluyendo
# app.py, requirements.txt y un .env real si existiera). En su lugar, más
# abajo se registran rutas explícitas solo para los archivos públicos que
# el frontend realmente necesita — la misma lista que usa el despliegue
# estático en GitHub Pages (ver .github/scripts/production-files.mjs).
app = Flask(__name__, template_folder=".", static_folder=None)

# SECRET_KEY solo es necesaria si se usan sesiones/cookies firmadas;
# se define por variable de entorno para no hardcodear secretos en el repo.
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", os.urandom(32).hex())

# CORS restringido a los orígenes autorizados (coma-separados en ALLOWED_ORIGINS).
# Por defecto solo permite el propio origen: la API y el frontend se sirven
# desde esta misma app, así que no se requiere "*" salvo despliegues separados.
_allowed_origins = os.environ.get("ALLOWED_ORIGINS", "").strip()
CORS(app, origins=_allowed_origins.split(",") if _allowed_origins else [])

# Rate limiting para mitigar abuso/spam del formulario de contacto y scraping de la API.
limiter = Limiter(get_remote_address, app=app, default_limits=["200 per day", "50 per hour"])


def send_contact_email(data):
    """
    Intenta enviar el mensaje de contacto por email vía SMTP.

    Requiere SMTP_HOST, SMTP_USER, SMTP_PASSWORD y CONTACT_EMAIL_TO definidas
    por variable de entorno (ver .env.example). Si no están configuradas, o
    si el envío falla, devuelve False sin lanzar una excepción — el llamador
    decide qué mensaje honesto mostrarle a quien llenó el formulario
    (nunca "enviado" si esto devuelve False).
    """
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_user = os.environ.get("SMTP_USER")
    smtp_password = os.environ.get("SMTP_PASSWORD")
    contact_to = os.environ.get("CONTACT_EMAIL_TO")

    # Comprobaciones individuales (no all([...])) para que Pyright pueda
    # angostar smtp_host/smtp_user/smtp_password/contact_to a `str` después
    # de este bloque, en vez de seguir viéndolos como `str | None`.
    if not smtp_host or not smtp_user or not smtp_password or not contact_to:
        return False

    smtp_port = int(os.environ.get("SMTP_PORT", "587"))

    # Los campos del usuario van en el CUERPO, no en cabeceras, salvo
    # Reply-To; se les quita cualquier salto de línea para evitar inyección
    # de cabeceras SMTP aunque ya pasaron la validación de arriba.
    safe_name = data["name"].replace("\r", " ").replace("\n", " ")
    safe_email = data["email"].replace("\r", "").replace("\n", "")

    body = (
        f"Nuevo mensaje de contacto desde aurabyte.\n\n"
        f"Nombre: {safe_name}\n"
        f"Email: {safe_email}\n"
        f"Teléfono: {data.get('phone') or 'No proporcionado'}\n"
        f"Servicio de interés: {data.get('service') or 'No especificado'}\n"
        f"Presupuesto estimado: {data.get('budget') or 'No especificado'}\n\n"
        f"Mensaje:\n{data['message']}\n"
    )

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = f"Nuevo contacto en Aurabyte — {safe_name}"
    msg["From"] = smtp_user
    msg["To"] = contact_to
    msg["Reply-To"] = safe_email

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_user, [contact_to], msg.as_string())
        return True
    except (smtplib.SMTPException, OSError) as e:
        print(f"⚠️  No se pudo enviar el email de contacto: {e}")
        return False


@app.after_request
def set_security_headers(response):
    """Cabeceras básicas de seguridad para todas las respuestas."""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


@app.route("/")
@limiter.exempt
def index():
    """Página principal.

    @limiter.exempt: igual trato que public_file/icons/fonts — sirve
    siempre el mismo HTML estático, sin estado, sin el vector de abuso
    real que default_limits busca mitigar (/api/contact ya tiene su
    propio límite más estricto, sin tocar). Sin esto, el límite global de
    50/hora se agota con la propia suite de Playwright (cada test carga
    "/" al menos una vez; con reintentos en CI, una sola prueba fallida
    en cascada por un 429 arrastra a las siguientes, exactamente lo que
    se observó en CI al crecer la suite).
    """
    return render_template("index.html")


# Mismos archivos sueltos que publica GitHub Pages (ver
# .github/scripts/production-files.mjs) — nada fuera de esta lista se sirve
# por HTTP, aunque exista en el directorio del proyecto.
_PUBLIC_FILES = {
    "styles.min.css",
    "byteo.min.css",
    "hero-scene.min.css",
    "script.min.js",
    "byteo.min.js",
    "hero-scene.min.js",
    "logo.svg",
    "og-cover.jpg",
    "robots.txt",
    "sitemap.xml",
}


@app.route("/<string:filename>")
@limiter.exempt
def public_file(filename):
    """Sirve únicamente los archivos estáticos sueltos en _PUBLIC_FILES.

    @limiter.exempt: el endpoint "static" que registraba Flask por defecto
    quedaba exento del límite global (comportamiento propio de
    flask-limiter); estas rutas lo sustituyen y necesitan la misma exención
    explícita, o una página con ~10 recursos estáticos agota "50 per hour"
    en pocas cargas y el resto del sitio empieza a responder 429.
    """
    if filename not in _PUBLIC_FILES:
        abort(404)
    return send_from_directory(".", filename)


@app.route("/icons/<path:filename>")
@limiter.exempt
def icons(filename):
    return send_from_directory("icons", filename)


@app.route("/fonts/<path:filename>")
@limiter.exempt
def fonts(filename):
    return send_from_directory("fonts", filename)


@app.route("/api/contact", methods=["POST"])
@limiter.limit("5 per minute")
def contact():
    """
    Endpoint para procesar formulario de contacto
    Recibe: name, email, phone, service, budget, message
    """
    try:
        data = request.get_json()

        # Validar datos recibidos
        required_fields = ["name", "email", "message"]
        for field in required_fields:
            if field not in data or not data[field]:
                return jsonify({"success": False, "message": f"Campo requerido: {field}"}), 400

        # Validar email
        import re

        email_pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        if not re.match(email_pattern, data["email"]):
            return jsonify({"success": False, "message": "Email no válido"}), 400

        # Validar longitud del mensaje
        if len(data["message"]) < 20:
            return (
                jsonify(
                    {"success": False, "message": "El mensaje debe tener al menos 20 caracteres"}
                ),
                400,
            )

        print("\n📧 ¡NUEVO MENSAJE DE CONTACTO!")
        print(f"{'='*50}")
        print(f"👤 Nombre: {data['name']}")
        print(f"📧 Email: {data['email']}")
        print(f"📱 Teléfono: {data.get('phone', 'No proporcionado')}")
        print(f"🎯 Servicio: {data.get('service', 'No especificado')}")
        print(f"💰 Presupuesto: {data.get('budget', 'No especificado')}")
        print(f"💬 Mensaje: {data['message']}")
        print(f"{'='*50}\n")

        # Importante: "success": True solo significa "el servidor recibió y
        # validó el mensaje", nunca "se envió/entregó". email_sent refleja
        # si realmente salió un correo (solo si SMTP_* está configurado en
        # el entorno — ver .env.example). El mensaje que ve quien llena el
        # formulario cambia según esto para no afirmar una entrega que no
        # ocurrió.
        email_sent = send_contact_email(data)

        if email_sent:
            response_message = "¡Mensaje enviado con éxito! Te contactaremos en menos de 24 horas."
        else:
            response_message = (
                "Mensaje recibido. Nuestro equipo lo revisará pronto; si no te "
                "contactamos en 2-3 días, escríbenos directamente por WhatsApp al "
                "+57 317 390 7301."
            )

        return (
            jsonify(
                {
                    "success": True,
                    "email_sent": email_sent,
                    "message": response_message,
                }
            ),
            200,
        )

    except Exception as e:
        print(f"❌ Error al procesar contacto: {str(e)}")
        return (
            jsonify(
                {
                    "success": False,
                    "message": (
                        "Error al procesar el mensaje. "
                        "Por favor, contacta directamente por WhatsApp."
                    ),
                }
            ),
            500,
        )


@app.route("/api/services")
def get_services():
    """Endpoint que devuelve la lista de servicios (debe reflejar exactamente
    la sección #servicios de index.html — no listar nada que no se ofrezca
    realmente)."""
    services = [
        {
            "id": 1,
            "name": "Desarrollo Web",
            "description": "Aplicaciones web modernas y responsivas con tecnologías de vanguardia.",
        },
        {
            "id": 2,
            "name": "Aplicaciones de Escritorio",
            "description": "Software nativo para Windows, macOS y Linux.",
        },
        {
            "id": 3,
            "name": "Automatización de Procesos",
            "description": "Scripts y herramientas para optimizar tareas empresariales.",
        },
        {
            "id": 4,
            "name": "Mantenimiento y Soporte Técnico",
            "description": "Acompañamiento continuo tras la entrega del proyecto.",
        },
        {
            "id": 5,
            "name": "Asesorías en Ciberseguridad",
            "description": "Buenas prácticas de seguridad aplicadas al desarrollo.",
        },
        {
            "id": 6,
            "name": "DevOps & Cloud",
            "description": "Despliegue, contenedores e infraestructura en la nube.",
        },
        {
            "id": 7,
            "name": "Security & Testing",
            "description": "Pruebas y revisión de seguridad del software entregado.",
        },
        {
            "id": 8,
            "name": "Data Engineering & ML",
            "description": "Pipelines de datos y modelos de machine learning a medida.",
        },
    ]
    return jsonify(services)


@app.route("/api/technologies")
def get_technologies():
    """Endpoint que devuelve las tecnologías utilizadas"""
    technologies = [
        {"name": "Python", "icon": "fa-python", "category": "backend"},
        {"name": "JavaScript", "icon": "fa-js", "category": "frontend"},
        {"name": "HTML5", "icon": "fa-html5", "category": "frontend"},
        {"name": "CSS3", "icon": "fa-css3-alt", "category": "frontend"},
        {"name": "React", "icon": "fa-react", "category": "frontend"},
        {"name": "Node.js", "icon": "fa-node", "category": "backend"},
        {"name": "PostgreSQL", "icon": "fa-database", "category": "database"},
        {"name": "Docker", "icon": "fa-docker", "category": "devops"},
        {"name": "Git", "icon": "fa-git-alt", "category": "tools"},
        {"name": "AWS", "icon": "fa-aws", "category": "cloud"},
    ]
    return jsonify(technologies)


@app.route("/api/projects")
def get_projects():
    """Endpoint que devuelve proyectos reales (debe reflejar exactamente la
    sección #proyectos de index.html — un solo proyecto real por ahora, no
    casos de éxito inventados)."""
    projects = [
        {
            "id": 1,
            "name": "Aurabyte Web",
            "description": (
                "Sitio institucional y portafolio oficial, con mascota animada Byteo, "
                "formulario de contacto funcional y API propia construida sobre Flask."
            ),
            "technologies": ["HTML5", "CSS3", "JavaScript", "Flask"],
        },
    ]
    return jsonify(projects)


@app.errorhandler(404)
def not_found(_error):
    """Manejador de errores 404"""
    return (
        jsonify({"error": "Recurso no encontrado", "message": "La página que buscas no existe"}),
        404,
    )


@app.errorhandler(500)
def internal_error(_error):
    """Manejador de errores 500"""
    return (
        jsonify(
            {"error": "Error interno del servidor", "message": "Algo salió mal, intenta nuevamente"}
        ),
        500,
    )


if __name__ == "__main__":
    # Configuración vía variables de entorno: por defecto, modo seguro
    # (sin debug y solo accesible en localhost). Para exponerlo en la red
    # local o en un contenedor, define HOST=0.0.0.0 explícitamente.
    debug_mode = os.environ.get("FLASK_DEBUG", "0") == "1"
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "5000"))

    print("🚀 Iniciando servidor Flask...")
    print(f"📍 URL: http://{host}:{port}")
    print(f"🐞 Debug: {debug_mode}")
    print("📁 Directorio actual:", os.getcwd())

    # threaded=True: el servidor de desarrollo de Flask es de un solo hilo por
    # defecto y se satura con requests concurrentes (p. ej. Playwright
    # cargando CSS/JS/fuentes en paralelo en varios navegadores a la vez),
    # lo que provocaba resultados intermitentes en las pruebas E2E. No
    # sustituye un servidor WSGI de producción (gunicorn, el runtime de
    # Vercel, etc.), que ya maneja esto correctamente.
    app.run(host=host, port=port, debug=debug_mode, threaded=True)
