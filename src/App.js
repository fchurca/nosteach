import UserMenu from './components/UserMenu.js';
import RoleSelector, { ROLES_KEY } from './components/RoleSelector.js';
import CourseView from './components/CourseView.js';
import UserProfile from './components/UserProfile.js';
import EvaluationList from './components/EvaluationList.js';
import { validateCurso } from './lib/schema.js';
import { formatAuthorName } from './lib/lightning.js';
import { nip19 } from 'nostr-tools';
import { DEBUG } from './lib/constants.js';
import { onConnectionStatusChange, getConnectionStatus, queryEvents, getNDK } from './lib/nostr.js';

class App {
  constructor() {
    this.pubkey = null;
    this.nostr = null;
    this.roles = { teacher: false, student: false, sponsor: false };
    this.roleSelector = null;
    this.userMenu = null;
    this.currentView = 'home';
    this.breadcrumbHistory = [];
    this.initNostrReadOnly();
    this.init();
  }

  async initNostrReadOnly() {
    try {
      const { initNDK, connect } = await import('./lib/nostr.js');
      initNDK();
      await connect();
      const { getNDK } = await import('./lib/nostr.js');
      this.nostr = getNDK();
    } catch (err) {
      console.warn('Error inicializando Nostr:', err.message);
    }
  }

  async init() {
    this.checkStoredSession();
    this.render();
    this.initHashRouting();
    this.initConnectionStatus();
  }

  async waitForNostr(timeout = 10000) {
    if (this.nostr) return;
    
    const start = Date.now();
    while (!this.nostr) {
      if (Date.now() - start > timeout) {
        throw new Error('Timeout esperando conexión Nostr');
      }
      await new Promise(r => setTimeout(r, 100));
    }
  }

  initConnectionStatus() {
    const statusEl = document.getElementById('connection-status');
    if (!statusEl) return;
    
    const updateUI = (status) => {
      const dot = statusEl.querySelector('.status-dot');
      const text = statusEl.querySelector('.status-text');
      if (!dot || !text) return;
      
      statusEl.style.display = 'flex';
      if (status === 'connected' || status === 'idle') {
        statusEl.style.display = 'none';
      } else if (status === 'disconnected') {
        dot.style.background = '#ff4444';
        text.textContent = 'Sin conexión';
      } else if (status === 'error') {
        dot.style.background = '#ffaa00';
        text.textContent = 'Reconectando...';
      }
    };
    
    updateUI(getConnectionStatus());
    this.connectionStatusUnsubscribe = onConnectionStatusChange(updateUI);
  }

  initHashRouting() {
    const handleHash = async () => {
      const hash = window.location.hash;
      
      const isHome = !hash || hash === '' || hash === '#' || hash === '#/' || hash === '#/home' || hash === '#/home/';
      
      if (isHome) {
        history.pushState(null, '', '/');
        this.breadcrumbHistory = [];
        this.renderBreadcrumb();
        this.showHome();
        return;
      }
      
      if (hash === '#/courses' || hash === '#/c' || hash === '#/c/') {
        this.navigate('courses');
        return;
      }
      
      if (hash.startsWith('#/c/')) {
        const eventId = hash.slice(4);
        this.breadcrumbHistory = [
          { label: 'Cursos', onclickCode: 'window.app?.navigate(\'courses\')' }
        ];
        this.renderBreadcrumb();
        await this.viewCourse(eventId);
      } else if (hash === '#/p' || hash === '#/p/') {
        if (this.pubkey) {
          this.navigate('account');
        } else {
          history.pushState(null, '', '/');
          this.navigate('home');
        }
      } else if (hash.startsWith('#/p/')) {
        const npub = hash.slice(4);
        try {
          const decoded = nip19.decode(npub);
          if (decoded && decoded.type === 'npub') {
            this.breadcrumbHistory = [];
            this.renderBreadcrumb();
            await this.viewUserProfile(decoded.data);
          }
        } catch (err) {
          console.warn('Invalid npub in hash:', err.message);
        }
      } else if (hash.startsWith('#/c/') && hash.includes('/r')) {
        const parts = hash.slice(4).split('/');
        const courseId = parts[0];
        this.breadcrumbHistory = [
          { label: 'Cursos', onclickCode: 'window.app?.navigate(\'courses\')' }
        ];
        this.renderBreadcrumb();
        await this.navigateToResponses(courseId);
      }
    };

    window.addEventListener('hashchange', handleHash);
    handleHash();
  }

