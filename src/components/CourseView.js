import ZapButton from './ZapButton.js';
import { fetchProfile, getLud16, isWebLNAvailable, formatAuthorName } from '../lib/lightning.js';
import InvoiceModal from './InvoiceModal.js';
import { DEBUG, TAGS } from '../lib/constants.js';
import { queryEvents } from '../lib/nostr.js';
import { nip19 } from 'nostr-tools';

class CourseView {
  constructor(container, course, nostr, roles, onBack, isDirectAccess = false) {
    this.container = container;
    this.course = course;
    this.nostr = nostr;
    this.roles = roles || this.loadRoles();
    this.onBack = onBack;
    this.isDirectAccess = isDirectAccess;
    this.teacherProfile = null;
    this.hasPaidForExam = false;
    this.render();
    this.fetchTeacherProfile();
  }

  loadRoles() {
    try {
      const saved = localStorage.getItem('nosteach_roles');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (err) {}
    return { teacher: false, student: false, sponsor: false };
  }

  render() {
    if (!this.container) return;

    const content = typeof this.course.content === 'string' 
      ? JSON.parse(this.course.content) 
      : this.course.content;

    const precio = content.precio || 0;
    const precioText = precio === 0 ? 'Gratis' : `${precio} sats`;
    const modulos = content.modulos || [];
    const preguntas = content.evaluacion?.preguntas || [];
    const isTeacher = this.course.pubkey === window.app?.nostr?.currentPubkey;
    const showExamButton = this.roles.student || isTeacher;

    this.container.innerHTML = `
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px;">
          <div>
            <h2 style="margin: 0;">${content.titulo || 'Sin título'}</h2>
            <p style="color: var(--text-muted); margin-top: 5px;">
              Profesor: <a href="#/p/${this.course.pubkey}" id="teacher-name" class="teacher-link" style="color: var(--accent);">${this.course.pubkey.slice(0, 8)}...${this.course.pubkey.slice(-8)}</a>
            </p>
            <p style="color: var(--text-muted); margin-top: 5px; font-size: 0.75rem; font-family: monospace;">
              ID: ${this.course.id}
            </p>
            <p style="color: var(--text-muted); margin-top: 2px; font-size: 0.75rem; font-family: monospace;">
              nevent: ${nip19.neventEncode({ id: this.course.id })}
            </p>
          </div>
          <div style="text-align: right;">
            <span style="font-size: 1.5rem; color: #00ff9d;">💰 ${precioText}</span>
          </div>
        </div>

        <div style="margin-bottom: 20px;">
          <h3>Descripción</h3>
          <p>${content.descripcion || ''}</p>
        </div>

        ${modulos.length > 0 ? `
          <div style="margin-bottom: 20px;">
            <h3>📚 Módulos (${modulos.length})</h3>
            ${modulos.map((modulo, i) => `
              <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                <strong>${modulo.titulo || `Módulo ${i + 1}`}</strong>
                ${modulo.tipo === 'texto' ? `<p style="margin-top: 10px;">${modulo.contenido}</p>` : ''}
                ${modulo.tipo === 'enlace' ? `<a href="${modulo.contenido}" target="_blank" style="color: #00ff9d;">${modulo.titulo || modulo.contenido}</a>` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${preguntas.length > 0 ? `
          <div style="margin-bottom: 20px;">
            <h3>❓ Evaluación (${preguntas.length} preguntas)</h3>
            ${showExamButton ? `
              <div id="exam-section">
                ${precio > 0 && !this.hasPaidForExam && this.roles.student ? `
                  <div class="unlock-message">
                    <h4>Evaluación pago</h4>
                    <p>Esta evaluación cuesta ${precio} sats para enviar tus respuestas.</p>
                    <button id="pay-exam-btn" class="btn-primary">
                      Pagar y Tomar Evaluación
                    </button>
                  </div>
                ` : `
                  <button id="start-evaluation-btn" class="btn-secondary" style="margin-top: 10px;">
                    ${isTeacher ? 'Ver Respuestas' : 'Tomar Evaluación'}
                  </button>
                `}
              </div>
            ` : `
              <p style="color: var(--text-muted);">Este curso no tiene evaluación.</p>
            `}
          </div>
        ` : ''}

        ${this.roles.sponsor || true ? `
          <div style="margin-top: 20px; padding: 15px; background: rgba(255,215,0,0.1); border-radius: 8px;">
            <h3>💰 Patrocinar al Profesor</h3>
            <p>Apoyá al docente con un zap.</p>
            <div id="zap-button-container"></div>
          </div>
        ` : ''}

        ${isTeacher ? `
          <div style="margin-top: 20px; padding: 15px; background: rgba(0,255,157,0.1); border-radius: 8px;">
            <h3>📊 Dashboard</h3>
            <button id="view-responses-btn" class="btn-secondary">
              Ver Respuestas de Alumnos
            </button>
          </div>
        ` : ''}
      </div>

      <div id="evaluation-container" style="display: none;"></div>
    `;

    this.attachListeners();
  }

  async initZapButton() {
    const zapContainer = document.getElementById('zap-button-container');
    if (!zapContainer) return;

    if (DEBUG) console.log('[CourseView] initZapButton, teacherProfile:', this.teacherProfile);
    
    const teacherLud16 = this.teacherProfile?.lud16 || this.teacherProfile?.lnurl || null;
    if (DEBUG) console.log('[CourseView] teacherLud16:', teacherLud16);

    const zapBtn = new ZapButton({
      recipientPubkey: this.course.pubkey,
      recipientName: this.teacherProfile?.display_name || this.teacherProfile?.name || 'Profesor',
      recipientLud16: teacherLud16,
      amounts: [21, 69, 210, 690],
      customMax: 10000,
      onSuccess: (result, amount) => {
        if (DEBUG) console.log('Zap exitoso:', result);
      },
      onError: (err, amount) => {
        console.error('Error en zap:', err);
      }
    });

    await zapBtn.mount(zapContainer);
    this.zapButton = zapBtn;
  }

  async fetchTeacherProfile() {
    if (!this.nostr || !this.course.pubkey) return;
    
    try {
      const events = await queryEvents({
        kinds: [0],
        authors: [this.course.pubkey],
        limit: 1
      });
      
      if (events.length > 0) {
        const content = JSON.parse(events[0].content);
        this.teacherProfile = content;
        this.updateTeacherDisplay();
        if (DEBUG) console.log('[CourseView] Teacher profile loaded:', this.teacherProfile?.lud16);
        this.initZapButton();
      }
    } catch (err) {
      console.warn('Could not fetch teacher profile:', err.message);
    }
  }

  updateTeacherDisplay() {
    const teacherEl = document.getElementById('teacher-name');
    if (teacherEl) {
      const name = this.teacherProfile?.display_name || this.teacherProfile?.name;
      const pubkey = this.course.pubkey;
      teacherEl.textContent = formatAuthorName(name, pubkey);
    }
  }

  attachListeners() {
    const evalBtn = document.getElementById('start-evaluation-btn');
    const payExamBtn = document.getElementById('pay-exam-btn');
    const viewResponsesBtn = document.getElementById('view-responses-btn');
    const teacherLink = document.getElementById('teacher-name');

    if (evalBtn) {
      evalBtn.addEventListener('click', () => this.startEvaluation());
    }

    if (payExamBtn) {
      payExamBtn.addEventListener('click', () => this.payForExam());
    }

    if (viewResponsesBtn) {
      viewResponsesBtn.addEventListener('click', () => this.viewResponses());
    }

    if (teacherLink) {
      teacherLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.app) {
          window.app.viewUserProfile(this.course.pubkey);
        }
      });
    }
  }

