# Issues Identificados - NosTeach

## 🔴 Alta Prioridad (Bug fixes)

### ✅ 1. Código duplicado: loadRoles()
**Ubicación**: `src/App.js:71-82` y `src/App.js:112-122`

La función `loadRoles()` está definida dos veces en la clase App, lo cual es un bug que puede causar comportamiento inesperado.

```javascript
// Primera definición (líneas 71-82)
loadRoles() {
  try {
    const saved = localStorage.getItem('nosteach_roles');
    if (saved) {
      this.roles = JSON.parse(saved);
    }
  } catch (err) {
    console.warn('Error loading roles:', err);
  }
  this.updateNav();
  this.refreshCurrentView();
}

// Segunda definición (líneas 112-122)
loadRoles() {
  try {
    const saved = localStorage.getItem(ROLES_KEY);
    if (saved) {
      this.roles = JSON.parse(saved);
    }
  } catch (err) {
    console.warn('Error loading roles:', err);
  }
  this.updateNav();
}
```

**Solución**: Eliminar una de las dos definiciones y unificar la key usada.

---

### ✅ 2. Inconsistencia en storage keys
**Ubicación**: `src/App.js`, `src/components/CourseView.js`, `src/components/RoleSelector.js`

Se usa `nosteach_roles` en algunos lugares y la constante `ROLES_KEY` (que vale `'nosteach_roles'`) en otros.

**Solución**: Usar exclusivamente la constante `ROLES_KEY` importada de RoleSelector.

---

### ✅ 3. Exceso de console.log
**Ubicación**: Múltiples archivos (200+ statements)

Hay demasiadas sentencias de debug que ensucian la consola en producción.

**Solución**: 
- Flag `DEBUG` configurable via `?debug=true` en URL o localStorage
- Todos los console.log ahora wrapped con `if (DEBUG)`
- Documentado en README.md y AGENTS.md

---

## 🟡 Media Prioridad (UX/funcionalidad)

### ✅ 4. Breadcrumbs: Navegación sin indicador de ruta
**Ubicación**: `src/components/CourseView.js`, `src/App.js`

Cuando el usuario navega a un curso desde la lista, no hay manera de saber desde dónde vino o cómo volver facilmente.

**Solución implementada**: Sistema de breadcrumb dinámico con historial en App.js:
- Breadcrumb centralizado en header (fila inferior)
- Historial de navegación que se actualiza al navegar
- Click en breadcrumb navega y hace pop del historial
- Oculta primeros items si hay más de 5
- Se reconstruye desde URL en deep links

---

### ⏸️ 5. Timeout de sesión no manejado (DIFERIDO)
**Ubicación**: `src/components/UserMenu.js`

No hay expiración de sesión ni renovación de tokens. El usuario puede quedar "atrapado" en sesión indefinidamente.

**Solución**: Agregar timestamp de login y validar expiración (ej: 24h).

---

### ✅ 6. Sin feedback cuando relays no responden
**Ubicación**: `src/lib/nostr.js`, `src/components/UserMenu.js`

Cuando los relays están caídos o no responden, el usuario no tiene feedback de qué está pasando.

**Solución**: Agregado sistema de estado de conexión en nostr.js con callback. Agregado indicador visual en header de App.js.

---

### ✅ 7. URLs profundas (accesibles desde bookmarks)
**Ubicación**: `src/App.js`

El usuario no puede acceder directamente a cursos o docentes via URL (ej: `#/c/{eventId}`).

**Solución**: Agregada ruta `#/c/{eventId}` en initHashRouting. CourseView ahora recibe `isDirectAccess` para no mostrar breadcrumb si viene de URL directa (bookmark). Breadcrumbs solo aparecen cuando navega internamente.

---

### ✅ 8. Vista de usuario con /p/
**Ubicación**: `src/App.js`

Agregar ruta `#/p/{npub}` que muestre vista de usuario con sus cursos publicados.

**Solución implementada**: 
- Ruta `#/p` muestra "Mi Cuenta" del usuario logueado
- Ruta `#/p/{npub}` muestra perfil público de cualquier usuario
- Componente UserProfile (renombrado de TeacherProfile)
- Vista incluye link a "Mi perfil público" en Mi Cuenta

---

### ✅ 9. Auth NIP-07 (Login con extensión de navegador)
**Ubicación**: `src/lib/NostrConnect.js`, `src/components/UserMenu.js`

Implementado:
- Detectar `window.nostr` al cargar
- Botón "Conectar con extensión"
- Usar `window.nostr.getPublicKey()` y `signEvent()`
- Detección dinámica de extensión
- Session restore con verificación

---

### ✅ 10. Auth NIP-46 Básico (Connection Request)
**Ubicación**: `src/lib/NostrConnect.js`, `src/components/UserMenu.js`

Implementado:
- UI: Input para bunker URL
- Botón "Conectar con bunker"
- Botón "Nostr Connect (QR)" con modal
- Generación de QR local con qrcode
- Espera de aprobación del bunker

---

### ✅ 11. Auth NIP-46 Completo (Remote Signing)
**Ubicación**: `src/lib/NostrConnect.js`

Implementado:
- Integración con `@nostr-dev-kit/ndk`
- `NDKNip46Signer.bunker()` para conexión
- `NDKNip46Signer.nostrconnect()` para QR
- `signEvent()` delegando al signer
- Session restore automático

---

### ⏸️ 12. Mensajería Privada NIP-17 (DIFERIDO)
**Ubicación**: `src/lib/NostrConnect.js`

Para implementar mensajería privada entre usuarios.

**Jerarquía de NIPs**:
```
NIP-44 → Algoritmo de cifrado (ChaCha20-Poly1305)
NIP-59 → Gift Wrap (encapsula eventos, oculta metadatos)
NIP-17 → Esquema de mensajería (usa NIP-44 + NIP-59)
```

**Solución**:
1. Implementar NIP-17 (no NIP-04 directamente)
2. Usar `nostr-tools` que ya tiene NIP-44 y NIP-59 implementados
3. Crear kind 14 (chat) con gift wraps kind 1059

**Depende de**: Implementación de respuestas/devoluciones privadas entre usuarios.

**Nota**: NIP-04 está deprecated. No implementar.

---

## ✅ Completados Recientemente

- Sistema de breadcrumbs dinámicos con historial de navegación
- Header sticky con breadcrumb en segunda fila
- Footer con emojis en links
- Login panel con mismo estilo que dropdown
- Ruteo con URLs profundas: #/c/{id}, #/p/{npub}, #/c/{id}/r
- Vista de perfil de usuario (#/p/{npub})
- Mi Cuenta (#/p) con link a perfil público
- Renombrado TeacherProfile → UserProfile para vistas genéricas
- Breadcrumbs se actualizan al navegar, click navega y popea historial
- **Auth NIP-07**: Login con extensión de navegador (Alby, nos2x)
- **Refactor NostrConnect**: Clase standalone en `src/lib/NostrConnect.js`
- **Detección dinámica de extensión**: `checkNip07Extension()` para extensiones que cargan tarde
- **Session restore con verificación**: Verifica pubkey con extensión al restaurar sesión
- **Auth NIP-46**: Login con bunker (bunker://...) y Nostr Connect (QR)
- **NIP-46 Remote Signing**: Integración con NDK, firma de eventos via signer
- **Login unificado**: Input único para nsec/bunker con detección por prefijo
- **QR countdown**: Visual de 120s con retry automático al vencer
- **QR local**: Genera con qrcode (no API externa)
- **Modal QR**: Cierra con ESC, skeleton mientras carga
