export function formatPrice(precio) {
  return precio === 0 ? 'Gratis' : `${precio} sats`;
}

export function shortNpub(npub, prefixLen = 8, suffixLen = 8) {
  if (!npub) return '';
  return `${npub.slice(0, prefixLen)}...${npub.slice(-suffixLen)}`;
}

export function emptyState(icon, title, text, button = '') {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <p class="empty-state-title">${title}</p>
      <p class="empty-state-text">${text}</p>
      ${button}
    </div>
  `;
}

export function skeletonCard() {
  return '<div class="skeleton skeleton-card"></div>';
}

export function skeletonBox() {
  return '<div class="skeleton skeleton-box"></div>';
}

export function skeletonText() {
  return '<div class="skeleton skeleton-text"></div>';
}

export function spinner(message = 'Cargando...') {
  return `
    <div class="invoice-loading">
      <div class="spinner"></div>
      <p>${message}</p>
    </div>
  `;
}

export function showError(message, onRetry = null) {
  let html = `<div class="card"><p class="error-text">${message}</p>`;
  if (onRetry) {
    html += `<button onclick="${onRetry}" class="btn-secondary" style="margin-top:10px;">Reintentar</button>`;
  }
  html += '</div>';
  return html;
}
