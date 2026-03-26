import NDK from '@nostr-dev-kit/ndk';
import { DEFAULT_RELAYS } from './constants.js';

let ndk = null;
let signer = null;
let connectionStatus = 'idle';
let connectedCount = 0;
let statusCallbacks = [];

export function initNDK(relays = DEFAULT_RELAYS) {
  ndk = new NDK({
    explicitRelayUrls: relays
  });
  ndk.pool.on('connect', (relay) => {
    connectedCount++;
    updateStatus('connected');
  });
  ndk.pool.on('disconnect', (relay) => {
    connectedCount = Math.max(0, connectedCount - 1);
    if (connectedCount === 0) {
      updateStatus('disconnected');
    }
  });
  ndk.pool.on('error', (relay, err) => {
    if (connectedCount === 0) {
      updateStatus('error');
    }
  });
  return ndk;
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
  if (!ndk) {
    initNDK();
  }
  return ndk;
}

export async function connect() {
  const instance = getNDK();
  await instance.connect();
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

export async function queryEvents(filters) {
  const instance = getNDK();
  
  try {
    const events = await instance.query(filters);
    return events;
  } catch (err) {
    console.error('Error querying events:', err);
    throw err;
  }
}

export function setSigner(newSigner) {
  signer = newSigner;
  getNDK().signer = newSigner;
}

export function getSigner() {
  return signer;
}
