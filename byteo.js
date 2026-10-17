/**
 * Byteo - La mascota robot de Aurabyte
 * Robot minimalista interactivo que juega con el cursor
 */

class Byteo {
    constructor() {
        this.container = null;
        this.robot = null;
        this.isActive = false;
        this.lastMouseMove = Date.now();
        this.inactivityThreshold = 5000; // 5 segundos de inactividad
        this.targetX = 0;
        this.targetY = 0;
        this.currentX = 0;
        this.currentY = 0;
        this.isCarryingCursor = false;
        this.animationFrame = null;
        this.walkingPath = [];
        this.currentPathIndex = 0;
        
        this.init();
    }
    
    init() {
        // Crear el contenedor de Byteo
        this.container = document.createElement('div');
        this.container.id = 'byteo-container';
        // Byteo es un personaje decorativo que persigue el cursor: no aporta
        // información ni funcionalidad necesaria, así que se oculta de
        // lectores de pantalla y tecnología asistiva en vez de simular una
        // interacción por teclado que no aportaría nada real.
        this.container.setAttribute('aria-hidden', 'true');
        this.container.innerHTML = `
            <div class="byteo-robot" id="byteo">
                <!-- Antena -->
                <div class="byteo-antenna">
                    <div class="byteo-antenna-ball"></div>
                </div>
                
                <!-- Cabeza -->
                <div class="byteo-head">
                    <div class="byteo-eyes">
                        <div class="byteo-eye left">
                            <div class="byteo-pupil"></div>
                        </div>
                        <div class="byteo-eye right">
                            <div class="byteo-pupil"></div>
                        </div>
                    </div>
                    <div class="byteo-mouth"></div>
                </div>
                
                <!-- Cuerpo -->
                <div class="byteo-body">
                    <div class="byteo-chest"></div>
                </div>
                
                <!-- Brazos -->
                <div class="byteo-arms">
                    <div class="byteo-arm left"></div>
                    <div class="byteo-arm right"></div>
                </div>
                
                <!-- Piernas -->
                <div class="byteo-legs">
                    <div class="byteo-leg left"></div>
                    <div class="byteo-leg right"></div>
                </div>
            </div>
            
            <!-- Cursor capturado -->
            <div class="byteo-cursor" id="byteo-cursor">
                <svg width="20" height="20" viewBox="0 0 20 20">
                    <path d="M0 0 L0 16 L6 10 L9 16 L11 15 L8 9 L14 9 Z" fill="#0ea5e9"/>
                </svg>
            </div>
            
            <!-- Mensaje de Byteo -->
            <div class="byteo-message" id="byteo-message"></div>
        `;
        
        document.body.appendChild(this.container);
        this.robot = document.getElementById('byteo');
        
        // Posición inicial (abajo derecha, salvo que eso solape el botón de
        // WhatsApp/la navbar/las CTAs del hero — pickSafePoint ya está
        // disponible aquí porque solo depende de selectores del DOM, no de
        // this.walkingPath).
        const initial = this.pickSafePoint(20, window.innerWidth - 20, 20, window.innerHeight - 20);
        this.currentX = initial.x;
        this.currentY = initial.y;
        this.updatePosition();
        
        this.setupEventListeners();
        this.startWatching();
    }
    
    setupEventListeners() {
        // Detectar movimiento del mouse
        document.addEventListener('mousemove', (e) => {
            this.lastMouseMove = Date.now();
            
            if (!this.isCarryingCursor) {
                this.targetX = e.clientX;
                this.targetY = e.clientY;
                this.lookAtCursor(e.clientX, e.clientY);
            }
            
            // Si estaba llevando el cursor, soltarlo
            if (this.isCarryingCursor) {
                this.releaseCursor();
            }
        });
        
        // Click en Byteo
        this.robot.addEventListener('click', () => {
            this.sayMessage('¡Hola! Soy Byteo 🤖');
            this.dance();
        });
        
        // Resize
        window.addEventListener('resize', () => {
            if (this.currentX > window.innerWidth - 100) {
                this.currentX = window.innerWidth - 100;
            }
            if (this.currentY > window.innerHeight - 100) {
                this.currentY = window.innerHeight - 100;
            }
            this.updatePosition();
        });
    }
    
