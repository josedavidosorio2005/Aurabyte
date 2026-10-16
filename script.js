// Marca <html class="js"> lo antes posible: las reglas de ".js .service-card"
// etc. en styles.css solo ocultan las tarjetas antes de la animación de
// scroll cuando JS está disponible para luego mostrarlas. Sin esta marca
// (JS desactivado), las tarjetas se ven normales desde el principio.
document.documentElement.classList.add('js');

// Cambio de tema (Modo Oscuro/Claro)
const themeToggle = document.getElementById('themeToggle');
const body = document.body;
// El ícono es un <svg><use href="icons/sprite.svg#icon-moon"></use></svg>;
// "cambiar de ícono" ahora es reapuntar el href del <use>, no togglear clases.
const themeIconUse = themeToggle.querySelector('use');

function setThemeIcon(isDark) {
    themeIconUse.setAttribute('href', `icons/sprite.svg#icon-${isDark ? 'sun' : 'moon'}`);
}

// Cargar tema guardado
const savedTheme = localStorage.getItem('theme') || 'light';
if (savedTheme === 'dark') {
    body.classList.add('dark-mode');
    setThemeIcon(true);
    themeToggle.setAttribute('aria-pressed', 'true');
}

// Toggle theme
themeToggle.addEventListener('click', () => {
    body.classList.toggle('dark-mode');
    const isDark = body.classList.contains('dark-mode');
    themeToggle.setAttribute('aria-pressed', String(isDark));
    setThemeIcon(isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
});

// Menú hamburguesa
const hamburger = document.getElementById('hamburger');
const navMenu = document.getElementById('navMenu');

hamburger.addEventListener('click', () => {
    navMenu.classList.toggle('active');
    const isOpen = navMenu.classList.contains('active');

    // Estado accesible: lectores de pantalla anuncian si el menú está abierto
    hamburger.setAttribute('aria-expanded', String(isOpen));
    hamburger.setAttribute('aria-label', isOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación');

    // Animación del hamburger
    const spans = hamburger.querySelectorAll('span');
    spans[0].style.transform = isOpen ? 'rotate(45deg) translate(5px, 5px)' : 'rotate(0)';
    spans[1].style.opacity = isOpen ? '0' : '1';
    spans[2].style.transform = isOpen ? 'rotate(-45deg) translate(7px, -6px)' : 'rotate(0)';
});

// Cerrar menú al hacer click en un enlace
document.querySelectorAll('.nav-menu a').forEach(link => {
    link.addEventListener('click', () => {
        navMenu.classList.remove('active');
        hamburger.setAttribute('aria-expanded', 'false');
        hamburger.setAttribute('aria-label', 'Abrir menú de navegación');
        const spans = hamburger.querySelectorAll('span');
        spans[0].style.transform = 'rotate(0)';
        spans[1].style.opacity = '1';
        spans[2].style.transform = 'rotate(0)';
    });
});

// Navbar transparente al hacer scroll
const navbar = document.querySelector('.navbar');
let lastScroll = 0;

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;

    if (currentScroll > 50) {
        navbar.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.15)';
    } else {
        navbar.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
    }

    lastScroll = currentScroll;
});

// Botón flotante de WhatsApp: oculto mientras el hero está en pantalla para
// no tapar sus propios botones (ambos ocupan la misma esquina en móvil).
// Visible el resto del tiempo, como cualquier widget de chat flotante.
const whatsappFloat = document.querySelector('.whatsapp-float');
const heroSection = document.getElementById('inicio');

function updateWhatsAppFloatVisibility() {
    const heroBottom = heroSection.getBoundingClientRect().bottom;
    whatsappFloat.classList.toggle('is-visible', heroBottom < 0);
}

window.addEventListener('scroll', updateWhatsAppFloatVisibility, { passive: true });
updateWhatsAppFloatVisibility();

// Barra de lectura: transform evita recalcular el layout en cada scroll.
const scrollProgress = document.querySelector('.scroll-progress');
let progressFrame = 0;
function updateScrollProgress() {
    if (progressFrame) return;
    progressFrame = window.requestAnimationFrame(() => {
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const progress = maxScroll > 0 ? Math.min(1, window.scrollY / maxScroll) : 0;
        scrollProgress.style.transform = `scaleX(${progress})`;
        progressFrame = 0;
    });
}
window.addEventListener('scroll', updateScrollProgress, { passive: true });
updateScrollProgress();

// Animación de scroll suave para los enlaces
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Animación de elementos al hacer scroll
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            // El estado oculto inicial y la transición ya están en CSS
            // (".js .service-card", etc.) — aquí solo togglear la clase.
            entry.target.classList.add('is-visible');
        }
    });
}, observerOptions);

// Scroll reveal escalonado, sin ocultar contenido si JS está deshabilitado.
const revealItems = document.querySelectorAll(
    '.pricing-card, .value-card, .team-member, .project-cta-card, .about-highlights .highlight-item'
);
revealItems.forEach((item, index) => {
    item.classList.add('reveal-on-scroll');
    item.style.setProperty('--reveal-delay', `${(index % 3) * 75}ms`);
});

document.querySelectorAll(
    '.service-card, .project-card, .tech-item, .reveal-on-scroll'
).forEach(card => observer.observe(card));