  async payForExam() {
    const content = typeof this.course.content === 'string' 
      ? JSON.parse(this.course.content) 
      : this.course.content;
    const precio = content.precio || 0;

    if (!this.teacherProfile) {
      await this.fetchTeacherProfile();
    }

    const lud16 = getLud16(this.teacherProfile);

    if (!lud16) {
      window.toast?.warning('El profesor no tiene Lightning configurado. No podés pagar para enviar tu evaluación.');
      return;
    }

    if (!isWebLNAvailable()) {
      window.toast?.warning('Necesitás instalar Alby u otra wallet WebLN para pagar.');
      return;
    }

    const modal = new InvoiceModal({
      amount: precio,
      description: `Evaluación: ${content.titulo}`,
      lud16: lud16,
      recipientPubkey: this.course.pubkey,
      onSuccess: (result) => {
        this.hasPaidForExam = true;
        this.updateExamSection();
        this.startEvaluation();
      },
      onError: (err) => {
        console.error('Error en pago:', err);
      }
    });

    modal.show();
    this.invoiceModal = modal;
  }

  updateExamSection() {
    const examSection = document.getElementById('exam-section');
    if (examSection) {
      examSection.innerHTML = `
        <button id="start-evaluation-btn" class="btn-secondary" style="margin-top: 10px;">
          Tomar Evaluación
        </button>
      `;
      const evalBtn = document.getElementById('start-evaluation-btn');
      if (evalBtn) {
        evalBtn.addEventListener('click', () => this.startEvaluation());
      }
    }
  }