  pushBreadcrumb(label, onclickCode) {
    this.breadcrumbHistory.push({ label, onclickCode });
    this.renderBreadcrumb();
  }

  popBreadcrumbTo(index) {
    const item = this.breadcrumbHistory[index];
    this.breadcrumbHistory = this.breadcrumbHistory.slice(0, index + 1);
    this.renderBreadcrumb();
    if (item && item.onclickCode) {
      eval(item.onclickCode);
    }
  }

  renderBreadcrumb() {
    const breadcrumb = document.getElementById('breadcrumb');
    if (!breadcrumb) return;

    if (this.breadcrumbHistory.length <= 1) {
      breadcrumb.style.display = 'none';
      return;
    }

    breadcrumb.style.display = 'flex';
    breadcrumb.innerHTML = this.breadcrumbHistory.map((item, i) => {
      const isLast = i === this.breadcrumbHistory.length - 1;
      if (isLast) {
        return `<span>${item.label}</span>`;
      }
      return `<span class="breadcrumb-item" data-index="${i}" style="cursor: pointer; color: var(--accent);" onclick="event.preventDefault(); window.app?.popBreadcrumbTo(${i});">${item.label}</span><span style="margin: 0 8px;">›</span>`;
    }).join('');

    // Ocultar primeros si hay más de 5
    if (this.breadcrumbHistory.length > 5) {
      const items = breadcrumb.querySelectorAll('.breadcrumb-item, span[style*="margin: 0 8px"]');
      const toHide = this.breadcrumbHistory.length - 5;
      for (let i = 0; i < toHide * 2; i++) {
        if (items[i]) items[i].style.display = 'none';
      }
    }
  }

  checkStoredSession() {
    const storedPubkey = localStorage.getItem('nostr_pubkey');
    const storedNpub = localStorage.getItem('nostr_npub');
    
    if (storedPubkey && storedNpub && !this.pubkey) {
      this.pubkey = storedPubkey;
      this.loadRoles();
    }
  }

  loadRoles() {
    try {
      const saved = localStorage.getItem(ROLES_KEY);
      if (saved) {
        this.roles = JSON.parse(saved);
      }
    } catch (err) {
      console.warn('Error loading roles:', err);
    }
    this.updateNav();
    this.refreshCurrentView();
  }

  onNostrConnect(pubkey, nostrInstance) {
    this.pubkey = pubkey;
    this.nostr = nostrInstance;
    if (DEBUG) console.log('Nostr conectado:', pubkey);
    this.loadRoles();
  }

  refreshAccount() {
    if (this.currentView === 'account') {
      this.showAccount();
    }
  }

  refreshCurrentView() {
    const hash = window.location.hash;
    const isDeepLink = hash.startsWith('#/c/') || hash.startsWith('#/p/');
    
    if (this.currentView && !isDeepLink) {
      this.navigate(this.currentView);
    }
  }

  async onNostrDisconnect() {
    this.pubkey = null;
    this.roles = { teacher: false, student: false, sponsor: false };
    this.updateNav();
    await this.initNostrReadOnly();
    if (DEBUG) console.log('Sesión cerrada. reconectado en modo lectura');
  }

  onRolesChange(roles) {
    this.roles = roles;
    this.updateNav();
  }

  updateNav() {
    const createBtn = document.getElementById('nav-create-course');
    const myCoursesBtn = document.getElementById('nav-my-courses');
    const storedPubkey = localStorage.getItem('nostr_pubkey');
    const isLoggedIn = this.pubkey || storedPubkey;
    
    if (createBtn) {
      createBtn.style.display = this.roles.teacher ? 'inline-block' : 'none';
    }
    if (myCoursesBtn) {
      myCoursesBtn.style.display = this.roles.teacher ? 'inline-block' : 'none';
    }
  }

