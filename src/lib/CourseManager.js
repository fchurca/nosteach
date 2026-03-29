import { queryEvents } from './nostr.js';
import { KINDS, TAGS } from './constants.js';
import { formatPrice } from './ui-utils.js';
import { formatAuthorName } from './lightning.js';
import { validateCurso } from './schema.js';
import CourseView from '../components/CourseView.js';
import EvaluationList from '../components/EvaluationList.js';

class CourseManager {
  constructor(nostr, roles, options = {}) {
    this.nostr = nostr;
    this.roles = roles;
    this.onNavigate = options.onNavigate || (() => {});
    this.onViewCourse = options.onViewCourse || (() => {});
    this.onViewUserProfile = options.onViewUserProfile || (() => {});
    this.onPushBreadcrumb = options.onPushBreadcrumb || (() => {});
    this.waitForNostr = options.waitForNostr || (async () => {});
  }

  async listCourses(container) {
    const events = await queryEvents({ kinds: [KINDS.CURSO], '#t': [TAGS.PLATFORM] });
    const teacherProfiles = await this.fetchTeacherProfiles(events);
    this.renderCourseList(container, events, teacherProfiles);
  }

  async listMyCourses(container, myPubkey) {
    const events = await queryEvents({
      kinds: [KINDS.CURSO],
      authors: [myPubkey],
      '#t': [TAGS.PLATFORM]
    });
    this.renderMyCourses(container, events);
  }

  async getCourse(eventId, contentArea, isDirectAccess = true) {
    await this.waitForNostr();
    history.pushState(null, '', `#/c/${eventId}`);
    contentArea.innerHTML = '<div class="card"><div class="skeleton skeleton-box"></div><div class="skeleton skeleton-text"></div></div>';
    const events = await queryEvents({ kinds: [KINDS.CURSO], ids: [eventId] });
    if (events.length === 0) {
      contentArea.innerHTML = '<div class="card"><h2>❌ Curso no encontrado</h2></div>';
      return;
    }
    const course = events[0];
    const courseContent = typeof course.content === 'string' ? JSON.parse(course.content) : course.content;
    const courseTitle = courseContent.titulo || 'Sin título';
    this.onPushBreadcrumb(courseTitle, `window.app?.viewCourse('${eventId}', true)`);
    new CourseView(contentArea, course, this.nostr, this.roles, () => {
      this.onNavigate('courses');
    }, isDirectAccess);
  }

  async getResponses(courseId, contentArea) {
    await this.waitForNostr();
    history.pushState(null, '', `/#/c/${courseId}/r`);
    contentArea.innerHTML = '<div class="card"><div class="skeleton skeleton-box"></div><div class="skeleton skeleton-text"></div></div>';
    const events = await queryEvents({ kinds: [KINDS.CURSO], ids: [courseId] });
    if (events.length === 0) {
      contentArea.innerHTML = '<div class="card"><h2>❌ Curso no encontrado</h2></div>';
      return;
    }
    const course = events[0];
    const courseContent = typeof course.content === 'string' ? JSON.parse(course.content) : course.content;
    const courseTitle = courseContent.titulo || 'Curso';
    this.onPushBreadcrumb('Evaluaciones', `window.app?.navigateToResponses('${courseId}')`);
    new EvaluationList(contentArea, courseId, course, this.nostr, () => {
      this.onNavigate('my-courses');
    });
  }

