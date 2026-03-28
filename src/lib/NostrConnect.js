import { nip19 } from 'nostr-tools';
import { getPublicKey, finalizeEvent, generateSecretKey } from 'nostr-tools/pure';
import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46';
import { SimplePool } from 'nostr-tools/pool';
import { DEBUG, DEFAULT_RELAYS } from './constants.js';

const RELAYS = DEFAULT_RELAYS;

const SESSION_KEYS = {
  sk: 'nostr_sk',
  pubkey: 'nostr_pubkey',
  npub: 'nostr_npub'
};

let NDK = null;
let NDKNip46Signer = null;
let NDKPrivateKeySigner = null;
let ndkInstance = null;
let ndkLoading = null;

async function getNDK() {
  if (ndkInstance) return ndkInstance;
  if (ndkLoading) return ndkLoading;
  
  ndkLoading = (async () => {
    try {
      const ndkModule = await import('@nostr-dev-kit/ndk');
      
      NDK = ndkModule.default || ndkModule.NDK;
      NDKNip46Signer = ndkModule.NDKNip46Signer;
      NDKPrivateKeySigner = ndkModule.NDKPrivateKeySigner;
      
      console.log('[NostrConnect] NDK:', typeof NDK, 'NDKNip46Signer:', typeof NDKNip46Signer);
      
      if (!NDK) {
        throw new Error('NDK not found in module');
      }
      
      ndkInstance = new NDK({ explicitRelayUrls: RELAYS });
      ndkInstance.connect();
      return ndkInstance;
    } catch (err) {
      console.error('[NostrConnect] Failed to load NDK:', err);
      ndkLoading = null;
      throw err;
    }
  })();
  
  return ndkLoading;
}