  render() {
    const app = document.querySelector('#app');
    if (!app) return;

    app.innerHTML = `
      <div class="container">
        <header style="position: sticky; top: 0; z-index: 100; background: var(--bg-primary);">
          <div style="padding: 6px 0; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); width: 100%; box-sizing: border-box;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <h1 style="margin: 0; cursor: pointer; padding: 6px 10px; border: 1px solid var(--border-color); border-radius: 8px; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,255,157,0.1)'" onmouseout="this.style.background='transparent'" onclick="window.app?.navigate('home')"><a href="#" onclick="return false;" style="color: inherit; text-decoration: none; font-size: 1.1rem;">⚡ <span>NosTeach</span></a></h1>
              <div id="connection-status" class="connection-status" style="font-size: 0.75rem; display: none;">
                <span class="status-dot"></span> <span class="status-text">Conectando...</span>
              </div>
            </div>
            <nav style="display: flex; gap: 10px; align-items: center;">
              <button class="btn-secondary" onclick="window.app?.navigate('courses')">📚 Explorar</button>
              <button id="nav-my-courses" class="btn-secondary" onclick="window.app?.navigate('my-courses')" style="display: none;">📊 Mis Cursos</button>
              <button id="nav-create-course" class="btn-secondary" onclick="window.app?.navigate('create-course')" style="display: none;">✏️ Crear Curso</button>
              <div id="user-menu-container"></div>
            </nav>
          </div>
          <div id="breadcrumb" class="breadcrumb" style="font-size: 0.85rem; color: var(--text-muted); padding: 6px 0; display: none; width: 100%; box-sizing: border-box; justify-content: flex-start; border-bottom: 1px solid var(--border-color);"></div>
        </header>

        <div id="content-area"></div>

        <div class="footer">
          <p class="subtitle">NosTeach: educación descentralizada</p>
          <p>
            <a href="https://github.com/fchurca/nosteach" target="_blank">🐱 GitHub</a> ·
            <a href="https://hackaton.lacrypta.ar" target="_blank">⚡ Lightning Hackathons 2026</a> · 
            <a href="https://lacrypta.ar" target="_blank">🏰 La Crypta</a> · 
            <a href="https://nostr.com" target="_blank">🦤 Powered by Nostr</a>
          </p>
        </div>
      </div>
    `;

    const userMenuContainer = document.getElementById('user-menu-container');
    if (userMenuContainer) {
      this.userMenu = new UserMenu(
        userMenuContainer,
        (pubkey, nostr) => this.onNostrConnect(pubkey, nostr),
        () => this.onNostrDisconnect()
      );
      window.userMenu = this.userMenu;
    }

    window.app = this;
  }

  navigate(view) {
    if (typeof view === 'object' && view.view === 'profile') {
      this.viewUserProfile(view.pubkey);
      return;
    }

    this.currentView = view;
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    switch (view) {
      case 'home':
        history.pushState(null, '', '/');
        this.breadcrumbHistory = [];
        this.renderBreadcrumb();
        this.showHome();
        break;
      case 'courses':
        history.pushState(null, '', '/#/c');
        this.breadcrumbHistory = [{ label: 'Cursos', onclickCode: 'window.app?.navigate(\'courses\')' }];
        this.renderBreadcrumb();
        this.showCourseList();
        break;
      case 'my-courses':
        this.showMyCourses();
        break;
      case 'responses':
        break;
      case 'create-course':
        if (!this.roles.teacher) {
          contentArea.innerHTML = `
            <div class="card">
              <h2>⚠️ Acceso denegado</h2>
              <p>Solo los profesores pueden crear cursos.</p>
              <p>Activa el rol de profesor para continuar.</p>
            </div>
          `;
        } else {
          this.showCourseForm();
        }
        break;
      case 'account':
        history.pushState(null, '', '/#/p');
        this.breadcrumbHistory = [];
        this.renderBreadcrumb();
        this.showAccount();
        break;
      case 'roles':
        this.showRoles();
        break;
      case 'profile':
        break;
    }
  }

