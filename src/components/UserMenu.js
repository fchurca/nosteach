import NostrConnect from '../lib/NostrConnect.js';
import { NIP46_TIMEOUT } from '../lib/constants.js';
import { shortNpub } from '../lib/ui-utils.js';
import QRCode from 'qrcode';

class UserMenu {
  constructor(container, onConnect, onDisconnect) {
    this.container = container;
    this.onConnect = onConnect;
    this.onDisconnect = onDisconnect;
    this.nostr = new NostrConnect();
    this.isOpen = false;
    this._nip07HandlerAttached = false;
    
    // Expose globally for other components
    window.nostr = this.nostr;
    
    // Setup tab sync callbacks
    this.nostr.onLogout = (npub) => {
      if (this.onDisconnect) {
        this.onDisconnect(npub);
      }
    };
    this.nostr.onLogin = (pubkey, nostr) => {
      if (this.onConnect) {
        this.onConnect(pubkey, nostr);
      }
    };
    
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
              <strong>Conectar tu cuenta Nostr</strong>
              <button id="login-close-btn" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.2rem;" aria-label="Cerrar">×</button>
            </div>
            ${this.nostr.hasNip07() ? `
              <button id="nip07-connect-header-btn" class="btn-primary" style="width: 100%;">
                ⚡ Conectar con extensión (Alby, nos2x...)
              </button>
              <div style="text-align: center; margin: 10px 0; color: var(--text-muted);">— o —</div>
            ` : `
              <button id="nip07-connect-header-btn" class="btn-secondary" style="width: 100%; opacity: 0.6; cursor: not-allowed;" disabled title="Instalá una extensión como Alby o nos2x para usar NIP-07">
                ⚡ Conectar con extensión (no detectada)
              </button>
              <div style="text-align: center; margin: 10px 0; color: var(--text-muted);">— o —</div>
            `}
            <input type="password" id="login-unified-input" placeholder="nsec1... / bunker://..." style="width: 100%; margin-bottom: 8px;" autocomplete="off">
            <div id="login-error" style="color: var(--error); font-size: 0.85rem; margin-bottom: 8px; display: none;"></div>
            <button id="connect-unified-btn" style="width: 100%;">Conectar con clave</button>
            
            <div style="border-top: 1px solid rgba(255,255,255,0.1);">
              <div style="text-align: center; margin: 10px 0; color: var(--text-muted);">— o —</div>
              <button id="nostrconnect-btn" style="width: 100%;">🔗 Nostr Connect (QR)</button>
            </div>
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
    const unifiedBtn = document.getElementById('connect-unified-btn');
    const unifiedInput = document.getElementById('login-unified-input');

    if (userBtn) {
      userBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleDropdown();
      });
    }

    if (unifiedInput) {
      unifiedInput.addEventListener('input', (e) => {
        const value = e.target.value.trim();
        if (value.startsWith('nsec1')) {
          unifiedInput.classList.add('nsec-warning');
          unifiedInput.title = 'nsec no recomendado, usar extensión (NIP-07) o Nostr Connect (NIP-46)';
        } else {
          unifiedInput.classList.remove('nsec-warning');
          unifiedInput.title = '';
        }
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

    if (unifiedBtn) {
      unifiedBtn.addEventListener('click', () => this.handleConnect());
    }

    if (unifiedInput) {
      unifiedInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.handleConnect();
      });
    }

    const nip07Btn = document.getElementById('nip07-connect-header-btn');
    if (nip07Btn) {
      nip07Btn.addEventListener('click', () => this.handleNip07Connect());
    }

    const nostrConnectBtn = document.getElementById('nostrconnect-btn');
    if (nostrConnectBtn) {
      nostrConnectBtn.addEventListener('click', () => this.handleNostrConnect());
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
        document.getElementById('login-unified-input')?.focus();
      }
    }
  }

  hideLogin() {
    const loginPanel = document.getElementById('user-menu-login');
    if (loginPanel) loginPanel.style.display = 'none';
  }

  async handleConnect() {
    const unifiedInput = document.getElementById('login-unified-input');
    const errorEl = document.getElementById('login-error');
    const value = unifiedInput?.value.trim();

    if (!value) {
      this.showLoginError('Ingresá tu nsec o bunker URL');
      return;
    }

    try {
      if (value.startsWith('bunker://')) {
        await this.nostr.connectBunker(value);
      } else if (value.startsWith('nostrconnect://')) {
        await this.handleNostrConnect();
      } else {
        await this.nostr.connectNsec(value);
      }
      
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

  async handleNostrConnect() {
    try {
      const uri = await this.nostr.startNostrConnect();
      this.showNostrConnectQR(uri);
    } catch (err) {
      console.error('Nostr Connect error:', err);
      this.showLoginError(err.message);
    }
  }

  showNostrConnectQR(uri) {
    const existingModal = document.getElementById('nostrconnect-qr-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'nostrconnect-qr-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    const closeModal = () => {
      modal.remove();
      document.removeEventListener('keydown', handleEsc);
    };

    const handleEsc = (e) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handleEsc);

    modal.innerHTML = `
      <div style="background: var(--card-bg, #1a1a1a); padding: 24px; border-radius: 12px; max-width: 400px; text-align: center;">
        <h3 style="margin: 0 0 16px 0;">📱 Conectar con Nostr Connect</h3>
        <p style="font-size: 0.9rem; color: var(--text-muted, #aaa); margin-bottom: 16px;">
          Escaneá este código QR con tu bunker o app de Nostr
        </p>
        <div id="qr-container" style="margin: 16px 0; display: flex; justify-content: center;">
          <div class="skeleton" style="width: 200px; height: 200px; border-radius: 8px; background: rgba(255,255,255,0.1);"></div>
        </div>
        <p style="font-size: 0.8rem; color: var(--text-muted, #aaa); margin-bottom: 16px;">
          O copiá este link:
        </p>
        <input type="text" id="nostrconnect-uri" readonly value="${uri}" 
          style="width: 100%; padding: 8px; font-size: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; color: var(--text-primary, #fff);">
        <button id="copy-uri-btn" style="margin-top: 12px; padding: 8px 16px; background: var(--primary, #00ff9d); color: #000; border: none; border-radius: 4px; cursor: pointer;">
          📋 Copiar
        </button>
        <button id="close-qr-btn" style="margin-top: 12px; margin-left: 8px; padding: 8px 16px; background: transparent; color: var(--text-muted, #aaa); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; cursor: pointer;">
          Cerrar
        </button>
        <div id="nostrconnect-countdown" style="margin-top: 16px; font-size: 0.85rem; color: var(--text-muted, #aaa);">
          Nuevo código en: <span id="countdown-seconds" style="color: var(--primary, #00ff9d);">120</span>s
        </div>
        <div id="nostrconnect-progress" style="margin-top: 8px; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
          <div id="progress-bar" style="height: 100%; background: var(--primary, #00ff9d); width: 100%; transition: width 1s linear;"></div>
        </div>
        <div id="nostrconnect-status" style="margin-top: 16px; font-size: 0.85rem; color: var(--text-muted, #aaa);">
          Esperando aprobación...
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const qrContainer = modal.querySelector('#qr-container');
    this.generateQRCode(uri, qrContainer);

    modal.querySelector('#copy-uri-btn').addEventListener('click', () => {
      const uriInput = modal.querySelector('#nostrconnect-uri');
      uriInput.select();
      document.execCommand('copy');
      modal.querySelector('#copy-uri-btn').textContent = '✓ Copiado!';
    });

    modal.querySelector('#close-qr-btn').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    this.waitForNostrConnectApproval(modal);
  }

  generateQRCode(text, container) {
    QRCode.toDataURL(text, { 
      width: 200, 
      margin: 1,
      color: {
        dark: '#0a0f1a',
        light: '#ffffff'
      }
    })
      .then((dataUrl) => {
        container.innerHTML = '';
        const qr = document.createElement('img');
        qr.src = dataUrl;
        qr.alt = 'QR Code';
        qr.style.width = '200px';
        qr.style.height = '200px';
        qr.style.borderRadius = '8px';
        container.appendChild(qr);
      })
      .catch((err) => {
        container.innerHTML = '<span style="color: var(--error);">Error generando QR</span>';
      });
  }

  async waitForNostrConnectApproval(modal) {
    const statusEl = modal.querySelector('#nostrconnect-status');
    const countdownEl = modal.querySelector('#nostrconnect-countdown');
    const progressBar = modal.querySelector('#progress-bar');
    const qrContainer = modal.querySelector('#qr-container');
    const uriInput = modal.querySelector('#nostrconnect-uri');
    let cancelled = false;
    let countdownInterval = null;

    const TIMEOUT_SECONDS = NIP46_TIMEOUT / 1000;
    
    const startCountdown = () => {
      let seconds = TIMEOUT_SECONDS;
      if (countdownEl) countdownEl.style.display = 'block';
      if (progressBar) progressBar.style.width = '100%';
      
      if (countdownInterval) clearInterval(countdownInterval);
      
      countdownInterval = setInterval(() => {
        seconds--;
        if (countdownEl) {
          countdownEl.querySelector('#countdown-seconds').textContent = seconds;
        }
        if (progressBar) {
          progressBar.style.width = (seconds / TIMEOUT_SECONDS * 100) + '%';
        }
        if (seconds <= 0) {
          clearInterval(countdownInterval);
        }
      }, 1000);
    };

    modal.querySelector('#close-qr-btn').onclick = () => {
      cancelled = true;
      if (countdownInterval) clearInterval(countdownInterval);
      modal.remove();
    };

    startCountdown();

    while (!cancelled) {
      try {
        const result = await this.nostr.waitForNostrConnectApproval(NIP46_TIMEOUT);
        
        if (countdownInterval) clearInterval(countdownInterval);
        statusEl.textContent = '✓ Conectado!';
        statusEl.style.color = 'var(--success, #00ff9d)';
        
        modal.remove();
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
        return;
      } catch (err) {
        if (cancelled) return;

        if (err.message.includes('timeout') || err.message.includes('agotado')) {
          statusEl.textContent = '⏳ Venciendo... generando nuevo código';
          
          try {
            const newUri = await this.nostr.startNostrConnect();
            uriInput.value = newUri;
            qrContainer.innerHTML = '';
            this.generateQRCode(newUri, qrContainer);
            
            statusEl.textContent = 'Esperando aprobación...';
            startCountdown();
          } catch (retryErr) {
            statusEl.textContent = '❌ ' + retryErr.message;
            statusEl.style.color = 'var(--error, #ff4444)';
            return;
          }
        } else {
          if (countdownInterval) clearInterval(countdownInterval);
          statusEl.textContent = '❌ ' + err.message;
          statusEl.style.color = 'var(--error, #ff4444)';
          return;
        }
      }
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
    
    const displayNpub = shortNpub(this.nostr.npub, 8, 8);
    
    if (npubEl) npubEl.textContent = displayNpub;
    
    if (this.nostr.profile) {
      const displayName = this.nostr.profile.display_name || this.nostr.profile.name;
      if (nameEl) nameEl.textContent = displayName || '(sin nombre)';
      if (nameBtnEl) nameBtnEl.textContent = displayName || '(sin nombre)';
    } else {
      if (nameEl) {
        nameEl.textContent = '(cargando...)';
        nameEl.style.color = 'var(--text-muted)';
      }
      if (nameBtnEl) {
        nameBtnEl.textContent = '(cargando...)';
        nameBtnEl.style.color = 'var(--text-muted)';
      }
    }
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
    
    if (nameEl) {
      nameEl.textContent = displayName || '(sin nombre)';
      nameEl.style.color = displayName ? '' : 'var(--text-muted)';
    }
    if (npubEl) npubEl.textContent = shortNpub(this.nostr.npub, 12, 8);
    if (nameBtnEl) {
      nameBtnEl.textContent = displayName || '(sin nombre)';
      nameBtnEl.style.color = displayName ? '' : 'var(--text-muted)';
    }
  }

  disconnect() {
    const npub = this.nostr?.currentNpub;
    console.log('[UserMenu] Disconnect, npub:', npub);
    this.nostr.disconnect();
    this.closeDropdown();
    this.showLoggedOut();
    
    if (this.onDisconnect) {
      this.onDisconnect(npub);
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