    startWatching() {
        setInterval(() => {
            const timeSinceLastMove = Date.now() - this.lastMouseMove;
            
            if (timeSinceLastMove > this.inactivityThreshold && !this.isCarryingCursor) {
                this.grabCursor();
            }
        }, 1000);
        
        // Animación continua
        this.animate();
    }
    
    animate() {
        if (!this.isCarryingCursor) {
            // Movimiento suave hacia el cursor
            const dx = this.targetX - this.currentX;
            const dy = this.targetY - this.currentY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 50) {
                this.currentX += dx * 0.02;
                this.currentY += dy * 0.02;
                this.updatePosition();
                this.setEmotion('curious');
            } else {
                this.setEmotion('happy');
            }
        } else {
            // Caminar por la pantalla con el cursor
            if (this.walkingPath.length === 0 || this.currentPathIndex >= this.walkingPath.length) {
                this.generateWalkingPath();
                this.currentPathIndex = 0;
            }
            
            const target = this.walkingPath[this.currentPathIndex];
            const dx = target.x - this.currentX;
            const dy = target.y - this.currentY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 5) {
                // Llegó al punto, ir al siguiente
                this.currentPathIndex++;
                
                // Cambiar dirección de Byteo
                if (this.currentPathIndex < this.walkingPath.length) {
                    const nextTarget = this.walkingPath[this.currentPathIndex];
                    this.faceDirection(nextTarget.x - this.currentX);
                }
            } else {
                // Moverse hacia el punto
                this.currentX += dx * 0.03;
                this.currentY += dy * 0.03;
                this.faceDirection(dx);
                this.animateWalking();
            }
            
