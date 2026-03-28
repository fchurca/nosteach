import { nip19 } from 'nostr-tools';
import { getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import { DEBUG } from './constants.js';

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

class NostrConnect {
  constructor() {
    this.pubkey = null;
    this.npub = null;
    this.sk = null;
    this.profile = null;
    this.nip07 = false;
  }

  hasNip07() {
    return typeof window !== 'undefined' && window.nostr && typeof window.nostr.getPublicKey === 'function';
  }

  async connectNip07() {
    if (!this.hasNip07()) {
      throw new Error('No se detectó extensión de Nostr. Instalá Alby, nos2x u otra extensión.');
    }

    const pubkey = await window.nostr.getPublicKey();
    this.pubkey = pubkey;
    this.npub = nip19.npubEncode(pubkey);
    this.nip07 = true;
    this.sk = null;

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

    localStorage.setItem(SESSION_KEYS.sk, Array.from(this.sk).join(','));
    localStorage.setItem(SESSION_KEYS.pubkey, this.pubkey);
    localStorage.setItem(SESSION_KEYS.npub, this.npub);
    localStorage.removeItem('nostr_method');

    return { pubkey: this.pubkey, npub: this.npub };
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

        localStorage.setItem(SESSION_KEYS.pubkey, currentPubkey);
        localStorage.setItem(SESSION_KEYS.npub, this.npub);

        return { pubkey: this.pubkey, npub: this.npub };
      } catch (err) {
        console.error('Error restoring NIP-07 session:', err);
        this.clearSession();
        return null;
      }
    } else if (savedSk && savedPubkey) {
      try {
        this.sk = new Uint8Array(savedSk.split(',').map(Number));
        this.pubkey = savedPubkey;
        this.npub = savedNpub || nip19.npubEncode(savedPubkey);
        this.nip07 = false;

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
    this.clearSession();
  }

  clearSession() {
    localStorage.removeItem(SESSION_KEYS.sk);
    localStorage.removeItem(SESSION_KEYS.pubkey);
    localStorage.removeItem(SESSION_KEYS.npub);
    localStorage.removeItem('nostr_method');
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
    if (this.nip07 && window.nostr && window.nostr.signEvent) {
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
      throw new Error('No se pudo publicar a ningún relay');
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
