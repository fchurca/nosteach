import { nip19 } from 'nostr-tools';
import { getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import { DEBUG } from '../lib/constants.js';

const RELAYS = [
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://purplepag.es',
  'wss://filter.nostr.wine',
  'wss://relay.snort.social',
  'wss://inbox.nostr.wine'
];

const SESSION_KEYS = {
  sk: 'nostr_sk',
  pubkey: 'nostr_pubkey',
  npub: 'nostr_npub'
};

class UserMenu {
  constructor(container, onConnect, onDisconnect) {
    this.container = container;
    this.onConnect = onConnect;
    this.onDisconnect = onDisconnect;
    this.pubkey = null;
    this.npub = null;
    this.sk = null;
    this.profile = null;
    this.isOpen = false;
    this.render();
    this.restoreSession();
  }

  hasNip07() {
    return typeof window !== 'undefined' && window.nostr && typeof window.nostr.getPublicKey === 'function';
  }

  async handleNip07Connect() {
    if (!this.hasNip07()) {
      this.showLoginError('No se detectó extensión de Nostr. Instalá Alby, nos2x u otra extensión.');
      return;
    }

    try {
      const pubkey = await window.nostr.getPublicKey();
      this.pubkey = pubkey;
      this.npub = this.npub || nip19.npubEncode(pubkey);
      this.sk = null;
      
      localStorage.setItem('nostr_pubkey', pubkey);
      localStorage.setItem('nostr_npub', this.npub);
      localStorage.setItem('nostr_method', 'nip07');
      
      this.closeDropdown();
      if (this.onConnect) {
        this.onConnect(this.pubkey, this);
      }
    } catch (err) {
      console.error('NIP-07 connect error:', err);
      this.showLoginError('Error al conectar: ' + err.message);
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
            ${this.hasNip07() ? `
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
    const loginPanel = document.getElementById('user-menu-login');
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
    if (nip07Btn && !nip07Btn.disabled) {
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

    if (!nsec.startsWith('nsec')) {
      this.showLoginError('La nsec debe empezar con "nsec1"');
      return;
    }

    try {
      const decoded = nip19.decode(nsec);
      this.sk = decoded.data;
      this.pubkey = getPublicKey(this.sk);
      this.npub = nip19.npubEncode(this.pubkey);

      localStorage.setItem(SESSION_KEYS.sk, Array.from(this.sk).join(','));
      localStorage.setItem(SESSION_KEYS.pubkey, this.pubkey);
      localStorage.setItem(SESSION_KEYS.npub, this.npub);

      this.hideLogin();
      this.showUserLoggedIn();
      
      if (this.onConnect) {
        this.onConnect(this.pubkey, this);
      }
      
      this.fetchProfile();

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
    
    const displayName = this.profile?.display_name || this.profile?.name;
    const shortNpub = this.npub ? `${this.npub.slice(0, 8)}...${this.npub.slice(-8)}` : '';
    
    if (npubEl) npubEl.textContent = shortNpub;
    
    // Dropdown name
    if (nameEl) {
      nameEl.textContent = displayName || '(cargando nombre...)';
    }
    // Button name
    if (nameBtnEl) {
      nameBtnEl.textContent = displayName || '(cargando nombre...)';
    }
  }

  async restoreSession() {
    const savedSk = localStorage.getItem(SESSION_KEYS.sk);
    const savedPubkey = localStorage.getItem(SESSION_KEYS.pubkey);
    const savedNpub = localStorage.getItem(SESSION_KEYS.npub);
    
    if (savedSk && savedPubkey) {
      try {
        this.sk = new Uint8Array(savedSk.split(',').map(Number));
        this.pubkey = savedPubkey;
        this.npub = savedNpub || nip19.npubEncode(savedPubkey);
        
        this.showUserLoggedIn();
        await this.fetchProfile();
        
        if (this.onConnect) {
          this.onConnect(this.pubkey, this);
        }
      } catch (err) {
        console.error('Error restoring session:', err);
        this.clearSession();
      }
    }
  }

  async fetchProfile() {
    if (!this.pubkey) return;
    
    if (DEBUG) console.log('Fetching profile from relays...');
    
    try {
      const events = await this.query({
        kinds: [0],
        authors: [this.pubkey],
        limit: 1
      });

      if (events.length > 0) {
        const content = JSON.parse(events[0].content);
        this.profile = content;
        if (DEBUG) console.log('Profile fetched:', this.profile?.name || this.profile?.display_name);
      } else {
        if (DEBUG) console.log('No profile found on relays');
      }
    } catch (err) {
      console.warn('No se pudo obtener perfil:', err.message);
    }
    
    this.updateProfileDisplay();
    
    // Notify App to refresh account view
    if (window.app?.refreshAccount) {
      window.app.refreshAccount();
    }
  }

  updateProfileDisplay() {
    const nameEl = document.getElementById('user-menu-display-name');
    const npubEl = document.getElementById('user-menu-npub');
    const nameBtnEl = document.getElementById('user-menu-name');
    
    const displayName = this.profile?.display_name || this.profile?.name;
    
    if (nameEl) {
      nameEl.textContent = displayName || '(cargando nombre...)';
    }
    if (npubEl) {
      npubEl.textContent = this.npub ? `${this.npub.slice(0, 12)}...${this.npub.slice(-8)}` : '';
    }
    if (nameBtnEl) {
      nameBtnEl.textContent = displayName || 'Usuario';
    }
  }

  disconnect() {
    this.pubkey = null;
    this.npub = null;
    this.sk = null;
    this.profile = null;
    this.clearSession();
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

  clearSession() {
    localStorage.removeItem(SESSION_KEYS.sk);
    localStorage.removeItem(SESSION_KEYS.pubkey);
    localStorage.removeItem(SESSION_KEYS.npub);
  }

  async query(filters) {
    // Query all relays in PARALLEL for faster results
    const promises = RELAYS.map(relay => 
      this.relayQuery(relay, filters).then(events => ({ relay, events }))
    );
    
    const resultsArrays = await Promise.all(promises);
    
    // Log results per relay
    for (const { relay, events } of resultsArrays) {
      if (events.length > 0) {
        if (DEBUG) console.log(`${relay}: ${events.length} events`);
      }
    }
    
    // Merge results, deduplicate by id
    const results = [];
    const seen = new Set();
    for (const { events } of resultsArrays) {
      for (const event of events) {
        if (!seen.has(event.id)) {
          seen.add(event.id);
          results.push(event);
        }
      }
    }
    
    if (DEBUG) console.log(`Total: ${results.length} events from ${RELAYS.length} relays`);
    return results;
  }

  relayQuery(relay, filters) {
    return new Promise((resolve) => {
      const ws = new WebSocket(relay);
      const results = [];
      const subscriptionId = Math.random().toString(36).substring(2, 10);
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data[0] === 'EVENT' && data[1] === subscriptionId) {
            results.push(data[2]);
          } else if (data[0] === 'EOSE') {
            ws.send(JSON.stringify(['CLOSE', subscriptionId]));
            ws.close();
            resolve(results);
          }
        } catch (e) {
          // Ignore parse errors
        }
      };

      ws.onopen = () => {
        ws.send(JSON.stringify(['REQ', subscriptionId, filters]));
      };

      ws.onerror = () => {
        resolve(results);
      };

      ws.onclose = () => {
        resolve(results);
      };

      // Timeout
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(['CLOSE', subscriptionId]));
          ws.close();
        }
        resolve(results);
      }, 5000); // 5 seconds timeout for better profile fetching
    });
  }

  async publish(kind, content, tags = []) {
    if (!this.sk || !this.pubkey) {
      throw new Error('No conectado a Nostr');
    }

    const event = {
      kind,
      pubkey: this.pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: typeof content === 'object' ? JSON.stringify(content) : content
    };

    const signed = finalizeEvent(event, this.sk);
    
    // Publish to all relays in PARALLEL
    const publishPromises = RELAYS.map(relay => 
      this.relayPublish(relay, signed)
        .then(() => ({ relay, success: true }))
        .catch(err => ({ relay, success: false, error: err.message }))
    );
    
    const results = await Promise.all(publishPromises);
    const successful = results.filter(r => r.success);
    
    if (successful.length === 0) {
      throw new Error('No se pudo publicar a ningún relay');
    }
    
    if (DEBUG) console.log(`Published to ${successful.length}/${RELAYS.length} relays`);
    return signed;
  }

  relayPublish(relay, event) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(relay);
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Timeout'));
      }, 5000); // 5 seconds timeout

      ws.onopen = () => {
        ws.send(JSON.stringify(['EVENT', event]));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        clearTimeout(timeout);
        ws.close();
        if (data[0] === 'OK') {
          resolve(data);
        } else {
          reject(new Error(data[1] || 'Unknown error'));
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Connection failed'));
      };
    });
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