  showHome() {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    const storedPubkey = localStorage.getItem('nostr_pubkey');
    const isLoggedIn = this.pubkey || storedPubkey;
    const displayPubkey = this.pubkey || storedPubkey;
    
    const roleSummary = Object.entries(this.roles)
      .filter(([_, v]) => v)
      .map(([k]) => k)
      .join(', ') || 'Sin roles';

    contentArea.innerHTML = `
      <div class="card">
        <h2>👋 Bienvenido a NosTeach</h2>
        ${isLoggedIn ? `
          <p>Conectado como: <code>${displayPubkey?.slice(0, 16)}...</code></p>
          <p>Tus roles activos: <strong>${roleSummary}</strong></p>
        ` : `
          <p>Ingresá tu nsec arriba para conectarte.</p>
        `}
      </div>

      <div class="grid">
        <div class="card">
          <h3>📚 Explorar Cursos</h3>
          <p>Ver todos los cursos disponibles en Nostr.</p>
          <button onclick="window.app?.navigate('courses')">Ver Cursos</button>
        </div>
        
        ${this.roles.teacher ? `
          <div class="card">
            <h3>📊 Mis Cursos</h3>
            <p>Ver y gestionar los cursos que publicaste.</p>
            <button onclick="window.app?.navigate('my-courses')">Ir a Mis Cursos</button>
          </div>
        ` : ''}
        
        ${this.roles.student ? `
          <div class="card">
            <h3>📖 Mis Evaluaciones</h3>
            <p>Ver tus cursos tomados y evaluaciones.</p>
            <button onclick="window.app?.navigate('courses')">Ver Cursos</button>
          </div>
        ` : ''}
        
        ${this.roles.sponsor ? `
          <div class="card">
            <h3>💰 Patrocinar</h3>
            <p>Apoyá a profesores y estudiantes con zaps.</p>
            <button onclick="window.app?.navigate('courses')">Explorar Cursos</button>
          </div>
        ` : ''}
      </div>

      <div class="card mt-20">
        <h3>💡 Acerca de NosTeach</h3>
        <p>Plataforma educativa descentralizada construida sobre Nostr. Los profesores publican cursos como eventos en la red, los alumnos aprenden y dan evaluaciones, y los sponsors pueden apoyar con zaps.</p>
        <ul style="margin: 15px 0; padding-left: 20px;">
          <li><strong>Profesor:</strong> Publica cursos, recibe zaps de alumnos y sponsors</li>
          <li><strong>Alumno:</strong> Explora cursos, toma evaluaciones, zap a profesores</li>
          <li><strong>Sponsor:</strong> Apoya cursos y alumnos con Lightning</li>
        </ul>
        <p style="color: var(--text-muted); font-size: 0.9rem;">
          Todo el contenido vive en relays Nostr públicos. Sin suscripciones, sin censores.
        </p>
      </div>
    `;
  }

  showAccount() {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    const isLoggedIn = this.pubkey || (this.userMenu?.pubkey) || localStorage.getItem('nostr_pubkey');
    
    if (!isLoggedIn) {
      contentArea.innerHTML = `
        <div class="card">
          <h2>👤 Mi Cuenta</h2>
          <p>Conectá tu identidad Nostr para ver tu cuenta.</p>
        </div>
      `;
      return;
    }

    const pubkey = this.pubkey || this.userMenu?.pubkey || localStorage.getItem('nostr_pubkey');
    const npub = this.userMenu?.npub || '';
    const profile = this.userMenu?.profile || {};
    const roles = profile;

    contentArea.innerHTML = `
      <div class="card">
        <h2>👤 Mi Cuenta</h2>
        
        <div class="profile-info" style="margin-bottom: 20px;">
          <div style="margin-bottom: 10px;">
            <strong>Nombre:</strong> ${profile.display_name || profile.name || 'No tenés perfil en Nostr'}
          </div>
          <div style="margin-bottom: 10px;">
            <strong>Lightning:</strong> 
            ${profile.lud16 || profile.lnurl ? 
              '<code style="background: rgba(0,255,157,0.1); padding: 2px 8px; border-radius: 4px;">' + (profile.lud16 || 'LNURL configurado') + '</code>' : 
              '<span style="color: var(--text-muted);">No configurado</span>'}
          </div>
          <div style="margin-bottom: 10px;">
            <strong>npub:</strong> 
            <code style="font-size: 0.85em;">${npub.slice(0, 20)}...</code>
            <a href="#/p/${npub}" style="margin-left: 10px; color: var(--accent);">🔗 Ver mi perfil público</a>
          </div>
          <div style="margin-bottom: 10px;">
            <strong>Roles activos:</strong>
            <span style="color: #00ff9d;">${Object.entries(this.roles).filter(([_, v]) => v).map(([k]) => k).join(', ') || 'Ninguno'}</span>
          </div>
        </div>

        ${!profile.name && !profile.display_name ? `
          <div style="background: rgba(255,200,0,0.1); padding: 12px; border-radius: 8px; margin-bottom: 15px;">
            <p style="margin: 0; font-size: 0.9rem;">
              💡 Para configurar tu perfil, usá una app como <a href="https://primal.net" target="_blank" style="color: var(--accent);">Primal</a> o <a href="https://damus.io" target="_blank" style="color: var(--accent);">Damus</a>.
            </p>
          </div>
        ` : ''}

        <p style="color: var(--text-muted); margin-bottom: 15px;">
          Los roles se guardan localmente. Editá tu perfil Nostr para guardar permanentemente.
        </p>
        <button onclick="window.app?.navigate('roles')" class="btn-secondary">
          Editar Roles
        </button>
      </div>
    `;
  }