// Halo de interacción localizado; no usa librerías ni anima el layout.
const canTrackPointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
if (canTrackPointer) {
    document.querySelectorAll('.service-card, .pricing-card, .value-card').forEach(card => {
        card.addEventListener('pointermove', event => {
            const bounds = card.getBoundingClientRect();
            card.style.setProperty('--spot-x', `${event.clientX - bounds.left}px`);
            card.style.setProperty('--spot-y', `${event.clientY - bounds.top}px`);
        }, { passive: true });
    });
}

// Formulario de contacto: ya no hace POST a /api/contact (eso requeriría
// SMTP configurado, que no existe hoy — ver CLAUDE.md). Construye un mensaje
// de WhatsApp a partir de los campos y abre wa.me; el envío real lo confirma
// la persona que llena el formulario al presionar "Enviar" DENTRO de
// WhatsApp, así que nunca afirmamos "mensaje enviado" desde aquí.
const WHATSAPP_NUMBER = '573173907301';
const contactForm = document.getElementById('contactForm');
const formMessage = document.getElementById('formMessage');

// Validación en tiempo real
const nameInput = document.getElementById('name');
const serviceInput = document.getElementById('service');
const messageInput = document.getElementById('message');

// Marca un campo como inválido/válido también para lectores de pantalla
// (aria-invalid), no solo visualmente.
function setFieldError(input, errorEl, message) {
    errorEl.textContent = message;
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

nameInput.addEventListener('blur', () => {
    const nameError = document.getElementById('nameError');
    setFieldError(
        nameInput,
        nameError,
        nameInput.value.length < 3 ? 'El nombre debe tener al menos 3 caracteres' : ''
    );
});

serviceInput.addEventListener('change', () => {
    const serviceError = document.getElementById('serviceError');
    setFieldError(serviceInput, serviceError, !serviceInput.value ? 'Selecciona un servicio' : '');
});

messageInput.addEventListener('blur', () => {
    const messageError = document.getElementById('messageError');
    setFieldError(
        messageInput,
        messageError,
        messageInput.value.length < 20 ? 'El mensaje debe tener al menos 20 caracteres' : ''
    );
});

// Arma el mensaje de WhatsApp con lo que la persona escribió — nada se
// inventa ni se agrega aparte de los datos del propio formulario.
function buildWhatsAppMessage(formData) {
    const lines = [
        `Hola, equipo de Aurabyte. Soy ${formData.name}.`,
        `Servicio de interés: ${formData.service}.`,
    ];
    if (formData.phone) {
        lines.push(`Teléfono de contacto: ${formData.phone}.`);
    }
    lines.push('', formData.message);
    return lines.join('\n');
}

contactForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const formData = {
        name: document.getElementById('name').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        service: document.getElementById('service').value,
        message: document.getElementById('message').value.trim(),
    };

    if (formData.name.length < 3) {
        showFormMessage('El nombre debe tener al menos 3 caracteres', 'error');
        return;
    }

    if (!formData.service) {
        showFormMessage('Selecciona un servicio de interés', 'error');
        return;
    }

    if (formData.message.length < 20) {
        showFormMessage('Describe tu proyecto con al menos 20 caracteres', 'error');
        return;
    }

    const text = encodeURIComponent(buildWhatsAppMessage(formData));
    const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;

    // "Recibido" aquí significa "listo para enviar", no "entregado": el
    // paso final (presionar Enviar) ocurre en WhatsApp, fuera de este sitio.
    showFormMessage(
        'Vas a continuar en WhatsApp con tu mensaje ya escrito. Presiona Enviar allí para completar tu solicitud.',
        'success'
    );
    showNotification('📲 Abriendo WhatsApp…', 'success');
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    contactForm.reset();
});

// Mostrar mensajes en el formulario
function showFormMessage(message, type) {
    formMessage.textContent = message;
    formMessage.className = `form-message ${type}`;

    // Scroll al mensaje
    formMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Ocultar después de 8 segundos si es éxito
    if (type === 'success') {
        setTimeout(() => {
            formMessage.className = 'form-message';
        }, 8000);
    }
}

// Sistema de notificaciones
function showNotification(message, type = 'info') {
    // Crear elemento de notificación
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    const iconName = type === 'success' ? 'check-circle' : 'exclamation-circle';
    notification.innerHTML = `
        <svg class="icon" aria-hidden="true"><use href="icons/sprite.svg#icon-${iconName}"></use></svg>
        <span>${message}</span>
    `;
    
    // Estilos inline para la notificación
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${type === 'success' ? '#10b981' : '#ef4444'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        gap: 10px;
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
        font-weight: 500;
    `;
    
    document.body.appendChild(notification);
    
    // Eliminar después de 4 segundos
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// Agregar animaciones CSS para notificaciones
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Contador de scroll para animar números (opcional)
function animateValue(element, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        element.textContent = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// Resaltar enlace activo en el menú
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-menu a');

window.addEventListener('scroll', () => {
    let current = '';
    
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        if (window.pageYOffset >= sectionTop - 200) {
            current = section.getAttribute('id');
        }
    });
    
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${current}`) {
            link.classList.add('active');
        }
    });
});




