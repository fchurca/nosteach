import { getPublicKey, finalizeEvent, getEventHash } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';

const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band'
];

class NostrConnect {
  constructor(container, onConnect) {
    this.container = container;
    this.onConnect = onConnect;
    this.pubkey = null;
    this.npub = null;
    this.sk = null;
    this.profile = null;
    this.nip07 = false;
    this.render();
    this.checkNip07Extension();
    this.restoreSession();
  }

  hasNip07() {
    return typeof window !== 'undefined' && window.nostr && typeof window.nostr.getPublicKey === 'function';
  }

  checkNip07Extension() {
    if (this.hasNip07()) {
      return;
    }
    
    const check = () => {
      if (this.hasNip07() && document.getElementById('nip07-connect-btn')) {
        const btn = document.getElementById('nip07-connect-btn');
        btn.disabled = false;
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        btn.title = 'Conectar con extensión (Alby, nos2x...)';
        btn.textContent = '⚡ Conectar con extensión (Alby, nos2x...)';
        
        const placeholder = btn.closest('.card')?.querySelector('.nip07-placeholder');
        if (placeholder) placeholder.style.display = 'none';
      }
    };
    
    window.addEventListener('nostr', check, { once: true });
    setTimeout(check, 1000);
    setTimeout(check, 3000);
  }

