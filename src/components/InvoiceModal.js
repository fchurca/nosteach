import { generateQRCode, generateInvoice, sendPayment, isWebLNAvailable, getLnurlpInfo, InvoiceTracker } from '../lib/lightning.js';

class InvoiceModal {
  constructor(options = {}) {
    this.amount = options.amount;
    this.description = options.description || 'Pago NosTeach';
    this.lud16 = options.lud16;
    this.recipientPubkey = options.recipientPubkey || null;
    this.relays = options.relays || null;
    this.onSuccess = options.onSuccess || (() => {});
    this.onError = options.onError || (() => {});
    this.onClose = options.onClose || (() => {});
    
    this.state = 'idle';
    this.invoice = null;
    this.paymentHash = null;
    this.qrDataUrl = null;
    this.tracker = null;
    this.overlay = null;
    this.countdownInterval = null;
    this.expirySeconds = 600;
    this.remainingSeconds = 600;
  }
  
  async show() {
    console.log('[InvoiceModal] show() called');
    this.createOverlay();
    await this.generateInvoiceAndShow();
    console.log('[InvoiceModal] show() completed');
  }
  
  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'invoice-modal-overlay';
    this.overlay.innerHTML = `
      <div class="invoice-modal">
        <button class="invoice-modal-close" id="invoice-close-btn" aria-label="Cerrar">&times;</button>
        <div id="invoice-content">
          <div class="invoice-loading">
            <div class="spinner"></div>
            <p>Generando invoice...</p>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(this.overlay);
    
    const closeBtn = document.getElementById('invoice-close-btn');
    closeBtn.addEventListener('click', () => this.close());
    
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    this.handleKeydown = (e) => {
      if (e.key === 'Escape') {
        this.close();
      }
    };
    document.addEventListener('keydown', this.handleKeydown);
  }
  
  async generateInvoiceAndShow() {
    console.log('[InvoiceModal] generateInvoiceAndShow called, lud16:', this.lud16, 'amount:', this.amount);
    try {
      const result = await generateInvoice(this.lud16, this.amount, this.description);
      this.invoice = result.invoice;
      this.paymentHash = result.paymentHash;
      this.verifyUrl = result.verifyUrl;
      this.qrDataUrl = await generateQRCode(this.invoice);
      await this.showInvoiceForm();
      console.log('[InvoiceModal] About to call startCountdown and startPolling');
      this.startCountdown();
      this.startPolling();
      console.log('[InvoiceModal] startCountdown and startPolling called');
    } catch (err) {
      this.showError(err.message);
      this.onError(err);
    }
  }

  startPolling() {
    console.log('[InvoiceModal] startPolling called, invoice:', this.invoice?.slice(0, 30), 'verifyUrl:', this.verifyUrl);
    this.tracker = new InvoiceTracker(this.invoice, (status, data) => {
      if (status === 'paid') {
        this.handlePaymentSuccess(data);
      } else if (status === 'expired') {
        this.handlePaymentExpired();
      }
    }, { 
      paymentHash: this.paymentHash,
      recipientPubkey: this.recipientPubkey,
      relays: this.relays,
      verifyUrl: this.verifyUrl
    });
    this.tracker.start(2000, 600000);
    console.log('[InvoiceModal] tracker.start() called, tracker:', !!this.tracker);
  }

  stopPolling() {
    if (this.tracker) {
      this.tracker.stop();
      this.tracker = null;
    }
  }
  
  async showInvoiceForm() {
    console.log('[InvoiceModal] showInvoiceForm called');
    this.state = 'pending';
    const content = document.getElementById('invoice-content');
    
    content.innerHTML = `
      <div class="invoice-header">
        <h3>Pagar ${this.amount} sats</h3>
        <p class="invoice-description">${this.description}</p>
        <p class="invoice-to">Para: <strong>${this.lud16}</strong></p>
      </div>
      
      <div class="invoice-qr-container">
        <img id="invoice-qr" src="${this.qrDataUrl}" alt="QR Code" class="invoice-qr">
      </div>
      
      <div class="invoice-data">
        <label>Invoice:</label>
        <div class="invoice-data-row">
          <input type="text" id="invoice-string" value="${this.invoice}" readonly>
          <button id="copy-invoice-btn" class="btn-secondary btn-small">Copiar</button>
        </div>
      </div>
      
      <div class="invoice-countdown" id="invoice-countdown">
        <span class="countdown-icon">⏱️</span>
        <span id="countdown-time">${this.formatTime(this.remainingSeconds)}</span>
      </div>
      
      <div class="invoice-status" id="invoice-status"></div>
      
