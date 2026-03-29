import UserMenu from './components/UserMenu.js';
import RoleSelector, { ROLES_KEY } from './components/RoleSelector.js';
import CourseView from './components/CourseView.js';
import UserProfile from './components/UserProfile.js';
import EvaluationList from './components/EvaluationList.js';
import CourseManager from './lib/CourseManager.js';
import { validateCurso } from './lib/schema.js';
import { formatAuthorName } from './lib/lightning.js';
import { nip19 } from 'nostr-tools';
import { DEBUG, KINDS, TAGS } from './lib/constants.js';
import { onConnectionStatusChange, getConnectionStatus, queryEvents, getNDK } from './lib/nostr.js';
import { shortNpub, emptyState, skeletonCard, skeletonBox, spinner, formatPrice } from './lib/ui-utils.js';

class App {
  constructor() {
    this.pubkey = null;
    this.nostr = null;
    this.roles = { teacher: false, student: false, sponsor: false };
    this.roleSelector = null;
    this.userMenu = null;
    this.currentView = 'home';
    this.breadcrumbHistory = [];
    this.courseManager = null;
    this.initCourseManager();
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
        let eventId = hash.slice(4);
        // Support nevent or hex event id
        try {
          const decoded = nip19.decode(eventId);
          if (decoded && decoded.type === 'nevent') {
            eventId = decoded.data.id;
          }
        } catch (err) {
          // Hex id, use as-is
        }
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
        let pubkey = hash.slice(4);
        // Support npub or hex pubkey
        try {
          const decoded = nip19.decode(pubkey);
          if (decoded && decoded.type === 'npub') {
            pubkey = decoded.data;
          }
        } catch (err) {
          // Hex pubkey, use as-is
        }
        this.breadcrumbHistory = [];
        this.renderBreadcrumb();
        await this.viewUserProfile(pubkey);
      } else if (hash.startsWith('#/c/') && hash.includes('/r')) {
        let courseId = hash.slice(4).split('/')[0];
        // Support nevent or hex event id
        try {
          const decoded = nip19.decode(courseId);
          if (decoded && decoded.type === 'nevent') {
            courseId = decoded.data.id;
          }
        } catch (err) {
          // Hex id, use as-is
        }
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
    const storedPubkey = window.nostr?.currentPubkey;
    const storedNpub = window.nostr?.currentNpub;
    
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
    console.log('[App] onNostrConnect called, pubkey:', pubkey, 'isTabSync:', nostrInstance?._isTabSync);
    this.pubkey = pubkey;
    this.nostr = nostrInstance;
    if (DEBUG) console.log('Nostr conectado:', pubkey);
    this.loadRoles();
    this.initCourseManager();
    
    // Only reload if login came from another tab (sync)
    if (nostrInstance?._isTabSync) {
      window.location.reload();
    } else {
      this.refreshCurrentView();
    }
  }

