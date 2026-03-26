import QRCode from 'qrcode';

export const ZAP_AMOUNTS = [21, 69, 210, 690];

export function formatAuthorName(name, pubkey) {
  if (!pubkey) return 'Unknown';
  const shortPubkey = pubkey.length > 16 
    ? `${pubkey.slice(0, 4)}...${pubkey.slice(-4)}`
    : pubkey;
  
  if (name) {
    return `${name} (${shortPubkey})`;
  }
  return `npub (${shortPubkey})`;
}

export function isWebLNAvailable() {
  return typeof window !== 'undefined' && !!window.webln;
}

export async function initWebLN() {
  if (!isWebLNAvailable()) {
    throw new Error('WebLN no disponible. Necesitás instalar Alby u otra wallet WebLN.');
  }
  await window.webln.enable();
  return window.webln;
}

export async function fetchProfile(pubkey, relays = []) {
  const defaultRelays = [
    'wss://nos.lol',
    'wss://purplepag.es',
    'wss://relay.snort.social',
    'wss://inbox.nostr.wine',
    'wss://filter.nostr.wine'
  ];
  const relayList = relays.length > 0 ? relays : defaultRelays;
  
  const { getNDK } = await import('./nostr.js');
  const ndk = getNDK();
  
  try {
    const events = await ndk.query({
      kinds: [0],
      authors: [pubkey],
      limit: 1
    });
    
    if (events.length > 0) {
      return JSON.parse(events[0].content);
    }
  } catch (err) {
    console.warn('Error fetching profile:', err);
  }
  
  return null;
}

export function getLud16(profile) {
  if (!profile) return null;
  return profile.lud16 || profile.lnurl || null;
}

export function getLud16FromBech32(bech32String) {
  if (!bech32String) return null;
  if (bech32String.includes('@')) return bech32String;
  
  try {
    const match = bech32String.match(/lnurl([a-z0-9]+)/i);
    if (match) {
      return match[0];
    }
  } catch (err) {}
  
  return null;
}

async function decodeLnurl(lnurlString) {
  const url = new URL(lnurlString);
  const params = new URLSearchParams(url.search);
  
  if (params.has('lightning')) {
    return params.get('lightning');
  }
  
  if (url.hostname.includes('lnurl')) {
    const wellknownUrl = `${url.origin}/.well-known/lnurlp/${url.username}`;
    const response = await fetch(wellknownUrl);
    if (!response.ok) {
      throw new Error('No se pudo obtener información de LNURL');
    }
    const data = await response.json();
    return data;
  }
  
  return null;
}

