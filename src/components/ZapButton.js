import { ZAP_AMOUNTS, isWebLNAvailable, zapUser, getLud16 } from '../lib/lightning.js';
import { fetchProfile } from '../lib/lightning.js';

class ZapButton {
  constructor(options = {}) {
    this.recipientPubkey = options.recipientPubkey;
    this.recipientName = options.recipientName || 'Usuario';
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
  }
  
  mount(container) {
    this.container = container;
    this.render();
  }
  
  render() {
    if (!this.container) return;
    
    const weblnAvailable = isWebLNAvailable();
    const buttonText = this.state === 'loading' ? 'Preparando...' : `Apoyar con sats`;
    
    this.container.innerHTML = `
      <div class="zap-button-container">
        ${!weblnAvailable ? `
          <div class="zap-warning">
            <span>Necesitás <a href="https://getalby.com" target="_blank">Alby</a> para enviar zaps</span>
          </div>
          <a href="https://getalby.com" target="_blank" class="btn-secondary" style="display: block; text-align: center; text-decoration: none; width: 100%;">
            Instalar Alby
          </a>
        ` : ''}
        
        <div class="zap-amounts">
          ${this.amounts.map(amount => `
            <button 
              class="zap-amount-btn" 
              data-amount="${amount}"
              ${!weblnAvailable ? 'disabled' : ''}
            >
              ${amount} sats
            </button>
          `).join('')}
          ${this.customMax > 0 ? `
            <button 
              class="zap-amount-btn zap-custom-btn"
              data-amount="custom"
              ${!weblnAvailable ? 'disabled' : ''}
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
    const amountBtns = this.container.querySelectorAll('.zap-amount-btn:not(.zap-custom-btn)');
    const customBtn = this.container.querySelector('.zap-custom-btn');
    const customInput = this.container.querySelector('#zap-custom-input');
    const customConfirm = this.container.querySelector('#zap-custom-confirm');
    
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
        const input = this.container.querySelector('#zap-custom-amount');
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
    this.amount = amount;
    this.state = 'loading';
    this.showStatus('loading', `Preparando zap de ${amount} sats...`);
    this.onStart(amount);
    
    try {
      const result = await zapUser(this.recipientPubkey, amount, `Zap desde NosTeach`);
      
      this.state = 'success';
      this.showStatus('success', `¡Zap de ${amount} sats enviado!`);
      this.onSuccess(result, amount);
      
      setTimeout(() => {
        this.reset();
      }, 3000);
      
    } catch (err) {
      this.state = 'error';
      this.showError(err.message);
      this.onError(err, amount);
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