            this.updatePosition();
            this.updateCursorPosition();
        }
        
        this.animationFrame = requestAnimationFrame(() => this.animate());
    }
    
    updatePosition() {
        const scaleX = this.robot.style.transform.includes('scaleX(-1)') ? 'scaleX(-1)' : 'scaleX(1)';
        this.robot.style.transform = `translate(${this.currentX}px, ${this.currentY}px) ${scaleX}`;
    }
    
    updateCursorPosition() {
        const cursor = document.getElementById('byteo-cursor');
        if (cursor && this.isCarryingCursor) {
            cursor.style.transform = `translate(${this.currentX + 30}px, ${this.currentY - 20}px)`;
        }
    }
    
    lookAtCursor(x, y) {
        const pupils = document.querySelectorAll('.byteo-pupil');
        const dx = x - this.currentX;
        const dy = y - this.currentY;
        const angle = Math.atan2(dy, dx);
        
        pupils.forEach(pupil => {
            const offsetX = Math.cos(angle) * 3;
            const offsetY = Math.sin(angle) * 3;
            pupil.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
        });
    }
    
    grabCursor() {
        this.isCarryingCursor = true;
        const cursor = document.getElementById('byteo-cursor');
        cursor.style.display = 'block';
        
        this.setEmotion('excited');
        this.sayMessage('¡Encontré el cursor! 🎯 Vamos a pasear');
        
        // Ocultar cursor real
        document.body.style.cursor = 'none';
        
        // Animación de brazos
        this.robot.classList.add('grabbing');
        
        // Generar ruta de paseo
        this.generateWalkingPath();
    }
    
    releaseCursor() {
        this.isCarryingCursor = false;
        const cursor = document.getElementById('byteo-cursor');
        cursor.style.display = 'none';
        
        this.setEmotion('sad');
        this.sayMessage('Oh no... se escapó 😢');
        
        // Restaurar cursor
        document.body.style.cursor = '';
        
        this.robot.classList.remove('grabbing');
        this.robot.classList.remove('walking');
        
        // Resetear ruta
        this.walkingPath = [];
        this.currentPathIndex = 0;
    }
    
    setEmotion(emotion) {
        const mouth = this.robot.querySelector('.byteo-mouth');

        this.robot.className = 'byteo-robot ' + emotion;
        
        switch(emotion) {
            case 'happy':
                mouth.style.borderRadius = '0 0 20px 20px';
                mouth.style.height = '8px';
                break;
            case 'sad':
                mouth.style.borderRadius = '20px 20px 0 0';
                mouth.style.height = '8px';
                break;
            case 'excited':
                mouth.style.borderRadius = '50%';
                mouth.style.height = '15px';
                break;
            case 'curious':
                mouth.style.borderRadius = '50%';
                mouth.style.height = '5px';
                break;
        }
    }
    
    sayMessage(text) {
        const messageEl = document.getElementById('byteo-message');
        messageEl.textContent = text;
        messageEl.classList.add('show');
        
        setTimeout(() => {
            messageEl.classList.remove('show');
        }, 3000);
    }
    
    dance() {
        this.robot.classList.add('dancing');
        setTimeout(() => {
            this.robot.classList.remove('dancing');
        }, 2000);
    }
    
    // Rects (con margen) que Byteo nunca debe cubrir: el botón de WhatsApp,
    // la navbar y las CTAs del hero. Se recalculan en cada llamada (no se
    // cachean) porque su posición cambia con el scroll/resize.
    getProtectedRects() {
        const selectors = ['.whatsapp-float', '.navbar', '.cta-buttons'];
        const margin = 24;
        return selectors
            .map(selector => document.querySelector(selector)?.getBoundingClientRect())
            .filter(Boolean)
            .map(rect => ({
                left: rect.left - margin,
                top: rect.top - margin,
                right: rect.right + margin,
                bottom: rect.bottom + margin,
            }));
    }

    isPositionSafe(x, y) {
        const size = 80; // ancho/alto aproximado del robot con margen
        const target = { left: x, top: y, right: x + size, bottom: y + size };
        return this.getProtectedRects().every(rect =>
            target.right <= rect.left || target.left >= rect.right ||
            target.bottom <= rect.top || target.top >= rect.bottom
        );
    }

    // Reintenta un punto aleatorio hasta encontrar uno fuera de las zonas
    // protegidas; si 8 intentos no bastan (viewport muy pequeño/saturado),
    // cae al centro de la pantalla, que nunca está protegido.
    pickSafePoint(minX, maxX, minY, maxY) {
        for (let attempt = 0; attempt < 8; attempt += 1) {
            const x = minX + Math.random() * (maxX - minX);
            const y = minY + Math.random() * (maxY - minY);
            if (this.isPositionSafe(x, y)) return { x, y };
        }
        return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }

    generateWalkingPath() {
        this.walkingPath = [];
        const margin = 100;
        const maxX = window.innerWidth - margin;
        const maxY = window.innerHeight - margin;

        // Crear un recorrido aleatorio por diferentes puntos de la pantalla
        const numPoints = 8 + Math.floor(Math.random() * 5);

        for (let i = 0; i < numPoints; i++) {
            this.walkingPath.push(this.pickSafePoint(margin, maxX, margin, maxY));
        }

        // Agregar algunos puntos específicos interesantes
        const interestingPoints = [
            { x: window.innerWidth / 2, y: 100 }, // Centro arriba
            { x: 100, y: window.innerHeight / 2 }, // Izquierda
            { x: window.innerWidth - 100, y: window.innerHeight / 2 }, // Derecha
            { x: window.innerWidth / 2, y: window.innerHeight - 100 } // Centro abajo
        ].filter(point => this.isPositionSafe(point.x, point.y));

        // Mezclar algunos puntos interesantes (si queda alguno seguro)
        if (interestingPoints.length > 0) {
            const randomInteresting = interestingPoints[Math.floor(Math.random() * interestingPoints.length)];
            this.walkingPath.splice(Math.floor(this.walkingPath.length / 2), 0, randomInteresting);
        }
    }
    
    faceDirection(dx) {
        // Voltear a Byteo según la dirección
        if (dx < 0) {
            this.robot.style.transform = `scaleX(-1)`;
        } else {
            this.robot.style.transform = `scaleX(1)`;
        }
    }
    
    animateWalking() {
        // Animación de caminar
        this.robot.classList.add('walking');
    }
}

// Inicializar Byteo cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    // Esperar 2 segundos antes de aparecer
    setTimeout(() => {
        window.byteo = new Byteo();
        console.log('🤖 Byteo está listo para jugar!');
    }, 2000);
});