      ${isWebLNAvailable() ? `
        <button id="pay-webln-btn" class="btn-primary" style="width: 100%; margin-top: 15px;">
          Pagar con Alby
        </button>
      ` : `
        <div class="invoice-webln-warning">
          <p>Instalá <a href="https://getalby.com" target="_blank">Alby</a> para pagar automáticamente</p>
        </div>
      `}
    `;
    
    this.attachInvoiceListeners();
  }
  
  attachInvoiceListeners() {
    const copyBtn = document.getElementById('copy-invoice-btn');
    const weblnBtn = document.getElementById('pay-webln-btn');
    
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        await navigator.clipboard.writeText(this.invoice);
        copyBtn.textContent = '¡Copiado!';
        setTimeout(() => { copyBtn.textContent = 'Copiar'; }, 2000);
      });
    }
    
    if (weblnBtn) {
      weblnBtn.addEventListener('click', () => this.payWithWebLN());
    }
  }
  
  startCountdown() {
    this.countdownInterval = setInterval(() => {
      this.remainingSeconds--;
      
      const countdownEl = document.getElementById('countdown-time');
      if (countdownEl) {
        countdownEl.textContent = this.formatTime(this.remainingSeconds);
      }
      
      if (this.remainingSeconds <= 60) {
        const countdownContainer = document.getElementById('invoice-countdown');
        if (countdownContainer) {
          countdownContainer.classList.add('countdown-urgent');
        }
      }
      
      if (this.remainingSeconds <= 0) {
        this.expireInvoice();
      }
    }, 1000);
  }
  
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  
  async payWithWebLN() {
    const weblnBtn = document.getElementById('pay-webln-btn');
    if (weblnBtn) {
      weblnBtn.disabled = true;
      weblnBtn.textContent = 'Procesando...';
    }
    
    this.showStatus('pending', 'Esperando confirmación de wallet...');
    
    try {
      const result = await sendPayment(this.invoice);
      this.handlePaymentSuccess(result);
    } catch (err) {
      this.showStatus('error', err.message);
      if (weblnBtn) {
        weblnBtn.disabled = false;
        weblnBtn.textContent = 'Reintentar';
      }
      this.onError(err);
    }
  }
  
  handlePaymentSuccess(result) {
    this.state = 'paid';
    this.stopCountdown();
    
    const content = document.getElementById('invoice-content');
    content.innerHTML = `
      <div class="invoice-success">
        <div class="success-icon">✅</div>
        <h3>¡Pago exitoso!</h3>
        <p>${this.amount} sats enviados a ${this.lud16}</p>
        ${result.preimage ? `<p class="preimage">Preimage: ${result.preimage.slice(0, 16)}...</p>` : ''}
        <button id="invoice-done-btn" class="btn-primary" style="margin-top: 20px;">
          Continuar
        </button>
      </div>
    `;
    
    const doneBtn = document.getElementById('invoice-done-btn');
    if (doneBtn) {
      doneBtn.addEventListener('click', () => {
        this.onSuccess(result);
        this.close();
      });
    }
    
    this.onSuccess(result);
  }
  
  expireInvoice() {
    this.state = 'expired';
    this.stopCountdown();
    
    this.showStatus('expired', 'Invoice expirado');
    
    const content = document.getElementById('invoice-content');
    const invoiceStatus = document.getElementById('invoice-status');
    const weblnBtn = document.getElementById('pay-webln-btn');
    
    if (invoiceStatus) {
      invoiceStatus.innerHTML = `
        <div class="status-expired">
          <span>⏰</span>
          <span>Este invoice expiró. Generá uno nuevo.</span>
        </div>
      `;
    }
    
    if (weblnBtn) {
      weblnBtn.disabled = true;
      weblnBtn.textContent = 'Expirado';
    }
  }
  
  showStatus(type, message) {
    const statusEl = document.getElementById('invoice-status');
    if (!statusEl) return;
    
    const icons = {
      pending: '⏳',
      success: '✅',
      error: '❌',
      expired: '⏰'
    };
    
    statusEl.className = `invoice-status status-${type}`;
    statusEl.innerHTML = `
      <span>${icons[type] || ''}</span>
      <span>${message}</span>
    `;
  }
  
  showError(message) {
    const content = document.getElementById('invoice-content');
    if (!content) return;
    
    content.innerHTML = `
      <div class="invoice-error">
        <div class="error-icon">❌</div>
        <h3>Error</h3>
        <p>${message}</p>
        <button id="invoice-retry-btn" class="btn-secondary" style="margin-top: 15px;">
          Reintentar
        </button>
        <button id="invoice-close-error-btn" class="btn-secondary" style="margin-top: 10px;">
          Cerrar
        </button>
      </div>
    `;
    
    const retryBtn = document.getElementById('invoice-retry-btn');
    const closeBtn = document.getElementById('invoice-close-error-btn');
    
    if (retryBtn) {
      retryBtn.addEventListener('click', () => this.generateInvoiceAndShow());
    }
    
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }
  }
  
  stopCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }
  
  close() {
    this.stopCountdown();
    
    if (this.tracker) {
      this.tracker.stop();
      this.tracker = null;
    }

    if (this.handleKeydown) {
      document.removeEventListener('keydown', this.handleKeydown);
      this.handleKeydown = null;
    }
    
    if (this.overlay) {
      document.body.removeChild(this.overlay);
      this.overlay = null;
    }
    
    this.onClose();
  }
  
  destroy() {
    this.close();
  }
}

export default InvoiceModal;

if (typeof window !== 'undefined') {
  window.InvoiceModal = InvoiceModal;
}
