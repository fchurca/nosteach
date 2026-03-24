import NDK from '@nostr-dev-kit/ndk';
import { DEFAULT_RELAYS } from './constants.js';

let ndk = null;
let signer = null;

export function initNDK(relays = DEFAULT_RELAYS) {
  ndk = new NDK({
    explicitRelayUrls: relays
  });
  return ndk;
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
