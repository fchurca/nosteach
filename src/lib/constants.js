export const DEFAULT_RELAYS = [
  'wss://nos.lol',
  'wss://purplepag.es',
  'wss://relay.snort.social',
  'wss://inbox.nostr.wine',
  'wss://filter.nostr.wine'
];

const params = new URLSearchParams(window.location.search);
if (params.has('debug')) {
  if (params.get('debug') === 'true') {
    localStorage.setItem('debug', 'true');
  } else {
    localStorage.removeItem('debug');
  }
}
export const DEBUG = localStorage.getItem('debug') === 'true';

export const PRECIOS = [
  { label: 'Gratis', value: 0 },
  { label: '21 sats', value: 21 },
  { label: '69 sats', value: 69 },
  { label: '210 sats', value: 210 },
  { label: '690 sats', value: 690 },
  { label: '2,100 sats', value: 2100 },
  { label: 'Custom', value: null }
];

export const KINDS = {
  CURSO: 30078,
  EVALUACION: 1
};

export const TAGS = {
  CURSO_PREFIX: 'nosteach-curso-',
  EVALUACION: 'nosteach-evaluacion',
  PLATFORM: 'nosteach'
};

export const SATS_MAX = 2100000000000000; // 21M BTC en sats

export const NIP46_TIMEOUT = 120000; // 2 minutos para Nostr Connect
