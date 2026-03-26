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

### ⏳ 3. Exceso de console.log
**Ubicación**: Múltiples archivos (200+ statements)

Hay demasiadas sentencias de debug que ensucian la consola en producción.

**Solución**: 
- Eliminar o condicionalmente ejecutar los console.log de debug
- Mantener solo console.warn y console.error para errores reales

---

## 🟡 Media Prioridad (UX/funcionalidad)

### ⏳ 4. Breadcrumbs: Navegación sin indicador de ruta
**Ubicación**: `src/components/CourseView.js`

Cuando el usuario navega a un curso desde la lista, no hay manera de saber desde dónde vino o cómo volver facilmente.

**Solución**: Agregar breadcrumbs en vistas profundas (curso, perfil de teacher, evaluación).

---

### ⏳ 5. Timeout de sesión no manejado
**Ubicación**: `src/components/UserMenu.js`

No hay expiración de sesión ni renovación de tokens. El usuario puede quedar "atrapado" en sesión indefinidamente.

**Solución**: Agregar timestamp de login y validar expiración (ej: 24h).

---

### ⏳ 6. Sin feedback cuando relays no responden
**Ubicación**: `src/lib/nostr.js`, `src/components/UserMenu.js`

Cuando los relays están caídos o no responden, el usuario no tiene feedback de qué está pasando.

**Solución**: Mostrar indicador de estado de conexión (online/offline/reconnecting).