  showRoles() {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    contentArea.innerHTML = `
      <div class="card">
        <h2>🎭 Mis Roles</h2>
        <p style="margin-bottom: 20px;">Seleccioná los roles que querés activar. Podés tener varios roles activos al mismo tiempo.</p>
        <div id="roles-page-container"></div>
      </div>
    `;

    const rolesContainer = document.getElementById('roles-page-container');
    if (rolesContainer) {
      new RoleSelector(rolesContainer, (roles) => this.onRolesChange(roles));
    }
  }

  async showCourseList() {
    console.log('showCourseList called, waiting for nostr...');
    const contentArea = document.getElementById('content-area');
    if (!contentArea) {
      console.log('No contentArea');
      return;
    }

    try {
      await this.waitForNostr();
    } catch (err) {
      contentArea.innerHTML = '<div class="card"><p>Error de conexión</p></div>';
      return;
    }

    contentArea.innerHTML = `
      <div class="card">
        <h2>📚 Explorar Cursos</h2>
        <p>Todos los cursos publicados en Nostr.</p>
        <div id="courses-container" data-loading="true">
          <div class="skeleton skeleton-card"></div>
          <div class="skeleton skeleton-card"></div>
          <div class="skeleton skeleton-card"></div>
        </div>
      </div>
    `;

    try {
      const events = await queryEvents({ kinds: [30078], '#t': ['nosteach'] });
      
      const teacherProfiles = await this.fetchTeacherProfiles(events);
      
      this.renderCourseList(events, teacherProfiles);
    } catch (err) {
      document.getElementById('courses-container').innerHTML = `
        <p class="error-text">Error al cargar cursos: ${err.message}</p>
        <button onclick="window.app?.showCourseList()" class="btn-secondary" style="margin-top: 10px;">Reintentar</button>
      `;
    }
  }

