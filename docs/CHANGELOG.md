# Changelog - NosTeach

## 2026-03-28 (NIP-46 + UX + Login Unificado)

### Added
- **NIP-46 support**: Login con bunker (bunker://...) y Nostr Connect (QR)
- **NIP-46 Remote Signing**: Integración con @nostr-dev-kit/ndk
- **Test suite NIP-46**: tests/nip46.mjs con 6 tests
- **Mi Cuenta UX**: Skeleton de carga, "(no definido)" para campos vacíos
- **UserMenu estados**: "(cargando...)" y "(sin nombre)" en gris
- **Login unificado**: Input único para nsec/bunker con detección automática por prefijo
- **QR countdown**: Visual de 120s con retry automático al vencer, NIP46_TIMEOUT centralizado

### Fixed
- **NDK import**: Usar `ndkModule.default || ndkModule.NDK**
- **Logout**: Limpia todos los datos de sesión
- **Modal QR**: Cierra con ESC
- **QR local**: Genera con qrcode (no API externa), skeleton mientras carga
- **QR colores**: Fondo oscuro #0a0f1a, fondo blanco
- **Logout desde #/p**: Redirige a perfil público (#/p/{npub})
- **Login/Logout**: Refresca la vista actual

---

## 2026-03-27 (NIP-07 + Login + Tests)

### Added
- **NIP-07 support**: Login con extensión de navegador (Alby, nos2x)
- **Detección dinámica**: checkNip07Extension() para extensiones que cargan tarde
- **Test suite NIP-07**: tests/nip07.mjs con 4 tests con mocks

### Fixed
- **showUserLoggedIn()**: Ahora se llama tras conexión NIP-07
- **Session restore**: Verifica pubkey con extensión (previene stale sessions)
- **NIP-07 button handler**: Adjunto correctamente aunque esté disabled
- **Tests redundantes**: Removidos 3 tests de NIP-07 de e2e.mjs

---

## 2026-03-27 (Navigation + Deep Links + Breadcrumbs + IDs)

### Added
- **Breadcrumbs dinámicos**: Historial de navegación con click para navegar y popear
- **Perfiles de usuario**: Ruteo #/p/{npub} para perfiles públicos
- **Mi Cuenta**: Nueva vista #/p con link a perfil público
- **URLs profundas**: #/c/{id}, #/p/{npub}, #/c/{id}/r
- **Footer emojis**: 🐱 GitHub, ⚡ Lightning Hackathons, 🏯 La Crypta, 🦤 Nostr
- **Soporte nevent**: URLs de cursos aceptan #/c/{nevent}
- **Soporte hex**: URLs de perfiles aceptan #/p/{hex}
- **IDs en curso**: Muestra ID (hex) y nevent completos
- **IDs en perfil**: Muestra npub y hex completos
- **Link a profesor**: En vista de curso, link al perfil
- **Espera de conexión**: waitForNostr antes de cargar perfil

### Fixed
- **Header sticky**: Restaurado con breadcrumb en segunda fila
- **Login panel**: Fondo agregado para coincidir con dropdown
- **Migración NDK → SimplePool**: Corregido routing de URLs profundas

### Refactor
- **TeacherProfile → UserProfile**: Componente renombrado para vistas genéricas

### Docs
- **Pitch**: Notas de presentación para FOUNDATIONS hackathon
- **Reorganización**: Documentación movida a docs/

---

## 2026-03-26 (UX + Payments)

### Added
- **Breadcrumbs**: Navegación mejorada con indicador de conexión
- **Skeleton loaders**: Mejora de UX durante carga
- **Toast notifications**: En lugar de alerts nativos
- **Demo**: Preparación de demo funcional

### Fixed
- **loadRoles() duplicado**: Eliminado, unificada storage key
- **Console.log**: Reducidos con flag DEBUG configurable
- **Aria-labels**: Agregados a botones de cierre
- **Verificación de pagos**: Avances en InvoiceTracker

### Chore
- **AGENTS.md**: Reglas para no commitear .secrets

---

## 2026-03-19 (UX Fixes + Payment Monitoring)

### Added
- **Monitoreo de pagos**: InvoiceModal ahora usa InvoiceTracker para verificar pagos desde cualquier wallet
  - Polling cada 3 segundos
  - Verificación via APIs externas (lightningvisuals, lnlookup)
  - Verificación via WebLN si está disponible
  - Payment hash extraído del invoice para tracking

### Fixed
- **Navbar responsive**: Nav ahora tiene `flex-wrap` y `gap` reducido para caber en móvil
- **Botón duplicado**: Eliminado "Crear Curso" del grid home (ya estaba en nav)
- **Labels de accesibilidad**: Agregados `<label>` a todos los inputs del form de crear curso
- **Contraste**: Opacidad de texto secundario mejorada de 0.4 a 0.6
- **Border-radius unificado**: Reducido de 16px/8px a 10px/6px
- **Header compacto**: Reducido altura de h1 y padding del body
- **Botón eliminar módulo/pregunta**: Agregado botón × para remover items dinámicos
- **CTA Instalar Alby**: Botón "Instalar Alby" visible cuando WebLN no está disponible
- **Estados vacíos mejorados**: Mensajes más amigables con emoji y CTA

---

## 2026-03-19 (Sprint 2 - Lightning Payments)

### Added
- **Lightning wrapper** (`src/lib/lightning.js`)
  - WebLN integration (Alby)
  - LNURL-pay para generar invoices dinámicas
  - QR code generation con `qrcode` library
  - InvoiceTracker para observar estado de pago
- **ZapButton component** (`src/components/ZapButton.js`)
  - Montos predefinidos: 21, 69, 210, 690 sats
  - Custom amount
  - Estados: idle, loading, success, error
- **InvoiceModal component** (`src/components/InvoiceModal.js`)
  - QR code para escanear con wallet
  - Botón "Pagar con Alby"
  - Countdown timer (10 min expiry)
  - Estados visuales: pending, success, error, expired
- **EvaluationList component** (`src/components/EvaluationList.js`)
  - Teacher ve respuestas de alumnos
  - Badge de correctas/incorrectas
  - Botón "Premiar" para enviar sats a estudiantes
- **Navegación "Mis Cursos"** para profesores
- **Tests de lightning** (`tests/lightning.mjs`)

### Changed
- **CourseView** ahora tiene sección de pago para evaluaciones
- Student paga antes de tomar evaluación si el curso tiene precio
- Sponsor ve botón "Patrocinar al Profesor" con ZapButton
- Teacher ve botón "Ver Respuestas" para cada curso con evaluación

### Technical
- Dependencia agregada: `qrcode`
- Estilos CSS para modales y componentes de lightning
- Integración con WebLN (`window.webln`)
- Query kind:1 filtrado por `#e:<courseId>` para evaluaciones

---

## 2026-03-18 (Part 9)

### Changed
- Header button now says "Iniciar sesión" instead of "Conectar" when not logged in
- User button now shows profile name (e.g., "debbie") after profile loads
- Course view attempts to show teacher name, falls back to pubkey if not available
- Increased relay query timeout to 5s for better profile fetching

---

### Fixed
- Session state now syncs correctly between UserMenu and App (Home shows "Conectado como" after refresh)
- Course form now validates using validateCurso() schema
- CourseView now receives roles from App state instead of localStorage directly
- Relay queries now have 15s timeout with retry button

### Technical
- Added timeout handling for course list queries
- CourseView accepts roles as parameter for proper state management

---

## 2026-03-18 (Part 4)

### Fixed
- Mi Cuenta now shows user info correctly when logged in
- Home page now shows "Acerca de NosTeach" instead of roles matrix

### Changed
- Permissions table replaced with positive descriptions in "Acerca de NosTeach"
- Mi Cuenta shows "Editar Roles" button

---

## 2026-03-18 (Part 2)

### Added
- RoleSelector component with checkboxes (teacher/student/sponsor)
- Role persistence in localStorage
- Navigation based on active roles
- Permission matrix implementation
- UserProfile component
- Playwright E2E tests (13 tests passing)

### Technical
- Fixed: SimplePool not working with Vite bundler
- Fixed: WebSocket relay connection via custom implementation
- Added: Relay failover (damus.io, nos.lol, nostr.band)

---

## 2026-03-18

### Added
- NostrConnect component with WebSocket direct (no SimplePool dependency)
- Course publishing to relays (kind 30078)
- Course listing from relays with tag filtering
- nsec login with NIP-19 decode
- Session persistence in localStorage
- User profile fetching (kind 0)
- Docker setup (Dockerfile + docker-compose.yml)

### Stack
- Vite + nostr-tools
- WebSocket direct to relays
- localStorage for session

---

## [Unreleased] - Future releases

### Planned
- Course view with modules rendering
- Evaluation form (kind 1 responses)
- Lightning payments (NWC/LNURL)
- Sponsor system