  showCreateForm(contentArea) {
    contentArea.innerHTML = `
      <div class="card">
        <h2>✏️ Crear Nuevo Curso</h2>
        <p>Compartí tu conocimiento como curso en Nostr.</p>
        <form id="course-form">
          <div class="form-group">
            <label for="course-titulo">Título del curso</label>
            <input type="text" id="course-titulo" required>
          </div>
          
          <div class="form-group">
            <label for="course-descripcion">Descripción</label>
            <textarea id="course-descripcion" rows="3" required></textarea>
          </div>
          
          <div class="form-group">
            <label for="course-precio">Precio de la evaluación</label>
            <select id="course-precio">
              <option value="0">Gratis</option>
              <option value="21">21 sats</option>
              <option value="69">69 sats</option>
              <option value="210">210 sats</option>
              <option value="690">690 sats</option>
              <option value="2100">2,100 sats</option>
              <option value="custom">Custom...</option>
            </select>
          </div>
          
          <div id="custom-precio-container" class="form-group" style="display: none;">
            <label for="course-precio-custom">Monto personalizado (sats)</label>
            <input type="number" id="course-precio-custom" min="1">
          </div>

          <div id="modulos-container">
            <h3>Módulos</h3>
            <div class="modulo-item mb-20">
              <button type="button" class="btn-remove-item" onclick="this.parentElement.remove()">×</button>
              <div class="form-group">
                <label>Tipo de contenido</label>
                <select class="modulo-tipo">
                  <option value="texto">Texto</option>
                  <option value="enlace">Enlace</option>
                </select>
              </div>
              <div class="form-group">
                <label>Contenido</label>
                <input type="text" class="modulo-contenido" placeholder="Texto o URL del contenido">
              </div>
              <div class="form-group">
                <label>Título (opcional)</label>
                <input type="text" class="modulo-titulo" placeholder="Nombre del módulo">
              </div>
            </div>
          </div>
          <button type="button" onclick="window.courseManager?.addModulo()" class="btn-secondary">+ Agregar Módulo</button>

          <div id="evaluacion-container" class="mt-20">
            <h3>Evaluación</h3>
            <div id="preguntas-container">
              <div class="pregunta-item mb-20">
                <button type="button" class="btn-remove-item" onclick="this.parentElement.remove()">×</button>
                <div class="form-group">
                  <label>Pregunta</label>
                  <input type="text" class="pregunta-texto" placeholder="Escribí la pregunta">
                </div>
                <div class="form-group">
                  <label>Opciones (separadas por coma)</label>
                  <input type="text" class="pregunta-opciones" placeholder="Opción A, Opción B, Opción C">
                </div>
                <div class="form-group">
                  <label>Índice de respuesta correcta</label>
                  <input type="number" class="pregunta-correcta" placeholder="0" min="0">
                </div>
              </div>
            </div>
            <button type="button" onclick="window.courseManager?.addPregunta()" class="btn-secondary">+ Agregar Pregunta</button>
          </div>

          <button type="submit" class="mt-20">Publicar Curso</button>
        </form>
      </div>
    `;
    this.setupFormListeners();
  }

  setupFormListeners() {
    const form = document.getElementById('course-form');
    const precioSelect = document.getElementById('course-precio');
    const precioCustom = document.getElementById('course-precio-custom');
    const customContainer = document.getElementById('custom-precio-container');

    if (precioSelect && customContainer) {
      precioSelect.addEventListener('change', () => {
        customContainer.style.display = precioSelect.value === 'custom' ? 'block' : 'none';
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.publish();
      });
    }
  }

  addModulo() {
    const container = document.getElementById('modulos-container');
    if (container) {
      const div = document.createElement('div');
      div.className = 'modulo-item mb-20';
      div.innerHTML = `
        <button type="button" class="btn-remove-item" onclick="this.parentElement.remove()">×</button>
        <div class="form-group">
          <label>Tipo de contenido</label>
          <select class="modulo-tipo">
            <option value="texto">Texto</option>
            <option value="enlace">Enlace</option>
          </select>
        </div>
        <div class="form-group">
          <label>Contenido</label>
          <input type="text" class="modulo-contenido" placeholder="Texto o URL del contenido">
        </div>
        <div class="form-group">
          <label>Título (opcional)</label>
          <input type="text" class="modulo-titulo" placeholder="Nombre del módulo">
        </div>
      `;
      container.appendChild(div);
    }
  }