  async handleNip07Connect() {
    if (!this.hasNip07()) {
      this.showError('No se detectó extensión de Nostr. Instalá Alby, nos2x u otra extensión.');
      return;
    }

    try {
      this.updateStatus('🟡 Conectando...', 'connecting');
      
      const pubkey = await window.nostr.getPublicKey();
      this.pubkey = pubkey;
      this.npub = nip19.npubEncode(pubkey);
      this.nip07 = true;
      this.sk = null;
      
      localStorage.setItem('nostr_pubkey', pubkey);
      localStorage.setItem('nostr_npub', this.npub);
      localStorage.setItem('nostr_method', 'nip07');
      
      this.updateStatus('🟢 Conectado (extensión)', 'connected');
      this.showUserInfo();
      await this.fetchProfile();
      
      if (this.onConnect) {
        this.onConnect(this.pubkey, this);
      }
    } catch (err) {
      console.error('NIP-07 connect error:', err);
      this.showError('Error al conectar: ' + err.message);
    }
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="card">
        <h2>🔑 Conexión Nostr</h2>
        
        <div id="nostr-status" class="status disconnected">
          ⚪ No conectado
        </div>

        <div id="nostr-user-info" style="display:none; margin: 15px 0;">
          <div style="background: rgba(0,255,157,0.1); border-radius: 8px; padding: 15px;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
              <span style="font-size: 2rem;">👤</span>
              <div>
                <div id="nostr-display-name" style="font-weight: bold; font-size: 1.1rem;">(cargando nombre...)</div>
                <div id="nostr-npub" style="font-family: monospace; font-size: 0.85rem; color: #00ff9d;"></div>
              </div>
            </div>
            <button id="nostr-logout-btn" class="btn-secondary" style="padding: 8px 16px; font-size: 0.85rem;">
              Desconectar
            </button>
          </div>
        </div>

        <div id="nostr-login-form">
          ${this.hasNip07() ? `
            <button id="nip07-connect-btn" class="btn-primary" style="margin-bottom: 15px; width: 100%;">
              ⚡ Conectar con extensión (Alby, nos2x...)
            </button>
          ` : `
            <button id="nip07-connect-btn" class="btn-secondary" style="margin-bottom: 15px; width: 100%; opacity: 0.6; cursor: not-allowed;" disabled title="Instalá una extensión como Alby o nos2x para usar NIP-07">
              ⚡ Conectar con extensión (no detectada)
            </button>
          `}
          <div style="text-align: center; margin: 10px 0; color: var(--text-muted);">— o —</div>
          <label for="nsec-input" style="display: block; margin-bottom: 4px; font-size: 0.9rem;">Tu clave privada (nsec)</label>
          <input type="password" id="nsec-input" placeholder="nsec1...">
          <button id="nsec-connect-btn">Conectar con nsec</button>
        </div>
        
        <div id="nostr-output" class="output"></div>
      </div>
    `;

    const nsecBtn = document.getElementById('nsec-connect-btn');
    if (nsecBtn) {
      nsecBtn.addEventListener('click', () => this.handleNsecConnect());
    }

    const nip07Btn = document.getElementById('nip07-connect-btn');
    if (nip07Btn) {
      nip07Btn.addEventListener('click', () => this.handleNip07Connect());
    }

    const nsecInput = document.getElementById('nsec-input');
    if (nsecInput) {
      nsecInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.handleNsecConnect();
      });
    }

    const logoutBtn = document.getElementById('nostr-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.disconnect());
    }
  }

  async restoreSession() {
    const savedSk = localStorage.getItem('nostr_sk');
    const savedPubkey = localStorage.getItem('nostr_pubkey');
    const savedNpub = localStorage.getItem('nostr_npub');
    const savedMethod = localStorage.getItem('nostr_method');
    
    if (savedMethod === 'nip07') {
      if (!this.hasNip07()) {
        this.clearSession();
        return;
      }
      try {
        const currentPubkey = await window.nostr.getPublicKey();
        
        if (savedPubkey && savedPubkey !== currentPubkey) {
          this.clearSession();
          return;
        }
        
        this.pubkey = currentPubkey;
        this.npub = nip19.npubEncode(currentPubkey);
        this.nip07 = true;
        
        localStorage.setItem('nostr_pubkey', currentPubkey);
        localStorage.setItem('nostr_npub', this.npub);
        
        this.updateStatus('🟡 Sesión restaurada (extensión)', 'connected');
        this.showUserInfo();
        
        await this.fetchProfile();
        
        if (this.onConnect) {
          this.onConnect(this.pubkey, this);
        }
      } catch (err) {
        console.error('Error restoring NIP-07 session:', err);
        this.clearSession();
      }
    } else if (savedSk && savedPubkey) {
      try {
        this.sk = new Uint8Array(savedSk.split(',').map(Number));
        this.pubkey = savedPubkey;
        this.npub = savedNpub || nip19.npubEncode(savedPubkey);
        
        this.updateStatus('🟡 Sesión restaurada', 'connected');
        this.showUserInfo();
        
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

  clearSession() {
    localStorage.removeItem('nostr_sk');
    localStorage.removeItem('nostr_pubkey');
    localStorage.removeItem('nostr_npub');
    localStorage.removeItem('nostr_method');
    this.nip07 = false;
  }

  async handleNsecConnect() {
    const status = document.getElementById('nostr-status');
    const output = document.getElementById('nostr-output');
    const nsecInput = document.getElementById('nsec-input');
    const nsecBtn = document.getElementById('nsec-connect-btn');

    const nsec = nsecInput?.value.trim();

    if (!nsec) {
      this.showError('Ingresá tu nsec');
      return;
    }

    if (!nsec.startsWith('nsec')) {
      this.showError('La nsec debe empezar con "nsec1"');
      return;
    }

    try {
      nsecBtn.disabled = true;
      nsecBtn.textContent = 'Conectando...';

      const decoded = nip19.decode(nsec);
      this.sk = decoded.data;
      this.pubkey = getPublicKey(this.sk);
      this.npub = nip19.npubEncode(this.pubkey);

      localStorage.setItem('nostr_sk', Array.from(this.sk).join(','));
      localStorage.setItem('nostr_pubkey', this.pubkey);
      localStorage.setItem('nostr_npub', this.npub);

      this.updateStatus(`🟢 Conectado`, 'connected');
      
      this.showUserInfo();
      output.className = 'output show success';
      output.textContent = `Conectado como ${this.truncateNpub(this.npub)}`;

      nsecBtn.textContent = '✓ Conectado';
      nsecInput.style.display = 'none';
      nsecBtn.style.display = 'none';

      await this.fetchProfile();

      if (this.onConnect) {
        this.onConnect(this.pubkey, this);
      }

    } catch (err) {
      console.error('Connection error:', err);
      this.showError(err.message);
      nsecBtn.disabled = false;
      nsecBtn.textContent = 'Conectar con nsec';
    }
  }

  showUserInfo() {
    const loginForm = document.getElementById('nostr-login-form');
    const userInfo = document.getElementById('nostr-user-info');
    const npubEl = document.getElementById('nostr-npub');
    const displayNameEl = document.getElementById('nostr-display-name');
    
    if (loginForm) loginForm.style.display = 'none';
    if (userInfo) userInfo.style.display = 'block';
    if (npubEl) npubEl.textContent = this.npub;
    if (displayNameEl && this.profile) {
      displayNameEl.textContent = this.profile.display_name || this.profile.name || 'Usuario Nostr';
    }
  }

  relayRequest(relay, request) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(relay);
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Timeout'));
      }, 10000);

      ws.onopen = () => {
        ws.send(JSON.stringify(request));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        clearTimeout(timeout);
        ws.close();
        resolve(data);
      };

      ws.onerror = (err) => {
        clearTimeout(timeout);
        reject(err);
      };
    });
  }

  relayQuery(relay, filters) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(relay);
      const results = [];
      const subscriptionId = Math.random().toString(36).substring(2, 10);
      const timeout = setTimeout(() => {
        ws.close();
        resolve(results);
      }, 10000);

      ws.onopen = () => {
        ws.send(JSON.stringify(['REQ', subscriptionId, filters]));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data[0] === 'EVENT' && data[1] === subscriptionId) {
          results.push(data[2]);
        } else if (data[0] === 'EOSE') {
          clearTimeout(timeout);
          ws.send(JSON.stringify(['CLOSE', subscriptionId]));
          ws.close();
          resolve(results);
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Connection failed'));
      };
    });
  }

  relayPublish(relay, event) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(relay);
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Timeout'));
      }, 15000);

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

  async fetchProfile() {
    if (!this.pubkey) return;
    
    try {
      const events = await this.query({
        kinds: [0],
        authors: [this.pubkey],
        limit: 1
      });

      if (events.length > 0) {
        const content = JSON.parse(events[0].content);
        this.profile = content;
        this.showUserInfo();
      }
    } catch (err) {
      console.warn('No se pudo obtener perfil:', err.message);
    }
  }

  async publish(kind, content, tags = []) {
    if (!this.pubkey) {
      throw new Error('No conectado a Nostr');
    }

    const event = {
      kind,
      pubkey: this.pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: typeof content === 'object' ? JSON.stringify(content) : content
    };

    let signed;
    if (this.nip07 && window.nostr && window.nostr.signEvent) {
      signed = await window.nostr.signEvent(event);
    } else {
      if (!this.sk) {
        throw new Error('No conectado a Nostr');
      }
      signed = finalizeEvent(event, this.sk);
    }
    
    const results = [];
    for (const relay of RELAYS) {
      try {
        await this.relayPublish(relay, signed);
        results.push({ relay, success: true });
      } catch (err) {
        console.warn(`No se pudo publicar a ${relay}`);
      }
    }
    
    if (results.length === 0) {
      throw new Error('No se pudo publicar a ningún relay');
    }
    
    return signed;
  }

  async query(filters) {
    const results = [];
    const seen = new Set();

    for (const relay of RELAYS) {
      try {
        const events = await this.relayQuery(relay, filters);
        for (const event of events) {
          if (!seen.has(event.id)) {
            seen.add(event.id);
            results.push(event);
          }
        }
      } catch (err) {
        console.warn(`Failed to query ${relay}:`, err.message);
      }
    }

    return results;
  }

  disconnect() {
    this.pubkey = null;
    this.npub = null;
    this.sk = null;
    this.profile = null;
    this.clearSession();
    this.render();
  }

  showError(message) {
    const status = document.getElementById('nostr-status');
    const output = document.getElementById('nostr-output');
    
    this.updateStatus('❌ Error', 'disconnected');
    output.textContent = '❌ ' + message;
    output.className = 'output show error';
  }

  updateStatus(text, className) {
    const status = document.getElementById('nostr-status');
    if (status) {
      status.textContent = text;
      status.className = `status ${className}`;
    }
  }

  truncateNpub(npub) {
    if (!npub) return '';
    return `${npub.slice(0, 12)}...${npub.slice(-8)}`;
  }
}

export default NostrConnect;
