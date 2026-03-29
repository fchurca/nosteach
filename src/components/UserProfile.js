import { formatAuthorName, getLud16, ZAP_AMOUNTS } from '../lib/lightning.js';
import ZapModal from './ZapModal.js';
import { DEBUG } from '../lib/constants.js';
import { queryEvents } from '../lib/nostr.js';
import { formatPrice } from '../lib/ui-utils.js';
import { nip19 } from 'nostr-tools';

class UserProfile {
  constructor(container, pubkey, nostr) {
    this.container = container;
    this.pubkey = pubkey;
    this.nostr = nostr;
    this.profile = null;
    this.courses = [];
    this.zapModal = null;
  }

  async load() {
    if (!this.nostr || !this.pubkey) return;

    try {
      const [profileEvents, courseEvents] = await Promise.all([
        queryEvents({
          kinds: [0],
          authors: [this.pubkey],
          limit: 1
        }),
        queryEvents({
          kinds: [30078],
          authors: [this.pubkey],
          '#t': ['nosteach']
        })
      ]);

      if (profileEvents.length > 0) {
        this.profile = JSON.parse(profileEvents[0].content);
      }

      this.courses = courseEvents;
    } catch (err) {
      console.warn('Error loading teacher profile:', err);
    }
  }

  render() {
    if (!this.container) return;

    const displayName = formatAuthorName(
      this.profile?.display_name || this.profile?.name,
      this.pubkey
    );
    const lud16 = getLud16(this.profile);
    const npub = nip19.npubEncode(this.pubkey);

    this.container.innerHTML = `
      <div class="card">
        <div class="teacher-profile-header">
          <h2>👤 ${displayName}</h2>
          <p style="color: var(--text-muted); margin-top: 5px; font-size: 0.75rem; font-family: monospace;">
            npub: ${npub}
          </p>
          <p style="color: var(--text-muted); margin-top: 2px; font-size: 0.75rem; font-family: monospace;">
            hex: ${this.pubkey}
          </p>
          ${lud16 ? `
            <div class="teacher-lightning">
              <span class="lightning-label">⚡ Lightning:</span>
              <code class="lightning-address">${lud16}</code>
            </div>
          ` : `
            <div class="teacher-no-lightning">
              <span>⚠️ Sin Lightning configurado</span>
            </div>
          `}
        </div>

        ${lud16 ? `
          <div class="teacher-zap-section">
            <button id="zap-teacher-btn" class="btn-primary" style="width: 100%;">
              Apoyar con sats
            </button>
          </div>
        ` : ''}
      </div>

      <div class="card" style="margin-top: 20px;">
        <h3>📚 Cursos Publicados (${this.courses.length})</h3>
        <div id="teacher-courses-list">
          ${this.courses.length === 0 ? `
            <p class="empty-text">No hay cursos publicados aún.</p>
          ` : this.courses.map(course => this.renderCourseCard(course)).join('')}
        </div>
      </div>
    `;

    this.attachListeners();
  }

  renderCourseCard(course) {
    try {
      const content = typeof course.content === 'string' 
        ? JSON.parse(course.content) 
        : course.content;
      const precio = content.precio || 0;
      const precioText = formatPrice(precio);
      const preguntas = (content.evaluacion?.preguntas || []).length;
      const modulos = (content.modulos || []).length;

      return `
        <div class="course-card" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 15px; margin-bottom: 10px;">
          <h4 style="margin-bottom: 5px;">${content.titulo || 'Sin título'}</h4>
          <p style="color: rgba(255,255,255,0.7); font-size: 0.9rem; margin-bottom: 10px;">
            ${content.descripcion || ''}
          </p>
          <div style="display: flex; gap: 15px; font-size: 0.85rem;">
            <span style="color: #00ff9d;">💰 ${precioText}</span>
            <span>📚 ${modulos} módulos</span>
            <span>❓ ${preguntas} preguntas</span>
          </div>
          <button onclick="window.app?.viewCourse('${course.id}')" class="btn-secondary" style="margin-top: 10px;">
            Ver Curso
          </button>
        </div>
      `;
    } catch (err) {
      return '';
    }
  }

  attachListeners() {
    const zapBtn = document.getElementById('zap-teacher-btn');
    
    if (zapBtn) {
      zapBtn.addEventListener('click', () => this.openZapModal());
    }
  }

  openZapModal() {
    const lud16 = getLud16(this.profile);
    if (!lud16) return;

    const displayName = this.profile?.display_name || this.profile?.name || 'Profesor';

    this.zapModal = new ZapModal({
      recipientPubkey: this.pubkey,
      recipientName: displayName,
      recipientLud16: lud16,
      amounts: ZAP_AMOUNTS,
      customMax: 10000,
      onSuccess: (result, amount) => {
        if (DEBUG) console.log('Zap exitoso:', result);
      },
      onError: (err) => {
        console.error('Error en zap:', err);
      }
    });

    this.zapModal.show();
  }

  destroy() {
    if (this.zapModal) {
      this.zapModal.destroy();
    }
  }
}

export default UserProfile;