  addPregunta() {
    const container = document.getElementById('preguntas-container');
    if (container) {
      const div = document.createElement('div');
      div.className = 'pregunta-item mb-20';
      div.innerHTML = `
        <button type="button" class="btn-remove-item" onclick="this.parentElement.remove()">×</button>
        <div class="form-group">
          <label>Pregunta</label>
          <input type="text" class="pregunta-texto" placeholder="Escribí la pregunta">
        </div>
        <div class="form-group">
          <label>Opciones (separadas por coma)</label>
          <input type="text" class="pregunta-opciones" placeholder="Opción A, Opción B, Opción C">
        </div>
        <div class="form-group">
          <label>Índice de respuesta correcta</label>
          <input type="number" class="pregunta-correcta" placeholder="0" min="0">
        </div>
      `;
      container.appendChild(div);
    }
  }

  async publish() {
    if (!this.nostr) {
      window.toast?.warning('Primero conectá tu identidad Nostr');
      return;
    }

    if (!this.roles.teacher) {
      window.toast?.warning('Solo los profesores pueden crear cursos');
      return;
    }

    const titulo = document.getElementById('course-titulo')?.value;
    const descripcion = document.getElementById('course-descripcion')?.value;
    const precioSelect = document.getElementById('course-precio')?.value;
    const precioCustom = document.getElementById('course-precio-custom')?.value;

    let precio = precioSelect === 'custom' ? parseInt(precioCustom) : parseInt(precioSelect);
    if (precioSelect === 'custom' && isNaN(precio)) {
      precio = 0;
    }

    const moduloItems = document.querySelectorAll('.modulo-item');
    const modulos = [];
    moduloItems.forEach(item => {
      const tipo = item.querySelector('.modulo-tipo')?.value;
      const contenido = item.querySelector('.modulo-contenido')?.value;
      const tituloMod = item.querySelector('.modulo-titulo')?.value;
      modulos.push({ tipo, contenido, titulo: tituloMod || undefined });
    });

    const preguntaItems = document.querySelectorAll('.pregunta-item');
    const preguntas = [];
    preguntaItems.forEach(item => {
      const texto = item.querySelector('.pregunta-texto')?.value;
      const opciones = item.querySelector('.pregunta-opciones')?.value.split(',').map(s => s.trim());
      const correcta = parseInt(item.querySelector('.pregunta-correcta')?.value);
      preguntas.push({ pregunta: texto, opciones, correcta });
    });

    const curso = {
      titulo,
      descripcion,
      precio,
      modulos,
      evaluacion: { preguntas }
    };

    const validation = validateCurso(curso);
    if (!validation.valid) {
      window.toast?.error('Errores en el formulario:\n• ' + validation.errors.join('\n• '));
      return;
    }

    const id = `nosteach-curso-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tags = [
      ['d', id],
      ['t', TAGS.PLATFORM],
      ['t', TAGS.CURSO]
    ];

    try {
      const event = await this.nostr.publish(KINDS.CURSO, curso, tags);
      window.toast?.success(`¡Curso publicado! ID: ${event.id.slice(0, 16)}...`);
      this.onNavigate('courses');
    } catch (err) {
      window.toast?.error('Error al publicar: ' + err.message);
    }
  }

  async fetchTeacherProfiles(events) {
    const pubkeys = [...new Set(events.map(e => e.pubkey))];
    const profiles = {};
    
    try {
      const profilePromises = pubkeys.map(async (pubkey) => {
        try {
          const events = await queryEvents({ kinds: [0], authors: [pubkey], limit: 1 });
          if (events.length > 0) {
            const content = JSON.parse(events[0].content);
            return { pubkey, name: content.display_name || content.name };
          }
        } catch (e) {}
        return { pubkey, name: null };
      });
      
      const results = await Promise.all(profilePromises);
      results.forEach(r => { profiles[r.pubkey] = r.name; });
    } catch (err) {
      console.warn('Error fetching teacher profiles:', err.message);
    }
    
    return profiles;
  }

  renderCourseList(container, events, teacherProfiles = {}) {
    if (!container) return;

    if (events.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📚</div>
          <p class="empty-state-title">No hay cursos publicados aún</p>
          <p class="empty-state-text">¡Sé el primero en compartir tu conocimiento!</p>
          ${this.roles.teacher ? `
            <button onclick="window.app?.navigate('create-course')" class="btn-secondary" style="margin-top: 15px;">
              Crear mi primer curso
            </button>
          ` : ''}
        </div>
      `;
      return;
    }