class NostrConnect {
  constructor() {
    this.pubkey = null;
    this.npub = null;
    this.sk = null;
    this.profile = null;
    this.nip07 = false;
    this.authMethod = null;
    this.signer = null;
    this.ndk = null;
    this.bunkerUrl = null;
    this.nostrConnectUri = null;
    this.clientSecret = null;
    this.onLogout = null;
    this.onLogin = null;
    this._isTabSync = false;

    // Sync across tabs
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        // Only handle events from OTHER tabs (newValue exists)
        if (!e.newValue) return;
        
        console.log('[NostrConnect] Storage event from another tab:', e.key, 'newValue:', e.newValue);
        if (e.key === SESSION_KEYS.pubkey) {
          if (e.newValue) {
            // Login in another tab - restore session
            console.log('[NostrConnect] Login detected in another tab, pubkey:', e.newValue, 'this.pubkey:', this.pubkey);
            if (!this.pubkey || this.pubkey !== e.newValue) {
              this._isTabSync = true; // Mark as tab sync to avoid loops
              this.restoreSession().then((result) => {
                console.log('[NostrConnect] restoreSession result:', result, 'pubkey:', this.pubkey, 'onLogin:', !!this.onLogin);
                if (result && this.pubkey && this.onLogin) {
                  this.onLogin(this.pubkey, this);
                }
                this._isTabSync = false;
              }).catch((err) => {
                console.error('[NostrConnect] restoreSession error:', err);
                this._isTabSync = false;
              });
            }
          } else {
            // Logout in another tab
            console.log('[NostrConnect] Logout detected in another tab, current pubkey:', this.pubkey);
            if (this.pubkey) {
              const npub = this.npub;
              this.disconnect();
              console.log('[NostrConnect] Disconnected, calling onLogout:', !!this.onLogout);
              if (this.onLogout) {
                this.onLogout(npub);
              }
            }
          }
        }
      });
    }
  }

  get currentPubkey() {
    return this.pubkey || localStorage.getItem(SESSION_KEYS.pubkey);
  }

  get currentNpub() {
    return this.npub || localStorage.getItem(SESSION_KEYS.npub);
  }

  hasNip07() {
    return typeof window !== 'undefined' && window.nostr && typeof window.nostr.getPublicKey === 'function';
  }

  async connectNip07() {
    if (!this.hasNip07()) {
      throw new Error('No se detectï¿½ extensiï¿½n de Nostr. Instalï¿½ Alby, nos2x u otra extensiï¿½n.');
    }

    const pubkey = await window.nostr.getPublicKey();
    this.pubkey = pubkey;
    this.npub = nip19.npubEncode(pubkey);
    this.nip07 = true;
    this.authMethod = 'nip07';
    this.sk = null;
    this.signer = null;
    this.profile = null;

    localStorage.setItem(SESSION_KEYS.pubkey, pubkey);
    localStorage.setItem(SESSION_KEYS.npub, this.npub);
    localStorage.setItem('nostr_method', 'nip07');

    return { pubkey: this.pubkey, npub: this.npub };
  }

  async connectNsec(nsec) {
    if (!nsec.startsWith('nsec')) {
      throw new Error('La nsec debe empezar con "nsec1"');
    }

    const decoded = nip19.decode(nsec);
    this.sk = decoded.data;
    this.pubkey = getPublicKey(this.sk);
    this.npub = nip19.npubEncode(this.pubkey);
    this.nip07 = false;
    this.authMethod = 'nsec';
    this.signer = null;
    this.profile = null;

    localStorage.setItem(SESSION_KEYS.sk, Array.from(this.sk).join(','));
    localStorage.setItem(SESSION_KEYS.pubkey, this.pubkey);
    localStorage.setItem(SESSION_KEYS.npub, this.npub);
    localStorage.removeItem('nostr_method');

    return { pubkey: this.pubkey, npub: this.npub };
  }

  async connectBunker(bunkerUrl, clientSecret = null) {
    // Manual parse of bunker URL
    let pubkey, relays = [], secret = null;
    
    try {
      const url = new URL(bunkerUrl);
      pubkey = url.hostname || url.pathname.replace(/^\/\//, '');
      relays = url.searchParams.getAll('relay');
      secret = url.searchParams.get('secret');
    } catch (e) {
      // Try parseBunkerInput as fallback
      const bunkerPointer = await parseBunkerInput(bunkerUrl);
      if (!bunkerPointer) {
        throw new Error('URL de bunker inválida');
      }
      pubkey = bunkerPointer.pubkey;
      relays = bunkerPointer.relays || [];
      secret = bunkerPointer.secret;
    }

    // Use only relays from bunker URL - dedupe
    relays = [...new Set(relays)];
    
    if (relays.length === 0) {
      throw new Error('No hay relays en la URL del bunker');
    }

    const localSecret = generateSecretKey();
    const pool = new SimplePool();
    
    const bunkerPointer = { pubkey, relays, secret };
    const bunkerSigner = BunkerSigner.fromBunker(localSecret, bunkerPointer, { pool });
    
    try {
      await Promise.race([
        bunkerSigner.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 30000))
      ]);
    } catch (err) {
      if (err.message.includes('timeout')) {
        throw new Error('Tiempo de espera agotado. ¿Aprobaste la conexión en tu bunker?');
      }
      throw err;
    }
    
    this.signer = bunkerSigner;
    this.pubkey = await bunkerSigner.getPublicKey();
    this.npub = nip19.npubEncode(this.pubkey);
    this.authMethod = 'nip46';
    this.profile = null;

    localStorage.setItem(SESSION_KEYS.pubkey, this.pubkey);
    localStorage.setItem(SESSION_KEYS.npub, this.npub);
    localStorage.setItem('nostr_method', 'nip46');
    localStorage.setItem('nostr_bunker_url', bunkerUrl);
    localStorage.setItem('nostr_client_secret', clientSecret);

    return { pubkey: this.pubkey, npub: this.npub };
  }

  async startNostrConnect() {
    const localSecret = generateSecretKey();
    const clientPubkey = getPublicKey(localSecret);
    const secretHex = Array.from(localSecret).map(b => b.toString(16).padStart(2, '0')).join('');
    
    let uri = `nostrconnect://${clientPubkey}?secret=${secretHex}&name=NosTeach`;
    for (const relay of DEFAULT_RELAYS) {
      uri += `&relay=${encodeURIComponent(relay)}`;
    }
    
    this.nostrConnectUri = uri;
    this.clientSecret = secretHex;
    
    return this.nostrConnectUri;
  }

  async waitForNostrConnectApproval(timeout = 30000) {
    const uri = this.nostrConnectUri;
    if (!uri) {
      throw new Error('No se inició sesión de Nostr Connect');
    }

    // Generate same local key that was used to create the URI
    const secretHex = this.clientSecret;
    const secretBytes = new Uint8Array(secretHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const pool = new SimplePool();
    
    // Parse the URI to get client pubkey and relays
    const url = new URL(uri);
    const clientPubkey = url.pathname.replace(/^\/\//, '');
    const relays = url.searchParams.getAll('relay');
    
    // Use nostr-tools BunkerSigner.fromURI
    const signer = await BunkerSigner.fromURI(secretBytes, uri, { pool });

    try {
      this.signer = signer;
      this.pubkey = await signer.getPublicKey();
      this.npub = nip19.npubEncode(this.pubkey);
      this.authMethod = 'nip46';

      localStorage.setItem(SESSION_KEYS.pubkey, this.pubkey);
      localStorage.setItem(SESSION_KEYS.npub, this.npub);
      localStorage.setItem('nostr_method', 'nip46');
      localStorage.setItem('nostr_client_secret', this.clientSecret);

      return { pubkey: this.pubkey, npub: this.npub };
    } catch (err) {
      throw new Error('Error en Nostr Connect: ' + err.message);
    }
  }

  generateClientSecret() {
    const array = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(array);
    } else {
      for (let i = 0; i < 32; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async findWorkingRelay(relays) {
    const testRelay = (relay) => {
      return new Promise((resolve) => {
        try {
          const ws = new WebSocket(relay);
          const timer = setTimeout(() => { ws.close(); resolve(false); }, 3000);
          ws.onopen = () => { clearTimeout(timer); ws.close(); resolve(relay); };
          ws.onerror = () => { clearTimeout(timer); resolve(false); };
        } catch { resolve(false); }
      });
    };
    
    const results = await Promise.all(relays.map(r => testRelay(r)));
    return results.find(r => r !== false) || null;
  }

  withTimeout(promise, ms, errorMessage) {
    let timeout;
    const timeoutPromise = new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(errorMessage)), ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
  }

  async restoreSession() {
    const savedSk = localStorage.getItem(SESSION_KEYS.sk);
    const savedPubkey = localStorage.getItem(SESSION_KEYS.pubkey);
    const savedNpub = localStorage.getItem(SESSION_KEYS.npub);
    const savedMethod = localStorage.getItem('nostr_method');

    if (savedMethod === 'nip07' && savedPubkey) {
      if (!this.hasNip07()) {
        this.clearSession();
        return null;
      }
      try {
        const currentPubkey = await window.nostr.getPublicKey();

        if (savedPubkey && savedPubkey !== currentPubkey) {
          this.clearSession();
          return null;
        }

        this.pubkey = currentPubkey;
        this.npub = nip19.npubEncode(currentPubkey);
        this.nip07 = true;
        this.authMethod = 'nip07';

        localStorage.setItem(SESSION_KEYS.pubkey, currentPubkey);
        localStorage.setItem(SESSION_KEYS.npub, this.npub);

        return { pubkey: this.pubkey, npub: this.npub };
      } catch (err) {
        console.error('Error restoring NIP-07 session:', err);
        this.clearSession();
        return null;
      }
    } else if (savedMethod === 'nip46') {
      const bunkerUrl = localStorage.getItem('nostr_bunker_url');
      const clientSecret = localStorage.getItem('nostr_client_secret');
      
      if (bunkerUrl && clientSecret) {
        try {
          await this.connectBunker(bunkerUrl, clientSecret);
          return { pubkey: this.pubkey, npub: this.npub };
        } catch (err) {
          console.error('Error restoring NIP-46 session:', err);
          this.clearSession();
          return null;
        }
      }
      this.clearSession();
      return null;
    } else if (savedSk && savedPubkey) {
      try {
        this.sk = new Uint8Array(savedSk.split(',').map(Number));
        this.pubkey = savedPubkey;
        this.npub = savedNpub || nip19.npubEncode(savedPubkey);
        this.nip07 = false;
        this.authMethod = 'nsec';

        return { pubkey: this.pubkey, npub: this.npub };
      } catch (err) {
        console.error('Error restoring session:', err);
        this.clearSession();
        return null;
      }
    }
    return null;
  }

  disconnect() {
    this.pubkey = null;
    this.npub = null;
    this.sk = null;
    this.profile = null;
    this.nip07 = false;
    this.authMethod = null;
    this.signer = null;
    this.ndk = null;
    this.bunkerUrl = null;
    this.nostrConnectUri = null;
    this.clientSecret = null;
    this.clearSession();
  }

  clearSession() {
    localStorage.removeItem(SESSION_KEYS.sk);
    localStorage.removeItem(SESSION_KEYS.pubkey);
    localStorage.removeItem(SESSION_KEYS.npub);
    localStorage.removeItem('nostr_method');
    localStorage.removeItem('nostr_bunker_url');
    localStorage.removeItem('nostr_client_secret');
    localStorage.removeItem('nostr_connect_relay');
  }

  async query(filters) {
    const promises = RELAYS.map(relay =>
      this.relayQuery(relay, filters).then(events => ({ relay, events }))
    );

    const resultsArrays = await Promise.all(promises);

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

      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(['CLOSE', subscriptionId]));
          ws.close();
        }
        resolve(results);
      }, 5000);
    });
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

    if (this.authMethod === 'nip46' && this.signer) {
      signed = await this.signer.sign(event);
    } else if (this.nip07 && window.nostr && window.nostr.signEvent) {
      signed = await window.nostr.signEvent(event);
    } else {
      if (!this.sk) {
        throw new Error('No conectado a Nostr');
      }
      signed = finalizeEvent(event, this.sk);
    }

    const publishPromises = RELAYS.map(relay =>
      this.relayPublish(relay, signed)
        .then(() => ({ relay, success: true }))
        .catch(err => ({ relay, success: false, error: err.message }))
    );

    const results = await Promise.all(publishPromises);
    const successful = results.filter(r => r.success);

    if (successful.length === 0) {
      throw new Error('No se pudo publicar a ningï¿½n relay');
    }

    return signed;
  }

  relayPublish(relay, event) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(relay);
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Timeout'));
      }, 5000);

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
    if (!this.pubkey) return null;

    try {
      const events = await this.query({
        kinds: [0],
        authors: [this.pubkey],
        limit: 1
      });

      if (events.length > 0) {
        const content = JSON.parse(events[0].content);
        this.profile = content;
        return this.profile;
      }
    } catch (err) {
      console.warn('No se pudo obtener perfil:', err.message);
    }
    return null;
  }
}

export default NostrConnect;
export { RELAYS };