  startEvaluation() {
    const evalContainer = document.getElementById('evaluation-container');
    if (!evalContainer) return;

    const content = typeof this.course.content === 'string' 
      ? JSON.parse(this.course.content) 
      : this.course.content;
    const preguntas = content.evaluacion?.preguntas || [];
    const isTeacher = this.course.pubkey === window.app?.nostr?.currentPubkey;

    if (isTeacher) {
      this.viewResponses();
      return;
    }

    evalContainer.style.display = 'block';
    evalContainer.innerHTML = `
      <div class="card">
        <h3>📝 Evaluación</h3>
        <form id="evaluation-form">
          ${preguntas.map((preg, i) => `
            <div style="margin-bottom: 20px; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 8px;">
              <p style="font-weight: bold; margin-bottom: 10px;">${i + 1}. ${preg.pregunta}</p>
              ${preg.opciones.map((opc, j) => `
                <label style="display: block; margin-bottom: 5px; cursor: pointer;">
                  <input type="radio" name="preg-${i}" value="${j}" required>
                  ${opc}
                </label>
              `).join('')}
            </div>
          `).join('')}

          <button type="submit" class="btn-secondary">Enviar Respuestas</button>
        </form>
      </div>
    `;

    const form = document.getElementById('evaluation-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.submitEvaluation(preguntas);
      });
    }
  }

  async submitEvaluation(preguntas) {
    const respuestas = [];

    for (let i = 0; i < preguntas.length; i++) {
      const selected = document.querySelector(`input[name="preg-${i}"]:checked`);
      if (selected) {
        respuestas.push(parseInt(selected.value));
      } else {
        window.toast?.warning(`Por favor respondé la pregunta ${i + 1}`);
        return;
      }
    }

    const evaluacion = {
      respuestas,
      timestamp: Date.now()
    };

    const tags = [
      ['e', this.course.id],
      ['p', this.course.pubkey],
      ['t', TAGS.EVALUACION]
    ];

    try {
      const event = await this.nostr.publish(1, evaluacion, tags);
      
      const evalContainer = document.getElementById('evaluation-container');
      if (evalContainer) {
        evalContainer.innerHTML = `
          <div class="card" style="background: rgba(0,255,157,0.1);">
            <h3>✅ Evaluación Enviada</h3>
            <p>Tu evaluación fue publicada en Nostr.</p>
            <p>El profesor podrá ver tus respuestas.</p>
          </div>
        `;
      }
    } catch (err) {
      window.toast?.error('Error al enviar evaluación: ' + err.message);
    }
  }

  async viewResponses() {
    if (window.app) {
      window.app.navigateToResponses(this.course.id, this.course);
    }
  }

  destroy() {
    if (this.zapButton) {
      this.zapButton.destroy();
    }
    if (this.invoiceModal) {
      this.invoiceModal.destroy();
    }
  }
}

export default CourseView;