    container.innerHTML = events.map(event => {
      try {
        const content = typeof event.content === 'string' ? JSON.parse(event.content) : event.content;
        const precio = content.precio || 0;
        const precioText = formatPrice(precio);
        const preguntas = (content.evaluacion?.preguntas || []).length;
        const teacherName = teacherProfiles[event.pubkey];
        const displayName = formatAuthorName(teacherName, event.pubkey);
        
        return `
          <div class="course-card" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 20px; margin-bottom: 15px;">
            <h3 style="margin-bottom: 5px;">
              <a href="#/c/${event.id}" onclick="event.preventDefault(); window.app?.viewCourse('${event.id}', false); return false;" style="color: inherit; text-decoration: none;">
                ${content.titulo || 'Sin título'}
              </a>
            </h3>
            <div style="font-size: 0.8rem; color: rgba(255,255,255,0.4); margin-bottom: 10px;">
              <a href="#" onclick="event.preventDefault(); window.app?.viewUserProfile('${event.pubkey}');" class="teacher-link">${displayName}</a>
            </div>
            <p style="color: rgba(255,255,255,0.7); margin-bottom: 10px;">${content.descripcion || ''}</p>
            <div style="display: flex; gap: 15px; font-size: 0.9rem;">
              <span style="color: #00ff9d;">💰 ${precioText}</span>
              <span>📚 ${(content.modulos || []).length} módulos</span>
              <span>❓ ${preguntas} preguntas</span>
            </div>
            <div style="margin-top: 15px; display: flex; gap: 10px;">
              <button onclick="window.app?.viewCourse('${event.id}', false)" class="btn-secondary">Ver más</button>
              ${this.roles.student ? '<button onclick="window.app?.enrollCourse(\'' + event.id + '\')">Inscribirse</button>' : ''}
            </div>
          </div>
        `;
      } catch (err) {
        console.warn('Error parsing course:', err);
        return '';
      }
    }).join('');
  }

  renderMyCourses(container, events) {
    if (!container) return;
    
    if (events.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📝</div>
          <p class="empty-state-title">Aún no publicaste cursos</p>
          <p class="empty-state-text">Compartí tu conocimiento con la comunidad</p>
          <button onclick="window.app?.navigate('create-course')" class="btn-secondary" style="margin-top: 15px;">
            Crear mi primer curso
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = events.map(event => {
      const content = typeof event.content === 'string' ? JSON.parse(event.content) : event.content;
      const precio = content.precio || 0;
      const precioText = formatPrice(precio);
      const modulos = (content.modulos || []).length;
      const preguntas = (content.evaluacion?.preguntas || []).length;

      return `
        <div class="course-card" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 20px; margin-bottom: 15px;">
          <h3 style="margin-bottom: 5px;">
            <a href="#/c/${event.id}" onclick="event.preventDefault(); window.app?.navigateToCourse('${event.id}'); return false;" style="color: inherit; text-decoration: none;">
              ${content.titulo || 'Sin título'}
            </a>
          </h3>
          <div style="display: flex; gap: 15px; font-size: 0.9rem; margin-bottom: 10px;">
            <span style="color: #00ff9d;">💰 ${precioText}</span>
            <span>📚 ${modulos} módulos</span>
            <span>❓ ${preguntas} preguntas</span>
          </div>
          <p style="color: rgba(255,255,255,0.7); margin-bottom: 15px;">${content.descripcion || ''}</p>
          <div style="display: flex; gap: 10px;">
            <button onclick="window.app?.navigateToCourse('${event.id}')" class="btn-secondary">Ver Curso</button>
            ${preguntas > 0 ? `
              <button onclick="window.app?.navigateToResponses('${event.id}')" class="btn-secondary">Ver Respuestas</button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }
}

export default CourseManager;
