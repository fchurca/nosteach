import { generateQRCode, generateInvoice, sendPayment, isWebLNAvailable, getLud16, InvoiceTracker, ZAP_AMOUNTS } from '../lib/lightning.js';
import { formatAuthorName } from '../lib/lightning.js';

class ZapModal {
  constructor(options = {}) {
    this.recipientPubkey = options.recipientPubkey;
    this.recipientName = options.recipientName || 'Usuario';
    this.recipientLud16 = options.recipientLud16;
    this.amounts = options.amounts || ZAP_AMOUNTS;
    this.customMax = options.customMax || 10000;
    this.onSuccess = options.onSuccess || (() => {});
    this.onError = options.onError || (() => {});
    this.onClose = options.onClose || (() => {});

    this.state = 'select-amount';
    this.invoice = null;
    this.qrDataUrl = null;
    this.selectedAmount = null;
    this.tracker = null;
    this.overlay = null;
  }

  async show() {
    this.createOverlay();
    this.renderAmountSelection();
  }

  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'zap-modal-overlay';
    this.overlay.innerHTML = `
      <div class="zap-modal">
        <button class="zap-modal-close" id="zap-close-btn">Cerrar</button>
        <div id="zap-modal-content"></div>
      </div>
    `;

    document.body.appendChild(this.overlay);

    const closeBtn = document.getElementById('zap-close-btn');
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

  renderAmountSelection() {
    const content = document.getElementById('zap-modal-content');
    content.innerHTML = `
      <div class="zap-modal-header">
        <h3>Apoyar a ${this.recipientName}</h3>
        <p class="zap-modal-subtitle">Seleccioná el monto del apoyo</p>
      </div>
      
      <div class="zap-amounts">
        ${this.amounts.map(amount => `
          <button class="zap-amount-btn" data-amount="${amount}">
            ${amount} sats
          </button>
        `).join('')}
        ${this.customMax > 0 ? `
          <button class="zap-amount-btn zap-custom-btn" data-amount="custom">
            Custom
          </button>
        ` : ''}
      </div>
      
      <div id="zap-custom-input" style="display: none; margin-top: 15px;">
        <input 
          type="number" 
          id="zap-custom-amount" 
          placeholder="Cantidad en sats"
          min="1"
          max="${this.customMax}"
        >
        <button id="zap-custom-confirm" class="btn-secondary" style="width: 100%;">
          Confirmar
        </button>
      </div>
    `;

    this.attachAmountListeners();
  }

