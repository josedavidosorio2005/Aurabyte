"""
Aurabyte - Servidor Web Flask
Aplicación web para empresa de desarrollo de software
"""

from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import os

app = Flask(__name__, 
            template_folder='.',
            static_folder='.',
            static_url_path='')

# Habilitar CORS para APIs
CORS(app)

@app.route('/')
def index():
    """Página principal"""
    return render_template('index.html')

@app.route('/api/contact', methods=['POST'])
def contact():
    """
    Endpoint para procesar formulario de contacto
    Recibe: name, email, phone, service, budget, message
    """
    try:
        data = request.get_json()
        
        # Validar datos recibidos
        required_fields = ['name', 'email', 'message']
        for field in required_fields:
            if field not in data or not data[field]:
                return jsonify({
                    'success': False,
                    'message': f'Campo requerido: {field}'
                }), 400
        
        # Validar email
        import re
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_pattern, data['email']):
            return jsonify({
                'success': False,
                'message': 'Email no válido'
            }), 400
        
        # Validar longitud del mensaje
        if len(data['message']) < 20:
            return jsonify({
                'success': False,
                'message': 'El mensaje debe tener al menos 20 caracteres'
            }), 400
        
        # Aquí puedes agregar la lógica para:
        # - Enviar email con smtplib o SendGrid
        # - Guardar en base de datos
        # - Notificar por Slack/Discord/WhatsApp
        # - Integrar con CRM
        
        print(f"\n📧 ¡NUEVO MENSAJE DE CONTACTO!")
        print(f"{'='*50}")
        print(f"👤 Nombre: {data['name']}")
        print(f"📧 Email: {data['email']}")
        print(f"📱 Teléfono: {data.get('phone', 'No proporcionado')}")
        print(f"🎯 Servicio: {data.get('service', 'No especificado')}")
        print(f"💰 Presupuesto: {data.get('budget', 'No especificado')}")
        print(f"💬 Mensaje: {data['message']}")
        print(f"{'='*50}\n")
        
        # Aquí podrías enviar un email automático
        # send_email_notification(data)
        
        return jsonify({
            'success': True,
            'message': '¡Mensaje recibido! Te contactaremos en menos de 24 horas.'
        }), 200
        
    except Exception as e:
        print(f"❌ Error al procesar contacto: {str(e)}")
        return jsonify({
            'success': False,
            'message': 'Error al procesar el mensaje. Por favor, contacta directamente por WhatsApp.'
        }), 500

@app.route('/api/services')
def get_services():
    """Endpoint que devuelve la lista de servicios"""
    services = [
        {
            'id': 1,
            'name': 'Desarrollo Web',
            'description': 'Creamos páginas web modernas y responsivas',
            'icon': 'fa-globe',
            'features': ['Diseño responsivo', 'Optimización SEO', 'Alta velocidad']
        },
        {
            'id': 2,
            'name': 'Desarrollo con Python',
            'description': 'Aplicaciones web robustas con Django y Flask',
            'icon': 'fa-python',
            'features': ['APIs REST', 'Backend robusto', 'Automatización']
        },
        {
            'id': 3,
            'name': 'E-Commerce',
            'description': 'Tiendas online completas y funcionales',
            'icon': 'fa-shopping-cart',
            'features': ['Pagos integrados', 'Gestión de productos', 'Analytics']
        }
    ]
    return jsonify(services)

@app.route('/api/technologies')
def get_technologies():
    """Endpoint que devuelve las tecnologías utilizadas"""
    technologies = [
        {'name': 'Python', 'icon': 'fa-python', 'category': 'backend'},
        {'name': 'JavaScript', 'icon': 'fa-js', 'category': 'frontend'},
        {'name': 'HTML5', 'icon': 'fa-html5', 'category': 'frontend'},
        {'name': 'CSS3', 'icon': 'fa-css3-alt', 'category': 'frontend'},
        {'name': 'React', 'icon': 'fa-react', 'category': 'frontend'},
        {'name': 'Node.js', 'icon': 'fa-node', 'category': 'backend'},
        {'name': 'PostgreSQL', 'icon': 'fa-database', 'category': 'database'},
        {'name': 'Docker', 'icon': 'fa-docker', 'category': 'devops'},
        {'name': 'Git', 'icon': 'fa-git-alt', 'category': 'tools'},
        {'name': 'AWS', 'icon': 'fa-aws', 'category': 'cloud'}
    ]
    return jsonify(technologies)

@app.route('/api/projects')
def get_projects():
    """Endpoint que devuelve proyectos destacados"""
    projects = [
        {
            'id': 1,
            'name': 'Tienda Online',
            'description': 'E-commerce completo con pasarela de pagos',
            'technologies': ['Python', 'Django', 'PostgreSQL'],
            'icon': 'fa-store'
        },
        {
            'id': 2,
            'name': 'Portal Corporativo',
            'description': 'Sitio web institucional con CMS',
            'technologies': ['Flask', 'React', 'MongoDB'],
            'icon': 'fa-briefcase'
        },
        {
            'id': 3,
            'name': 'Dashboard Analytics',
            'description': 'Panel de análisis de datos en tiempo real',
            'technologies': ['Python', 'FastAPI', 'Vue.js'],
            'icon': 'fa-chart-line'
        }
    ]
    return jsonify(projects)

@app.errorhandler(404)
def not_found(error):
    """Manejador de errores 404"""
    return jsonify({
        'error': 'Recurso no encontrado',
        'message': 'La página que buscas no existe'
    }), 404

@app.errorhandler(500)
def internal_error(error):
    """Manejador de errores 500"""
    return jsonify({
        'error': 'Error interno del servidor',
        'message': 'Algo salió mal, intenta nuevamente'
    }), 500

if __name__ == '__main__':
    # Modo desarrollo
    print("🚀 Iniciando servidor Flask...")
    print("📍 URL: http://localhost:5000")
    print("📁 Directorio actual:", os.getcwd())
    
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True
    )
