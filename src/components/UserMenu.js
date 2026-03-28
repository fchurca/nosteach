import NostrConnect from '../lib/NostrConnect.js';

class UserMenu {
  constructor(container, onConnect, onDisconnect) {
    this.container = container;
    this.onConnect = onConnect;
    this.onDisconnect = onDisconnect;
    this.nostr = new NostrConnect();
    this.isOpen = false;
    this._nip07HandlerAttached = false;
    this.render();
    this.checkNip07Extension();
    this.restoreSession();
  }

  checkNip07Extension() {
    const check = () => {
      const btn = document.getElementById('nip07-connect-header-btn');
      if (!btn) return;
      
      if (this.nostr.hasNip07()) {
        btn.disabled = false;
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        btn.title = 'Conectar con extensión (Alby, nos2x...)';
        btn.textContent = '⚡ Conectar con extensión (Alby, nos2x...)';
        
        if (!this._nip07HandlerAttached) {
          this._nip07HandlerAttached = true;
          btn.addEventListener('click', () => this.handleNip07Connect());
        }
      }
    };
    
    window.addEventListener('nostr', check, { once: true });
    setTimeout(check, 500);
    setTimeout(check, 2000);
  }

  async handleNip07Connect() {
    try {
      await this.nostr.connectNip07();
      this.showUserLoggedIn();
      this.closeDropdown();
      if (this.onConnect) {
        this.onConnect(this.nostr.pubkey, this.nostr);
      }
    } catch (err) {
      console.error('NIP-07 connect error:', err);
      this.showLoginError(err.message);
    }
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div id="user-menu-container" class="user-menu-container">
        <div id="user-menu-trigger">
          <button id="user-menu-btn" class="btn-user-menu" style="display: none;">
            <span id="user-menu-avatar">👤</span>
            <span id="user-menu-name">Usuario</span>
            <span class="dropdown-arrow">▼</span>
          </button>
          <button id="user-menu-connect" class="btn-connect-header">
            🔑 Iniciar sesión
          </button>
        </div>
        
        <div id="user-menu-dropdown" class="user-menu-dropdown" style="display: none;">
          <div id="user-menu-info" style="padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.1);">
            <div id="user-menu-display-name" style="font-weight: bold; margin-bottom: 4px;">(cargando nombre...)</div>
            <div id="user-menu-npub" style="font-size: 0.8rem; color: var(--text-muted); font-family: monospace;"></div>
          </div>
          <a href="#" id="menu-mi-cuenta" class="dropdown-item" onclick="window.userMenu?.showAccount(); return false;">
            👤 Mi Cuenta
          </a>
          <a href="#" id="menu-roles" class="dropdown-item" onclick="window.userMenu?.showRoles(); return false;">
            🎭 Mis Roles
          </a>
          <div style="border-top: 1px solid rgba(255,255,255,0.1); margin-top: 4px; padding-top: 4px;">
            <a href="#" class="dropdown-item" onclick="window.userMenu?.disconnect(); return false;">
              🔌 Desconectar
            </a>
          </div>
        </div>

        <div id="user-menu-login" class="user-menu-login" style="display: none;">
          <div style="background: var(--card-bg); border-radius: 12px; padding: 16px; border: 1px solid rgba(255,255,255,0.1);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <strong>Conectar con tu clave Nostr</strong>
              <button id="login-close-btn" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.2rem;" aria-label="Cerrar">×</button>
            </div>
            ${this.nostr.hasNip07() ? `
              <button id="nip07-connect-header-btn" class="btn-primary" style="margin-bottom: 15px; width: 100%;">
                ⚡ Conectar con extensión (Alby, nos2x...)
              </button>
              <div style="text-align: center; margin: 10px 0; color: var(--text-muted);">— o —</div>
            ` : `
              <button id="nip07-connect-header-btn" class="btn-secondary" style="margin-bottom: 15px; width: 100%; opacity: 0.6; cursor: not-allowed;" disabled title="Instalá una extensión como Alby o nos2x para usar NIP-07">
                ⚡ Conectar con extensión (no detectada)
              </button>
              <div style="text-align: center; margin: 10px 0; color: var(--text-muted);">— o —</div>
            `}
            <label for="nsec-input-header" style="display: block; margin-bottom: 4px; font-size: 0.9rem; color: var(--text-secondary);">Tu clave privada (nsec)</label>
            <input type="password" id="nsec-input-header" placeholder="nsec1..." style="width: 100%; margin-bottom: 8px;" aria-describedby="nsec-help">
            <small id="nsec-help" style="display: block; margin-bottom: 8px; font-size: 0.8rem; color: var(--text-muted);">Nunca se comparte - se usa solo para iniciar sesión localmente</small>
            <div id="login-error" style="color: var(--error); font-size: 0.85rem; margin-bottom: 8px; display: none;"></div>
            <button id="nsec-connect-header-btn" style="width: 100%;">Conectar</button>
          </div>
        </div>
      </div>
    `;

    this.attachListeners();
  }

  attachListeners() {
    const userBtn = document.getElementById('user-menu-btn');
    const connectBtn = document.getElementById('user-menu-connect');
    const closeBtn = document.getElementById('login-close-btn');
    const connectHeaderBtn = document.getElementById('nsec-connect-header-btn');
    const nsecInput = document.getElementById('nsec-input-header');

    if (userBtn) {
      userBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleDropdown();
      });
    }

    if (connectBtn) {
      connectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleLogin();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideLogin();
      });
    }

    if (connectHeaderBtn) {
      connectHeaderBtn.addEventListener('click', () => this.handleConnect());
    }

    const nip07Btn = document.getElementById('nip07-connect-header-btn');
    if (nip07Btn) {
      nip07Btn.addEventListener('click', () => this.handleNip07Connect());
    }

    if (nsecInput) {
      nsecInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.handleConnect();
      });
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.user-menu-container')) {
        this.closeDropdown();
        this.hideLogin();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeDropdown();
        this.hideLogin();
      }
    });
  }

  toggleDropdown() {
    this.isOpen = !this.isOpen;
    const dropdown = document.getElementById('user-menu-dropdown');
    if (dropdown) {
      dropdown.style.display = this.isOpen ? 'block' : 'none';
    }
  }

  closeDropdown() {
    this.isOpen = false;
    const dropdown = document.getElementById('user-menu-dropdown');
    if (dropdown) dropdown.style.display = 'none';
  }

  toggleLogin() {
    const loginPanel = document.getElementById('user-menu-login');
    if (loginPanel) {
      const isVisible = loginPanel.style.display === 'block';
      loginPanel.style.display = isVisible ? 'none' : 'block';
      if (!isVisible) {
        document.getElementById('nsec-input-header')?.focus();
      }
    }
  }

  hideLogin() {
    const loginPanel = document.getElementById('user-menu-login');
    if (loginPanel) loginPanel.style.display = 'none';
  }

  async handleConnect() {
    const nsecInput = document.getElementById('nsec-input-header');
    const errorEl = document.getElementById('login-error');
    const nsec = nsecInput?.value.trim();

    if (!nsec) {
      this.showLoginError('Ingresá tu nsec');
      return;
    }

    try {
      await this.nostr.connectNsec(nsec);
      this.hideLogin();
      this.showUserLoggedIn();
      
      if (this.onConnect) {
        this.onConnect(this.nostr.pubkey, this.nostr);
      }
      
      this.nostr.fetchProfile().then(profile => {
        this.updateProfileDisplay();
        if (window.app?.refreshAccount) {
          window.app.refreshAccount();
        }
      });
    } catch (err) {
      console.error('Connection error:', err);
      this.showLoginError(err.message);
    }
  }

  showLoginError(message) {
    const errorEl = document.getElementById('login-error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }
  }

  showUserLoggedIn() {
    const userBtn = document.getElementById('user-menu-btn');
    const connectBtn = document.getElementById('user-menu-connect');
    const npubEl = document.getElementById('user-menu-npub');
    const nameEl = document.getElementById('user-menu-display-name');
    const nameBtnEl = document.getElementById('user-menu-name');

    if (userBtn) userBtn.style.display = 'flex';
    if (connectBtn) connectBtn.style.display = 'none';
    
    const displayName = this.nostr.profile?.display_name || this.nostr.profile?.name;
    const shortNpub = this.nostr.npub ? `${this.nostr.npub.slice(0, 8)}...${this.nostr.npub.slice(-8)}` : '';
    
    if (npubEl) npubEl.textContent = shortNpub;
    if (nameEl) nameEl.textContent = displayName || '(cargando nombre...)';
    if (nameBtnEl) nameBtnEl.textContent = displayName || '(cargando nombre...)';
  }

  async restoreSession() {
    const result = await this.nostr.restoreSession();
    
    if (result) {
      this.showUserLoggedIn();
      if (this.onConnect) {
        this.onConnect(this.nostr.pubkey, this.nostr);
      }
      this.nostr.fetchProfile().then(profile => {
        this.updateProfileDisplay();
        if (window.app?.refreshAccount) {
          window.app.refreshAccount();
        }
      });
    }
  }

  updateProfileDisplay() {
    const nameEl = document.getElementById('user-menu-display-name');
    const npubEl = document.getElementById('user-menu-npub');
    const nameBtnEl = document.getElementById('user-menu-name');
    
    const displayName = this.nostr.profile?.display_name || this.nostr.profile?.name;
    
    if (nameEl) nameEl.textContent = displayName || '(cargando nombre...)';
    if (npubEl) npubEl.textContent = this.nostr.npub ? `${this.nostr.npub.slice(0, 12)}...${this.nostr.npub.slice(-8)}` : '';
    if (nameBtnEl) nameBtnEl.textContent = displayName || 'Usuario';
  }

  disconnect() {
    this.nostr.disconnect();
    this.closeDropdown();
    this.showLoggedOut();
    
    if (this.onDisconnect) {
      this.onDisconnect();
    }
  }

  showLoggedOut() {
    const userBtn = document.getElementById('user-menu-btn');
    const connectBtn = document.getElementById('user-menu-connect');

    if (userBtn) userBtn.style.display = 'none';
    if (connectBtn) connectBtn.style.display = 'inline-block';
  }

  showAccount() {
    this.closeDropdown();
    if (window.app) {
      window.app.navigate('account');
    }
  }

  showRoles() {
    this.closeDropdown();
    if (window.app) {
      window.app.navigate('roles');
    }
  }
}

export default UserMenu;