export async function getLnurlpInfo(lud16) {
  if (!lud16) {
    throw new Error('No se proporcionó Lightning Address');
  }
  
  const [username, domain] = lud16.split('@');
  const url = `https://${domain}/.well-known/lnurlp/${username}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`LNURL no disponible en ${domain}`);
    }
    return await response.json();
  } catch (err) {
    throw new Error(`Error al obtener LNURL: ${err.message}`);
  }
}

export async function generateInvoice(lud16, amountSats, comment = '') {
  const lnurlpInfo = await getLnurlpInfo(lud16);
  
  const maxSendable = lnurlpInfo.maxSendable || 2100000000000;
  const minSendable = lnurlpInfo.minSendable || 1;
  const amountMsats = amountSats * 1000;
  
  if (amountMsats < minSendable) {
    throw new Error(`Monto mínimo: ${Math.ceil(minSendable / 1000)} sats`);
  }
  
  if (amountMsats > maxSendable) {
    throw new Error(`Monto máximo: ${Math.floor(maxSendable / 1000)} sats`);
  }
  
  const callbackUrl = new URL(lnurlpInfo.callback);
  callbackUrl.searchParams.set('amount', amountMsats);
  
  if (comment && lnurlpInfo.commentAllowed > 0) {
    const truncatedComment = comment.slice(0, lnurlpInfo.commentAllowed);
    callbackUrl.searchParams.set('comment', truncatedComment);
  }
  
  try {
    const response = await fetch(callbackUrl.toString());
    if (!response.ok) {
      throw new Error('Error al generar invoice');
    }
    
    const data = await response.json();
    
    if (data.successAction) {
      console.log('[generateInvoice] Success action:', data.successAction);
    }
    
    if (data.status === 'ERROR') {
      throw new Error(data.reason || 'Error desconocido del servidor LNURL');
    }
    
    const paymentHash = extractPaymentHash(data.pr);
    console.log('[generateInvoice] Payment hash extracted:', paymentHash);
    
    let verifyUrl = null;
    if (lnurlpInfo.verify) {
      verifyUrl = `${lnurlpInfo.verify}${paymentHash}`;
    } else if (lnurlpInfo.callback) {
      const callbackBase = lnurlpInfo.callback.replace(/\/$/, '');
      verifyUrl = `${callbackBase}/verify/${paymentHash}`;
    }
    console.log('[generateInvoice] Verify URL:', verifyUrl);
    
    return {
      invoice: data.pr,
      successAction: data.successAction || null,
      disposable: data.disposable || false,
      paymentHash: paymentHash,
      verifyUrl: verifyUrl
    };
  } catch (err) {
    if (err.message.includes('Error al obtener')) throw err;
    throw new Error(`Error generando invoice: ${err.message}`);
  }
}

function extractPaymentHash(invoice) {
  try {
    const match = invoice.match(/^ln[a-z0-9]+1([a-z0-9]+)/);
    if (match && match[1]) {
      const data = match[1];
      const decoded = bech32ToHex(data.slice(0, 104));
      return decoded || null;
    }
  } catch (e) {
    console.warn('Could not extract payment hash:', e);
  }
  return null;
}

function bech32ToHex(bech32String) {
  const bech32Chars = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  let bits = [];
  for (let i = 0; i < bech32String.length; i++) {
    const charIndex = bech32Chars.indexOf(bech32String[i].toLowerCase());
    if (charIndex === -1) return null;
    bits.push(charIndex);
  }
  
  let hex = '';
  let bitsBuffer = 0;
  let bitsCount = 0;
  for (let i = 0; i < bits.length; i++) {
    bitsBuffer = (bitsBuffer << 5) | bits[i];
    bitsCount += 5;
    while (bitsCount >= 4) {
      bitsCount -= 4;
      hex += ((bitsBuffer >> bitsCount) & 0xF).toString(16);
    }
  }
  return hex;
}

export async function sendPayment(invoice) {
  const webln = await initWebLN();
  
  try {
    const result = await webln.sendPayment(invoice);
    return {
      success: true,
      preimage: result.preimage,
      paymentHash: result.rHash
    };
  } catch (err) {
    if (err.message.includes('User rejected') || err.message.includes('cancelled')) {
      throw new Error('Pago cancelado por el usuario');
    }
    throw new Error(`Error en el pago: ${err.message}`);
  }
}

export async function generateQRCode(data) {
  try {
    const qrDataUrl = await QRCode.toDataURL(data, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
    return qrDataUrl;
  } catch (err) {
    throw new Error(`Error generando QR: ${err.message}`);
  }
}

export async function zapUser(pubkey, amountSats, comment = '', relays = []) {
  const profile = await fetchProfile(pubkey, relays);
  const lud16 = getLud16(profile);
  
  if (!lud16) {
    throw new Error('Este usuario no tiene Lightning configurado');
  }
  
  const { invoice } = await generateInvoice(lud16, amountSats, comment);
  const result = await sendPayment(invoice);
  
  return {
    ...result,
    lud16,
    recipientProfile: profile
  };
}

import { DEFAULT_RELAYS } from './constants.js';

export class InvoiceTracker {
  constructor(invoice, onStatusChange, options = {}) {
    this.invoice = invoice;
    this.onStatusChange = onStatusChange;
    this.status = 'pending';
    this.intervalId = null;
    this.timeoutId = null;
    this.checkCount = 0;
    this.paymentHash = options.paymentHash || null;
    this.recipientPubkey = options.recipientPubkey || null;
    this.relays = options.relays || DEFAULT_RELAYS;
    this.verifyUrl = options.verifyUrl || null;
    this.wsConnections = [];
  }
  
  start(pollIntervalMs = 5000, maxDurationMs = 600000) {
    console.log('[InvoiceTracker] start() called with interval:', pollIntervalMs, 'ms');
    this.setStatus('pending');
    
    this.pollIntervalMs = pollIntervalMs;
    
    console.log('[InvoiceTracker] Setting up setInterval for checkStatus every', pollIntervalMs, 'ms');
    this.intervalId = setInterval(() => {
      console.log('[InvoiceTracker] setInterval triggered, calling checkStatus');
      this.checkStatus();
    }, pollIntervalMs);
    
    console.log('[InvoiceTracker] intervalId:', this.intervalId);
    this.subscribeToNostr();
    
    this.timeoutId = setTimeout(() => {
      this.stop();
      if (this.status !== 'paid' && this.status !== 'failed') {
        this.setStatus('expired');
      }
    }, maxDurationMs);
    
    return this;
  }
  
  subscribeToNostr() {
    if (!this.paymentHash && !this.recipientPubkey) {
      console.log('[InvoiceTracker] No paymentHash or recipientPubkey, skipping Nostr subscription');
      return;
    }
    
    console.log('[InvoiceTracker] Starting Nostr subscription for zap receipts...');
    
    const filters = { kinds: [9735] };
    
    if (this.paymentHash) {
      filters['#h'] = [this.paymentHash];
    }
    
    if (this.recipientPubkey) {
      filters['#p'] = [this.recipientPubkey];
    }
    
    console.log('[InvoiceTracker] Nostr filter:', filters);
    
    for (const relay of this.relays) {
      try {
        const ws = new WebSocket(relay);
        const subId = `zap-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        
        this.wsConnections.push({ ws, subId, relay });
        
        ws.onopen = () => {
          ws.send(JSON.stringify(['REQ', subId, filters]));
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[InvoiceTracker] Relay message:', data[0], 'from', relay);
            if (data[0] === 'EVENT' && data[1] === subId) {
              const zapReceipt = data[2];
              console.log('[InvoiceTracker] Zap receipt received!', zapReceipt.id, 'kind:', zapReceipt.kind);
              this.handleZapReceipt(zapReceipt);
            } else if (data[0] === 'EOSE') {
              console.log('[InvoiceTracker] EOSE from', relay);
            }
          } catch (e) {
            console.log('[InvoiceTracker] Message parse error:', e.message);
          }
        };
        
        ws.onerror = (e) => {
          console.log('[InvoiceTracker] WS error from', relay);
        };
        
        ws.onclose = (e) => {
          console.log('[InvoiceTracker] WS closed from', relay, e.code);
        };
        
      } catch (e) {
        console.warn('[InvoiceTracker] Failed to connect to relay:', relay);
      }
    }
  }
  
  handleZapReceipt(zapReceipt) {
    if (this.status === 'paid' || this.status === 'failed') return;
    
    const amountTag = zapReceipt.tags.find(t => t[0] === 'amount');
    const amount = amountTag ? parseInt(amountTag[1], 10) : 0;
    
    console.log('[InvoiceTracker] Payment detected via Nostr!', amount, 'sats');
    this.setStatus('paid', {
      zapReceiptId: zapReceipt.id,
      amount,
      preimage: zapReceipt.description
    });
    this.stop();
  }
  
  async checkStatus() {
    console.log('[InvoiceTracker] checkStatus() executed, attempt:', this.checkCount);
    this.checkCount++;
    
    if (this.status === 'paid' || this.status === 'failed' || this.status === 'expired') {
      this.stop();
      return;
    }
    
    console.log(`[InvoiceTracker] Checking invoice status... (attempt ${this.checkCount})`);
    
    if (!this.paymentHash) {
      this.paymentHash = this.extractPaymentHashFromInvoice();
      console.log('[InvoiceTracker] Extracted payment hash in checkStatus:', this.paymentHash);
    }
    
    if (this.paymentHash) {
      console.log('[InvoiceTracker] Calling checkWithExternalAPI');
      const externalResult = await this.checkWithExternalAPI();
      if (externalResult === 'paid') {
        this.setStatus('paid', { paymentHash: this.paymentHash });
        this.stop();
        return;
      } else if (externalResult === 'expired') {
        this.setStatus('expired');
        this.stop();
        return;
      }
    }
    
    if (this.verifyUrl) {
      console.log('[InvoiceTracker] Calling checkWithLnurlp');
      const lnurlpResult = await this.checkWithLnurlp();
      if (lnurlpResult === 'paid') {
        this.setStatus('paid', { via: 'lnurlp' });
        this.stop();
        return;
      } else if (lnurlpResult === 'expired') {
        this.setStatus('expired');
        this.stop();
        return;
      }
    }
    
    try {
      if (isWebLNAvailable()) {
        console.log('[InvoiceTracker] WebLN available, checking...');
        await window.webln.enable();
        const webln = window.webln;
        
        if (webln.lookupInvoice) {
          try {
            const invoiceData = await webln.lookupInvoice(this.invoice);
            console.log('[InvoiceTracker] lookupInvoice result:', invoiceData);
            if (invoiceData) {
              if (invoiceData.state === 'settled') {
                this.setStatus('paid', invoiceData);
                this.stop();
                return;
              } else if (invoiceData.state === 'expired') {
                this.setStatus('expired');
                this.stop();
                return;
              }
            }
          } catch (e) {
            console.warn('[InvoiceTracker] lookupInvoice error:', e.message);
          }
        }
        
        if (webln.listPayments) {
          try {
            const payments = await webln.listPayments();
            console.log('[InvoiceTracker] listPayments result:', payments?.length, 'payments');
            const paidPayment = payments?.find(p => 
              p.invoice === this.invoice || 
              p.paymentHash === this.paymentHash ||
              p.paymentHash === this.getPaymentHash()
            );
            if (paidPayment && paidPayment.status === 'complete') {
              this.setStatus('paid', paidPayment);
              this.stop();
              return;
            }
          } catch (e) {
            console.warn('[InvoiceTracker] listPayments error:', e.message);
          }
        }
      } else {
        console.log('[InvoiceTracker] WebLN not available, skipping WebLN checks');
      }
    } catch (err) {
      console.warn('Error checking invoice status:', err);
    }
    
    console.log(`[InvoiceTracker] No payment detected yet, will retry in ${this.pollIntervalMs}ms`);
  }
  
  extractPaymentHashFromInvoice() {
    try {
      const match = this.invoice.match(/^ln[a-z0-9]{1,1111}1([a-z0-9]{6,})/);
      console.log('[InvoiceTracker] Invoice regex match:', match ? 'yes' : 'no');
      if (match && match[1]) {
        const data = match[1];
        console.log('[InvoiceTracker] Data part length:', data.length);
        const sliced = data.slice(0, 104);
        console.log('[InvoiceTracker] Sliced data:', sliced.length);
        const decoded = bech32ToHex(sliced);
        console.log('[InvoiceTracker] Decoded hex:', decoded);
        if (decoded && decoded.length >= 64) {
          return decoded.slice(0, 64);
        }
      }
    } catch (e) {
      console.warn('[InvoiceTracker] Could not extract payment hash:', e);
    }
    return null;
  }
  
  async checkWithExternalAPI() {
    return null;
  }
  
  async checkWithLnurlp() {
    if (!this.verifyUrl || !this.invoice) return null;
    
    let fetchUrl = this.verifyUrl;
    let useProxy = false;
    let proxyHash = null;
    let proxyProvider = 'getalby';
    let isPrimal = false;
    
    try {
      const urlObj = new URL(this.verifyUrl);
      const hostname = urlObj.hostname;
      
      if (hostname.includes('primal')) {
        console.log('[InvoiceTracker] Primal verify not supported, relying on Nostr zap receipts');
        return null;
      }
      
      if (urlObj.origin !== window.location.origin) {
        useProxy = true;
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        const hash = pathParts[pathParts.length - 1];
        if (hash && /^[a-fA-F0-9]{64}$/.test(hash)) {
          proxyHash = hash;
          if (hostname.includes('getalby')) proxyProvider = 'getalby';
          else if (hostname.includes('lnurl.social')) proxyProvider = 'lnurlsocial';
          fetchUrl = `/api/verify?hash=${proxyHash}&provider=${proxyProvider}`;
          console.log('[InvoiceTracker] Using proxy:', fetchUrl);
        }
      }
    } catch (e) {
      console.warn('[InvoiceTracker] Could not parse verifyUrl:', e);
    }
    
    if (!useProxy) {
      fetchUrl = this.verifyUrl;
    }
    
    try {
      console.log('[InvoiceTracker] Attempting fetch to verifyUrl:', fetchUrl);
      const response = await fetch(fetchUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        cache: 'no-cache'
      });
      
      console.log('[InvoiceTracker] Fetch response status:', response.status, 'ok:', response.ok);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[InvoiceTracker] LNURLp verify result keys:', Object.keys(data));
        
        if (data.status === 'OK') {
          if (data.paid === true) {
            console.log('[InvoiceTracker] Invoice PAID via LNURLp (paid=true)!');
            return 'paid';
          }
          
          if (data.preimage) {
            console.log('[InvoiceTracker] Invoice PAID via LNURLp (has preimage)!');
            return 'paid';
          }
          
          if (data.successAction && data.successAction.tag === 'preimage') {
            console.log('[InvoiceTracker] Invoice PAID via LNURLp (successAction)!');
            return 'paid';
          }
          
          if (data.pr && data.pr !== this.invoice) {
            console.log('[InvoiceTracker] New invoice returned - old one was likely paid');
            const newHash = extractPaymentHash(data.pr);
            if (newHash && newHash !== this.paymentHash) {
              console.log('[InvoiceTracker] Invoice changed, considering paid');
              return 'paid';
            }
          }
        }
        
        if (data.status === 'ERROR') {
          console.warn('[InvoiceTracker] LNURLp error response:', data.reason);
          if (data.reason?.includes('expired')) {
            return 'expired';
          }
        }
      } else {
        console.warn('[InvoiceTracker] Fetch response not OK, status:', response.status, 'text:', response.statusText);
      }
    } catch (e) {
      console.error('[InvoiceTracker] LNURLp check error during fetch:', e);
    }
    
    return null;
  }
  
  getPaymentHash() {
    try {
      const parts = this.invoice.split('1');
      if (parts.length > 1) {
        const dataPart = parts[1].slice(0, 6);
        return dataPart;
      }
    } catch (err) {}
    return null;
  }
  
  setStatus(status, data = null) {
    if (this.status !== status) {
      this.status = status;
      if (this.onStatusChange) {
        this.onStatusChange(status, data);
      }
    }
  }
  
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    
    for (const { ws, subId } of this.wsConnections) {
      try {
        ws.send(JSON.stringify(['CLOSE', subId]));
        ws.close();
      } catch (e) {}
    }
    this.wsConnections = [];
  }
}

if (typeof window !== 'undefined') {
  window.InvoiceTracker = InvoiceTracker;
}
