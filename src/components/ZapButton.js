import { ZAP_AMOUNTS, getLud16 } from '../lib/lightning.js';
import { fetchProfile } from '../lib/lightning.js';
import InvoiceModal from './InvoiceModal.js';
import { DEBUG } from '../lib/constants.js';

class ZapButton {
  constructor(options = {}) {
    this.recipientPubkey = options.recipientPubkey;
    this.recipientName = options.recipientName || 'Usuario';
    this.recipientLud16 = options.recipientLud16 || null;
    this.amounts = options.amounts || ZAP_AMOUNTS;
    this.customMax = options.customMax || 10000;
    this.onSuccess = options.onSuccess || (() => {});
    this.onError = options.onError || (() => {});
    this.onStart = options.onStart || (() => {});
    
    this.state = 'idle';
    this.container = null;
    this.modal = null;
    this.invoice = null;
    this.amount = null;
    this.lud16 = null;
  }
  
  async mount(container) {
    if (DEBUG) console.log('[ZapButton] Mount called, recipientPubkey:', this.recipientPubkey, 'recipientLud16:', this.recipientLud16);
    this.container = container;
    this.lud16 = this.recipientLud16;
    if (!this.lud16) {
      if (DEBUG) console.log('[ZapButton] No recipientLud16, fetching...');
      this.lud16 = await getLud16(this.recipientPubkey);
    }
    if (DEBUG) console.log('[ZapButton] Got lud16:', this.lud16);
    this.render();
    if (DEBUG) console.log('[ZapButton] Rendered');
  }
  
  render() {
    if (!this.container) return;
    
    const buttonText = this.state === 'loading' ? 'Preparando...' : `Apoyar con sats`;
    
    this.container.innerHTML = `
      <div class="zap-button-container">
        <div class="zap-amounts">
          ${this.amounts.map(amount => `
            <button 
              class="zap-amount-btn" 
              data-amount="${amount}"
            >
              ${amount} sats
            </button>
          `).join('')}
          ${this.customMax > 0 ? `
            <button 
              class="zap-amount-btn zap-custom-btn"
              data-amount="custom"
            >
              Custom
            </button>
          ` : ''}
        </div>
        
        <div id="zap-custom-input" style="display: none; margin-top: 10px;">
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
        
        <div id="zap-status" style="display: none; margin-top: 15px;"></div>
      </div>
    `;
    
    this.attachListeners();
  }
  
  attachListeners() {
    if (DEBUG) console.log('[ZapButton] attachListeners called');
    const amountBtns = this.container.querySelectorAll('.zap-amount-btn:not(.zap-custom-btn)');
    const customBtn = this.container.querySelector('.zap-custom-btn');
    const customInput = this.container.querySelector('#zap-custom-input');
    const customConfirm = this.container.querySelector('#zap-custom-confirm');
    
    amountBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (DEBUG) console.log('[ZapButton] Clicked button, amount:', btn.dataset.amount);
        const amount = parseInt(btn.dataset.amount);
        this.openInvoiceModal(amount);
      });
    });
    
    if (customBtn) {
      customBtn.addEventListener('click', () => {
        customInput.style.display = 'block';
        customBtn.style.display = 'none';
      });
    }
    
    if (customConfirm) {
      customConfirm.addEventListener('click', async () => {
        const input = this.container.querySelector('#zap-custom-amount');
        const amount = parseInt(input.value);
        if (amount > 0 && amount <= this.customMax) {
          customInput.style.display = 'none';
          await this.openInvoiceModal(amount);
        } else {
          this.showError(`Monto inválido (1-${this.customMax} sats)`);
        }
      });
    }
  }

  async openInvoiceModal(amount) {
    if (DEBUG) console.log('[ZapButton] openInvoiceModal called, amount:', amount, 'lud16:', this.lud16);
    try {
      if (!this.lud16) {
        if (DEBUG) console.log('[ZapButton] Fetching lud16 for:', this.recipientPubkey);
        for (let i = 0; i < 3; i++) {
          this.lud16 = await getLud16(this.recipientPubkey);
          if (DEBUG) console.log('[ZapButton] Attempt', i+1, 'lud16:', this.lud16);
          if (this.lud16) break;
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      if (!this.lud16) {
        this.showError('El usuario no tiene Lightning address');
        return;
      }

      if (DEBUG) console.log('[ZapButton] Creating InvoiceModal with lud16:', this.lud16, 'recipientPubkey:', this.recipientPubkey);
      this.modal = new InvoiceModal({
        amount: amount,
        description: `Zap desde NosTeach`,
        lud16: this.lud16,
        recipientPubkey: this.recipientPubkey,
        onSuccess: (result) => {
          if (DEBUG) console.log('[ZapButton] Zap exitoso via InvoiceModal:', result);
          this.state = 'success';
          this.showStatus('success', `¡Pago de ${amount} sats recibido!`);
          this.onSuccess(result, amount);
        },
        onError: (err) => {
          console.error('[ZapButton] Error en InvoiceModal:', err);
          this.showError(err.message);
          this.onError(err, amount);
        }
      });
      
      if (DEBUG) console.log('[ZapButton] Calling modal.show()');
      this.modal.show();
    } catch (err) {
      this.showError(err.message);
    }
  }
  
  showStatus(type, message) {
    const statusEl = document.getElementById('zap-status');
    if (!statusEl) return;
    
    statusEl.style.display = 'block';
    
    const icons = {
      loading: '⏳',
      success: '✅',
      error: '❌'
    };
    
    const colors = {
      loading: 'var(--warning)',
      success: 'var(--accent)',
      error: 'var(--error)'
    };
    
    statusEl.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px; color: ${colors[type]};">
        <span>${icons[type]}</span>
        <span>${message}</span>
      </div>
      ${type === 'loading' ? '<div class="zap-spinner"></div>' : ''}
    `;
  }
  
  showError(message) {
    this.showStatus('error', message);
  }
  
  reset() {
    this.state = 'idle';
    this.amount = null;
    this.render();
  }
  
  destroy() {
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

export default ZapButton;