  async fetchTeacherProfiles(events) {
    const pubkeys = [...new Set(events.map(e => e.pubkey))];
    const profiles = {};
    
    try {
      // Query profiles for all teachers in parallel
      const profilePromises = pubkeys.map(async (pubkey) => {
        try {
          const events = await queryEvents({
            kinds: [0],
            authors: [pubkey],
            limit: 1
          });
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

  renderCourseList(events, teacherProfiles = {}) {
    const container = document.getElementById('courses-container');
    if (!container) return;

    if (container.dataset.loading === 'true' && events.length === 0) {
      return;
    }
    container.dataset.loading = 'false';

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
        const precioText = precio === 0 ? 'Gratis' : `${precio} sats`;
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

  async viewCourse(eventId, isDirectAccess = true) {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    await this.waitForNostr();

    history.pushState(null, '', `#/c/${eventId}`);

    contentArea.innerHTML = '<div class="card"><div class="skeleton skeleton-box"></div><div class="skeleton skeleton-text"></div></div>';

    try {
      const events = await queryEvents({
        kinds: [30078],
        ids: [eventId]
      });

      if (events.length === 0) {
        contentArea.innerHTML = '<div class="card"><h2>❌ Curso no encontrado</h2></div>';
        return;
      }

      const course = events[0];
      const courseContent = typeof course.content === 'string' ? JSON.parse(course.content) : course.content;
      const courseTitle = courseContent.titulo || 'Sin título';
      
      this.pushBreadcrumb(courseTitle, `window.app?.viewCourse('${eventId}', true)`);
      
      new CourseView(contentArea, course, this.nostr, this.roles, () => {
        this.navigate('courses');
      }, isDirectAccess);
    } catch (err) {
      contentArea.innerHTML = `<div class="card"><h2>❌ Error: ${err.message}</h2></div>`;
    }
  }

  async viewUserProfile(pubkey) {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    const npub = nip19.npubEncode(pubkey);
    history.pushState(null, '', `/#/p/${npub}`);

    if (!this.nostr) {
      contentArea.innerHTML = `
        <div class="card">
          <h2>⚠️ Sin conexión</h2>
          <p>Conectá tu identidad Nostr para ver perfiles.</p>
        </div>
      `;
      return;
    }

    contentArea.innerHTML = `
      <div class="card">
        <div class="invoice-loading">
          <div class="spinner"></div>
          <p>Cargando perfil...</p>
        </div>
      </div>
    `;

    try {
      const userProfile = new UserProfile(contentArea, pubkey, this.nostr);
      await userProfile.load();
      userProfile.render();
      this.currentUserProfile = userProfile;

      const userName = userProfile.profile?.display_name || userProfile.profile?.name || pubkey.slice(0, 8);
      this.pushBreadcrumb(userName, `window.app?.viewUserProfile('${pubkey}')`);
    } catch (err) {
      contentArea.innerHTML = `<div class="card"><h2>❌ Error: ${err.message}</h2></div>`;
    }
  }

  enrollCourse(eventId) {
    if (!this.roles.student) {
      window.toast?.warning('Solo los alumnos pueden inscribirse');
      return;
    }
    window.toast?.info('Inscribirse al curso: ' + eventId + ' (próximamente)');
  }

  async showMyCourses() {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    const myPubkey = this.pubkey || localStorage.getItem('nostr_pubkey');
    
    if (!myPubkey) {
      contentArea.innerHTML = `
        <div class="card">
          <h2>📊 Mis Cursos</h2>
          <p>Conectá tu identidad para ver tus cursos.</p>
        </div>
      `;
      return;
    }

    contentArea.innerHTML = `
      <div class="card">
        <h2>📊 Mis Cursos</h2>
        <p>Cursos que publicaste.</p>
        <div id="my-courses-container">
          <div class="invoice-loading">
            <div class="spinner"></div>
            <p>Cargando...</p>
          </div>
        </div>
      </div>
    `;

    try {
      const events = await queryEvents({
        kinds: [30078],
        authors: [myPubkey],
        '#t': ['nosteach']
      });

      const container = document.getElementById('my-courses-container');
      
      if (!container) {
        return;
      }
      
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
        const precioText = precio === 0 ? 'Gratis' : `${precio} sats`;
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
    } catch (err) {
      console.error('Error loading my courses:', err);
      document.getElementById('my-courses-container').innerHTML = `
        <p class="error-text">Error al cargar cursos: ${err.message}</p>
      `;
    }
  }

  async navigateToResponses(courseId) {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    history.pushState(null, '', `/#/c/${courseId}/r`);

    contentArea.innerHTML = '<div class="card"><div class="skeleton skeleton-box"></div><div class="skeleton skeleton-text"></div></div>';

    try {
      const events = await queryEvents({
        kinds: [30078],
        ids: [courseId]
      });

      if (events.length === 0) {
        contentArea.innerHTML = '<div class="card"><h2>❌ Curso no encontrado</h2></div>';
        return;
      }

      const course = events[0];
      const courseContent = typeof course.content === 'string' ? JSON.parse(course.content) : course.content;
      const courseTitle = courseContent.titulo || 'Curso';

      this.pushBreadcrumb('Evaluaciones', `window.app?.navigateToResponses('${courseId}')`);

      new EvaluationList(contentArea, courseId, course, this.nostr, () => {
        this.navigate('my-courses');
      });
      window.evaluationList = contentArea.querySelector('.evaluation-list')?.__component;
    } catch (err) {
      contentArea.innerHTML = `<div class="card"><h2>❌ Error: ${err.message}</h2></div>`;
    }
  }

  navigateToCourse(eventId) {
    this.viewCourse(eventId, false);
  }

  showCourseForm() {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

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
          <button type="button" onclick="window.app?.addModulo()" class="btn-secondary">+ Agregar Módulo</button>

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
            <button type="button" onclick="window.app?.addPregunta()" class="btn-secondary">+ Agregar Pregunta</button>
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
        await this.handleSubmitCourse();
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

  async handleSubmitCourse() {
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
      ['t', 'nosteach'],
      ['t', 'curso']
    ];

    try {
      const event = await this.nostr.publish(30078, curso, tags);
      window.toast?.success(`¡Curso publicado! ID: ${event.id.slice(0, 16)}...`);
      this.navigate('courses');
    } catch (err) {
      window.toast?.error('Error al publicar: ' + err.message);
    }
  }
}

export default App;
