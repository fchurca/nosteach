import { SimplePool } from 'nostr-tools';
import { DEFAULT_RELAYS } from './constants.js';

let pool = null;
let signer = null;
let connectionStatus = 'idle';
let statusCallbacks = [];

export function initNDK(relays = DEFAULT_RELAYS) {
  pool = new SimplePool();
  return pool;
}

function updateStatus(newStatus) {
  connectionStatus = newStatus;
  statusCallbacks.forEach(cb => cb(newStatus));
}

export function onConnectionStatusChange(callback) {
  statusCallbacks.push(callback);
  return () => {
    statusCallbacks = statusCallbacks.filter(cb => cb !== callback);
  };
}

export function getConnectionStatus() {
  return connectionStatus;
}

export function getNDK() {
  if (!pool) {
    initNDK();
  }
  return pool;
}

export async function connect() {
  const instance = getNDK();
  updateStatus('connected');
  return instance;
}

export async function publishEvent(kind, content, tags = []) {
  const instance = getNDK();
  
  const event = {
    kind,
    content: typeof content === 'object' ? JSON.stringify(content) : content,
    tags,
    created_at: Math.floor(Date.now() / 1000)
  };

  try {
    const signedEvent = await instance.sign(event);
    await signedEvent.publish();
    return signedEvent;
  } catch (err) {
    console.error('Error publishing event:', err);
    throw err;
  }
}

export async function queryEvents(filters, timeout = 15000) {
  const instance = getNDK();
  
  try {
    const events = await instance.querySync(DEFAULT_RELAYS, filters);
    return events || [];
  } catch (err) {
    console.error('Error querying events:', err);
    return [];
  }
}

export function setSigner(newSigner) {
  signer = newSigner;
}

export function getSigner() {
  return signer;
}

export async function fetchProfile(pubkey) {
  const events = await queryEvents({ kinds: [0], authors: [pubkey], limit: 1 });
  if (events.length > 0) {
    try {
      return JSON.parse(events[0].content);
    } catch {
      return null;
    }
  }
  return null;
}