  initCourseManager() {
    this.courseManager = new CourseManager(this.nostr, this.roles, {
      onNavigate: (view) => this.navigate(view),
      onViewCourse: (id) => this.viewCourse(id),
      onViewUserProfile: (pk) => this.viewUserProfile(pk),
      onPushBreadcrumb: (label, onclick) => this.pushBreadcrumb(label, onclick),
      waitForNostr: () => this.waitForNostr()
    });
    window.courseManager = this.courseManager;
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

  async onNostrDisconnect(npub) {
    this.pubkey = null;
    this.roles = { teacher: false, student: false, sponsor: false };
    this.updateNav();
    await this.initNostrReadOnly();
    if (DEBUG) console.log('Sesión cerrada. reconectado en modo lectura. npub:', npub);
    
    // Si estaba en Mi Cuenta (#/p), ir a su perfil público
    let hash = window.location.hash;
    console.log('[App] onNostrDisconnect, hash:', hash, 'npub:', npub);
    if (hash.startsWith('#/p') && !hash.startsWith('#/p/')) {
      if (npub) {
        window.location.hash = '#/p/' + npub;
      } else {
        window.location.hash = '#/';
      }
    } else if (!hash || hash === '#/' || hash === '#' || hash === '#/c') {
      // On home or courses - reload to re-fetch with read-only mode
      window.location.reload();
    }
    
    // Always refresh current view when logout from another tab
    this.refreshCurrentView();
  }

  onRolesChange(roles) {
    this.roles = roles;
    this.updateNav();
  }

  updateNav() {
    const createBtn = document.getElementById('nav-create-course');
    const myCoursesBtn = document.getElementById('nav-my-courses');
    const storedPubkey = window.nostr?.currentPubkey;
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
            <a href="https://lacrypta.ar" target="_blank">🏯 La Crypta</a> · 
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
        (npub) => this.onNostrDisconnect(npub)
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

    const storedPubkey = window.nostr?.currentPubkey;
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

    const renderView = () => {
      const currentPubkey = this.pubkey || window.nostr?.currentPubkey;
      const currentNpub = window.nostr?.currentNpub || '';
      
      if (!currentPubkey) {
        contentArea.innerHTML = `
          <div class="card">
            <h2>👤 Mi Cuenta</h2>
            <p>Conectá tu identidad Nostr para ver tu cuenta.</p>
          </div>
        `;
        return;
      }

      const pubkey = currentPubkey;
      const npub = currentNpub;
      
      const showLoading = () => {
        contentArea.innerHTML = `
          <div class="card">
            <h2>👤 Mi Cuenta</h2>
            <p style="color: var(--text-muted);">Cargando información...</p>
            <div class="skeleton" style="background: rgba(255,255,255,0.1); height: 20px; border-radius: 4px; margin: 10px 0; width: 60%;"></div>
            <div class="skeleton" style="background: rgba(255,255,255,0.1); height: 20px; border-radius: 4px; margin: 10px 0; width: 40%;"></div>
          </div>
        `;
      };

      const renderAccount = (profile = {}) => {
        const roles = profile;
        const displayName = profile.display_name || profile.name || '';
        const lightningInfo = profile.lud16 || profile.lnurl || '';
        
        contentArea.innerHTML = `
          <div class="card">
            <h2>👤 Mi Cuenta</h2>
            
            <div class="profile-info" style="margin-bottom: 20px;">
              <div style="margin-bottom: 10px;">
                <strong>Nombre:</strong> ${displayName ? displayName : '<span style="color: var(--text-muted);">(no definido)</span>'}
              </div>
              <div style="margin-bottom: 10px;">
                <strong>Lightning:</strong> 
                ${lightningInfo ? 
                  '<code style="background: rgba(0,255,157,0.1); padding: 2px 8px; border-radius: 4px;">' + lightningInfo + '</code>' : 
                  '<span style="color: var(--text-muted);">(no definido)</span>'}
              </div>
              <div style="margin-bottom: 10px;">
                <strong>npub:</strong> 
                <code style="font-size: 0.85em; font-family: monospace;">${npub || '<span style="color: var(--text-muted);">(no definido)</span>'}</code>
              </div>
              <div style="margin-bottom: 10px;">
                <strong>hex:</strong> 
                <code style="font-size: 0.85em; font-family: monospace;">${pubkey || '<span style="color: var(--text-muted);">(no definido)</span>'}</code>
              </div>
              <div style="margin-bottom: 10px;">
                <strong>Protocolo de autenticación:</strong> 
                ${this.nostr?.authMethod === 'nip46' ? 'NIP-46 (Remoto)' : 
                  this.nostr?.authMethod === 'nip07' ? 'NIP-07 (Extensión)' : 
                  'Clave privada local'}
              </div>
              <div style="margin-bottom: 10px;">
                <strong>Roles activos:</strong>
                <span style="color: #00ff9d;">${Object.entries(this.roles).filter(([_, v]) => v).map(([k]) => k).join(', ') || 'Ninguno'}</span>
              </div>
            </div>

            ${npub ? `
              <p style="margin-bottom: 15px;">
                <a href="#/p/${npub}" style="color: var(--accent);">→ Mi perfil público</a>
              </p>
            ` : ''}

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
      };

      const existingProfile = this.nostr?.profile;
      if (existingProfile) {
        renderAccount(existingProfile);
      } else if (this.nostr?.fetchProfile) {
        showLoading();
        
        this.nostr.fetchProfile().then(profile => {
          this.refreshAccount();
        }).catch(() => {
          renderAccount({});
        });
      } else {
        renderAccount({});
      }
    };

    if (this.nostr) {
      renderView();
    } else {
      const checkInterval = setInterval(() => {
        if (this.nostr) {
          clearInterval(checkInterval);
          renderView();
        }
      }, 500);
      
      setTimeout(() => clearInterval(checkInterval), 10000);
    }
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
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

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
      const container = document.getElementById('courses-container');
      await this.courseManager.listCourses(container);
    } catch (err) {
      document.getElementById('courses-container').innerHTML = `
        <p class="error-text">Error al cargar cursos: ${err.message}</p>
        <button onclick="window.app?.showCourseList()" class="btn-secondary" style="margin-top: 10px;">Reintentar</button>
      `;
    }
  }

  async viewCourse(eventId, isDirectAccess = true) {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;
    await this.courseManager.getCourse(eventId, contentArea, isDirectAccess);
  }

  async viewUserProfile(pubkey) {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    await this.waitForNostr();

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

    const myPubkey = this.pubkey || window.nostr?.currentPubkey;
    
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

    const container = document.getElementById('my-courses-container');
    await this.courseManager.listMyCourses(container, myPubkey);
  }

  async navigateToResponses(courseId) {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;
    await this.courseManager.getResponses(courseId, contentArea);
  }

  navigateToCourse(eventId) {
    this.viewCourse(eventId, false);
  }

  showCourseForm() {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;
    this.courseManager.showCreateForm(contentArea);
  }
}

export default App;
