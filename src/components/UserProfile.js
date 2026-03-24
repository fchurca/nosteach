class UserProfile {
  constructor(container, nostrConnect) {
    this.container = container;
    this.nostr = nostrConnect;
    this.profile = null;
    this.roles = { teacher: false, student: false, sponsor: false };
  }

  async load() {
    if (!this.nostr?.pubkey) return;

    try {
      const events = await this.nostr.query({
        kinds: [0],
        authors: [this.nostr.pubkey]
      });

      if (events.length > 0) {
        this.profile = JSON.parse(events[0].content);
        
        if (this.profile.nosteach_roles) {
          this.roles = { ...this.roles, ...this.profile.nosteach_roles };
        }
      }
    } catch (err) {
      console.warn('Error loading profile:', err);
    }
  }

  render() {
    if (!this.container) return;

    const roles = this.nostr?.profile || {};
    const npub = this.nostr?.npub || '';

    this.container.innerHTML = `
      <div class="card">
        <h2>👤 Mi Perfil</h2>
        
        <div class="profile-info" style="margin-bottom: 20px;">
          <div style="margin-bottom: 10px;">
            <strong>Nombre:</strong> ${roles.display_name || roles.name || 'No configurado'}
          </div>
          <div style="margin-bottom: 10px;">
            <strong>Lightning:</strong> 
            ${roles.lud16 || roles.lnurl ? 
              `<code style="background: rgba(0,255,157,0.1); padding: 2px 8px; border-radius: 4px;">${roles.lud16 || 'LNURL configurado'}</code>` : 
              '<span style="color: var(--warning);">⚠️ No configurado</span>'}
          </div>
          <div style="margin-bottom: 10px;">
            <strong>npub:</strong> 
            <code style="font-size: 0.85em;">${npub.slice(0, 20)}...</code>
          </div>
        </div>

        <h3 style="margin-bottom: 10px;">🎭 Mis Roles</h3>
        <div id="profile-roles"></div>

        <h3 style="margin: 20px 0 10px;">⚡ Configuración de Zap</h3>
        <div class="zap-config">
          <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
            <input type="radio" name="zapper" value="delegated" checked>
            <span>Delegado (QR/wallet externa)</span>
          </label>
          <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
            <input type="radio" name="zapper" value="nwc">
            <span>NWC (directo desde app)</span>
          </label>
          <input type="text" id="nwc-url" placeholder="nostr+walletconnect://..." style="display: none;">
        </div>

        <button id="save-profile-btn" class="btn-secondary">Guardar en Nostr</button>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 10px;">
          Los roles y configuración se guardan en tu evento de perfil (kind 0) de Nostr.
        </p>
      </div>
    `;

    this.attachListeners();
    this.load();
  }

  attachListeners() {
    const nwcRadio = document.querySelector('input[name="zapper"][value="nwc"]');
    const delegatedRadio = document.querySelector('input[name="zapper"][value="delegated"]');
    const nwcInput = document.getElementById('nwc-url');
    const saveBtn = document.getElementById('save-profile-btn');

    if (nwcRadio && nwcInput) {
      nwcRadio.addEventListener('change', () => {
        nwcInput.style.display = nwcRadio.checked ? 'block' : 'none';
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveProfile());
    }
  }

  async saveProfile() {
    if (!this.nostr?.pubkey) {
      alert('Primero conectá tu identidad Nostr');
      return;
    }

    const zapperType = document.querySelector('input[name="zapper"]:checked')?.value || 'delegated';
    const nwcUrl = document.getElementById('nwc-url')?.value || '';

    const profileUpdate = {
      ...this.profile,
      nosteach_roles: this.roles,
      nosteach_zapper: zapperType,
      ...(nwcUrl ? { nosteach_nwc: nwcUrl } : {})
    };

    const event = {
      kind: 0,
      content: JSON.stringify(profileUpdate)
    };

    try {
      await this.nostr.publish(0, event.content, []);
      alert('✅ Perfil guardado en Nostr');
    } catch (err) {
      alert('❌ Error al guardar: ' + err.message);
    }
  }
}

export default UserProfile;