  attachAmountListeners() {
    const amountBtns = document.querySelectorAll('.zap-amount-btn:not(.zap-custom-btn)');
    const customBtn = document.querySelector('.zap-custom-btn');
    const customInput = document.getElementById('zap-custom-input');
    const customConfirm = document.getElementById('zap-custom-confirm');

    amountBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const amount = parseInt(btn.dataset.amount);
        this.startZap(amount);
      });
    });

    if (customBtn) {
      customBtn.addEventListener('click', () => {
        customInput.style.display = 'block';
        customBtn.style.display = 'none';
      });
    }

    if (customConfirm) {
      customConfirm.addEventListener('click', () => {
        const input = document.getElementById('zap-custom-amount');
        const amount = parseInt(input.value);
        if (amount > 0 && amount <= this.customMax) {
          customInput.style.display = 'none';
          this.startZap(amount);
        } else {
          this.showError(`Monto inválido (1-${this.customMax} sats)`);
        }
      });
    }
  }

  async startZap(amount) {
    this.selectedAmount = amount;
    this.state = 'loading';
    this.renderLoading('Generando invoice...');

    try {
      const result = await generateInvoice(this.recipientLud16, amount, `Zap desde NosTeach`);
      this.invoice = result.invoice;
      this.paymentHash = result.paymentHash;
      this.verifyUrl = result.verifyUrl;
      this.qrDataUrl = await generateQRCode(this.invoice);
      this.renderInvoice();
      this.startPolling();
    } catch (err) {
      this.showError(err.message);
    }
  }

  renderLoading(message) {
    const content = document.getElementById('zap-modal-content');
    content.innerHTML = `
      <div class="zap-loading">
        <div class="spinner"></div>
        <p>${message}</p>
      </div>
    `;
  }

  renderInvoice() {
    this.state = 'pending';
    const content = document.getElementById('zap-modal-content');
    
    content.innerHTML = `
      <div class="zap-modal-header">
        <h3>Apoyar con ${this.selectedAmount} sats</h3>
        <p class="zap-modal-subtitle">Escaneá el QR o copiá el invoice</p>
      </div>
      
      <div class="zap-qr-container">
        <img id="zap-qr" src="${this.qrDataUrl}" alt="QR Code" class="zap-qr">
      </div>
      
      <div class="zap-invoice-data">
        <label>Invoice:</label>
        <div class="zap-invoice-row">
          <input type="text" id="zap-invoice-string" value="${this.invoice}" readonly>
          <button id="copy-zap-invoice-btn" class="btn-secondary btn-small">Copiar</button>
        </div>
      </div>
      
      <div class="zap-status" id="zap-status">
        <span class="zap-status-icon">⏳</span>
        <span class="zap-status-text">Esperando pago...</span>
      </div>
      
      ${isWebLNAvailable() ? `
        <button id="pay-webln-btn" class="btn-primary" style="width: 100%; margin-top: 15px;">
          Pagar con Alby
        </button>
      ` : ''}
      
      <button id="confirm-paid-btn" class="btn-secondary" style="width: 100%; margin-top: 10px;">
        Ya pagué
      </button>
    `;

    this.attachInvoiceListeners();
  }

  attachInvoiceListeners() {
    const copyBtn = document.getElementById('copy-zap-invoice-btn');
    const weblnBtn = document.getElementById('pay-webln-btn');
    const confirmPaidBtn = document.getElementById('confirm-paid-btn');
    
    if (confirmPaidBtn) {
      confirmPaidBtn.addEventListener('click', () => {
        this.handlePaymentSuccess({ preimage: 'manual-confirm-' + Date.now() });
      });
    }

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

  async payWithWebLN() {
    const weblnBtn = document.getElementById('pay-webln-btn');
    if (weblnBtn) {
      weblnBtn.disabled = true;
      weblnBtn.textContent = 'Procesando...';
    }

    this.updateStatus('pending', 'Esperando confirmación...');

    try {
      const result = await sendPayment(this.invoice);
      this.handlePaymentSuccess(result);
    } catch (err) {
      this.updateStatus('error', err.message);
      if (weblnBtn) {
        weblnBtn.disabled = false;
        weblnBtn.textContent = 'Reintentar';
      }
    }
  }

  startPolling() {
    this.tracker = new InvoiceTracker(this.invoice, (status, data) => {
      if (status === 'paid') {
        this.handlePaymentSuccess(data);
      } else if (status === 'expired') {
        this.handlePaymentExpired();
      }
    }, { 
      paymentHash: this.paymentHash,
      recipientPubkey: this.recipientPubkey,
      verifyUrl: this.verifyUrl
    });

    this.tracker.start(5000, 600000);
  }

  updateStatus(type, message) {
    const statusEl = document.getElementById('zap-status');
    if (!statusEl) return;

    const icons = {
      pending: '⏳',
      success: '✅',
      error: '❌',
      expired: '⏰'
    };

    statusEl.className = `zap-status zap-status-${type}`;
    statusEl.innerHTML = `
      <span class="zap-status-icon">${icons[type] || ''}</span>
      <span class="zap-status-text">${message}</span>
    `;
  }

  handlePaymentSuccess(result) {
    this.state = 'paid';
    this.stopPolling();

    const closeBtn = document.getElementById('zap-close-btn');
    if (closeBtn) {
      closeBtn.classList.add('paid');
      closeBtn.textContent = '¡Pagado!';
    }

    this.updateStatus('success', `¡${this.selectedAmount} sats enviados!`);

    const content = document.getElementById('zap-modal-content');
    content.innerHTML += `
      <div class="zap-success-details">
        ${result.preimage ? `<p class="preimage">Preimage: ${result.preimage.slice(0, 16)}...</p>` : ''}
      </div>
    `;

    this.onSuccess(result, this.selectedAmount);
  }

  handlePaymentExpired() {
    this.state = 'expired';
    this.updateStatus('expired', 'Invoice expirado');
  }

  showError(message) {
    this.state = 'error';
    const content = document.getElementById('zap-modal-content');
    
    content.innerHTML = `
      <div class="zap-error">
        <div class="error-icon">❌</div>
        <h3>Error</h3>
        <p>${message}</p>
        <button id="zap-retry-btn" class="btn-secondary" style="margin-top: 15px;">
          Reintentar
        </button>
      </div>
    `;

    const retryBtn = document.getElementById('zap-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        this.renderAmountSelection();
      });
    }
  }

  stopPolling() {
    if (this.tracker) {
      this.tracker.stop();
      this.tracker = null;
    }
  }

  close() {
    this.stopPolling();

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

export default ZapModal;
