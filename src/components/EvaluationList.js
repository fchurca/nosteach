import ZapButton from './ZapButton.js';
import InvoiceModal from './InvoiceModal.js';
import { fetchProfile, getLud16, isWebLNAvailable } from '../lib/lightning.js';

class EvaluationList {
  constructor(container, courseId, course, nostr, onBack) {
    this.container = container;
    this.courseId = courseId;
    this.course = course;
    this.nostr = nostr;
    this.onBack = onBack;
    this.responses = [];
    this.profiles = {};
    this.courseContent = typeof course.content === 'string' 
      ? JSON.parse(course.content) 
      : course.content;
    this.preguntas = this.courseContent.evaluacion?.preguntas || [];
    
    this.render();
    this.loadResponses();
  }

  render() {
    if (!this.container) return;

    const courseTitle = this.courseContent.titulo || 'Curso';

    this.container.innerHTML = `
      <div class="card">
        <nav class="breadcrumb" style="margin-bottom: 15px; font-size: 0.9rem; color: var(--text-muted);">
          <a href="#" onclick="window.app?.navigate('home'); return false;" style="color: var(--accent);">Inicio</a>
          <span style="margin: 0 8px;">›</span>
          <a href="#" onclick="window.app?.navigate('courses'); return false;" style="color: var(--accent);">Explorar</a>
          <span style="margin: 0 8px;">›</span>
          <a href="#" onclick="window.app?.navigateToCourse('${this.courseId}'); return false;" style="color: var(--accent);">${courseTitle}</a>
          <span style="margin: 0 8px;">›</span>
          <span>Evaluaciones</span>
        </nav>

        <button onclick="window.app?.navigateToCourse('${this.courseId}')" class="btn-secondary" style="margin-bottom: 15px;">
          ← Volver al curso
        </button>

        <h2>📊 Respuestas de Evaluación</h2>
        <p style="color: var(--text-muted); margin-bottom: 20px;">
          Curso: ${courseTitle}
        </p>

        <div id="responses-container">
          <div class="invoice-loading">
            <div class="spinner"></div>
            <p>Cargando respuestas...</p>
          </div>
        </div>
      </div>
    `;
  }

  async loadResponses() {
    try {
      const events = await this.nostr.query({
        kinds: [1],
        '#e': [this.courseId],
        '#t': ['nosteach-evaluacion']
      });

      this.responses = events.filter(e => {
        try {
          const content = JSON.parse(e.content);
          return content.respuestas && Array.isArray(content.respuestas);
        } catch {
          return false;
        }
      });

      await this.loadProfiles();
      this.renderResponses();
    } catch (err) {
      console.error('Error loading responses:', err);
      this.showError('Error al cargar respuestas: ' + err.message);
    }
  }

  async loadProfiles() {
    const pubkeys = [...new Set(this.responses.map(e => e.pubkey))];
    
    for (const pubkey of pubkeys) {
      if (!this.profiles[pubkey]) {
        const profile = await fetchProfile(pubkey);
        this.profiles[pubkey] = profile;
      }
    }
  }

  renderResponses() {
    const container = document.getElementById('responses-container');
    if (!container) return;

    if (this.responses.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 40px;">
          <p style="font-size: 3rem; margin-bottom: 15px;">📭</p>
          <p style="color: var(--text-muted);">Aún no hay respuestas de alumnos.</p>
          <p style="color: var(--text-muted); font-size: 0.9rem;">
            Las respuestas aparecerán aquí cuando los alumnos envíen sus evaluaciones.
          </p>
        </div>
      `;
      return;
    }

    const sortedResponses = [...this.responses].sort((a, b) => b.created_at - a.created_at);

    container.innerHTML = sortedResponses.map(event => {
      const content = JSON.parse(event.content);
      const profile = this.profiles[event.pubkey];
      const name = profile?.display_name || profile?.name || event.pubkey.slice(0, 8);
      const avatarInitial = name.charAt(0).toUpperCase();
      const respuestas = content.respuestas || [];
      const timestamp = new Date(content.timestamp || event.created_at * 1000);
      const timeAgo = this.formatTimeAgo(timestamp);

      const respuestasHtml = respuestas.map((resp, i) => {
        const pregunta = this.preguntas[i];
        const respuestaTexto = pregunta?.opciones?.[resp] || `Opción ${resp}`;
        const esCorrecta = pregunta?.correcta === resp;
        const icono = esCorrecta ? '✅' : '❌';
        return `
          <div class="evaluation-answer">
            <span class="evaluation-answer-number">P${i + 1}:</span>
            ${respuestaTexto} ${icono}
          </div>
        `;
      }).join('');

      return `
        <div class="evaluation-item" data-pubkey="${event.pubkey}">
          <div class="evaluation-item-header">
            <div class="evaluation-student">
              <div class="evaluation-student-avatar">${avatarInitial}</div>
              <div>
                <div class="evaluation-student-name">${name}</div>
                <div class="evaluation-student-pubkey">${event.pubkey.slice(0, 16)}...</div>
              </div>
            </div>
            <div class="evaluation-actions">
              <button class="btn-zap-small btn-secondary" data-student="${event.pubkey}">
                💜 Premiar
              </button>
            </div>
          </div>
          <div class="evaluation-answers">
            ${respuestasHtml}
          </div>
          <div class="evaluation-timestamp">
            Enviado ${timeAgo}
          </div>
        </div>
      `;
    }).join('');

    this.attachListeners();
  }

  attachListeners() {
    const rewardBtns = this.container.querySelectorAll('[data-student]');
    
    rewardBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const studentPubkey = btn.dataset.student;
        this.rewardStudent(studentPubkey);
      });
    });
  }

  async rewardStudent(studentPubkey) {
    const profile = this.profiles[studentPubkey];
    const lud16 = getLud16(profile);
    const studentName = profile?.display_name || profile?.name || studentPubkey.slice(0, 8);

    if (!lud16) {
      window.toast?.warning(`${studentName} no tiene Lightning configurado. No podés enviarle un premio.`);
      return;
    }

    if (!isWebLNAvailable()) {
      window.toast?.warning('Necesitás instalar Alby u otra wallet WebLN para enviar premios.');
      return;
    }

    const courseTitle = this.courseContent.titulo || 'este curso';
    
    const modal = new InvoiceModal({
      amount: 21,
      description: `Premio por aprobar: ${courseTitle}`,
      lud16: lud16,
      recipientPubkey: this.course.pubkey,
      onSuccess: (result) => {
        window.toast?.success(`¡Premio de 21 sats enviado a ${studentName}!`);
      },
      onError: (err) => {
        console.error('Error enviando premio:', err);
      }
    });

    modal.show();
  }

  formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'hace un momento';
    if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} minutos`;
    if (seconds < 86400) return `hace ${Math.floor(seconds / 3600)} horas`;
    if (seconds < 604800) return `hace ${Math.floor(seconds / 86400)} días`;
    
    return date.toLocaleDateString('es-AR');
  }

  showError(message) {
    const container = document.getElementById('responses-container');
    if (!container) return;

    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 40px;">
        <p style="font-size: 3rem; margin-bottom: 15px;">❌</p>
        <p style="color: var(--error);">${message}</p>
        <button onclick="window.evaluationList?.loadResponses()" class="btn-secondary" style="margin-top: 15px;">
          Reintentar
        </button>
      </div>
    `;
  }

  destroy() {
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

export default EvaluationList;
