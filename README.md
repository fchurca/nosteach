# ⚡ NosTeach

Plataforma educativa descentralizada construida sobre Nostr.

## Concepto

NosTeach permite:
- **Profesores** publicar cursos como eventos Nostr
- **Alumnos** consumir contenido y tomar evaluaciones
- **Patrocinadores** apoyar con zaps Lightning

Todo vive en relays Nostr públicos. Sin suscripciones, sin censores.

## Hackathon

Participando en **FOUNDATIONS** - La Crypta Lightning Hackathons 2026.
- **Premio**: 1,000,000 sats
- **Info**: https://hackaton.lacrypta.ar

## Inicio Rápido

```bash
# Clonar el repositorio
git clone https://github.com/fchurca/nosteach.git
cd nosteach

# Instalar dependencias
npm install

# Configurar secrets para testing (requerido para tests)
cp .secrets.example .secrets

# Ejecutar
npm run dev
```

Abrir http://localhost:5173

## Funcionalidades

### Autenticación
- Login con nsec (clave privada Nostr)
- Sesión persistente en localStorage

### Roles
- **Profesor**: Publicar cursos
- **Alumno**: Tomar cursos y evaluaciones
- **Patrocinador**: Apoyar con sats

### Cursos
- Crear curso con título, descripción, precio
- Agregar módulos (texto o enlaces)
- Agregar preguntas de evaluación
- Ver cursos publicados por otros

## Stack Técnico

| Capa | Tecnología |
|------|------------|
| Frontend | Vite + Vanilla JS |
| Nostr | nostr-tools (WebSocket directo) |
| Pagos | @getalby/sdk (NWC), webln |
| Storage | Relays Nostr (NIP-78) |
| Tests | Playwright |

## Testing

```bash
# Tests básicos
npm test

# Tests exploratorios
node tests/full-test.mjs
```

## Estructura

```
src/
├── main.js              # Entry point
├── App.js               # Componente principal
├── components/
│   ├── UserMenu.js      # Login dropdown
│   ├── RoleSelector.js  # Selector de roles
│   ├── CourseView.js    # Vista de curso
│   └── UserProfile.js   # Perfil de usuario
├── lib/
│   ├── schema.js        # Validación
│   └── constants.js     # Constantes
└── styles/
    └── main.css         # Estilos
```

## Modelo de Datos

### Curso (Kind 30078)

```json
{
  "kind": 30078,
  "tags": [
    ["d", "nosteach-curso-{id}"],
    ["t", "nosteach"],
    ["t", "curso"]
  ],
  "content": {
    "titulo": "...",
    "descripcion": "...",
    "precio": 0,
    "modulos": [...],
    "evaluacion": { "preguntas": [...] }
  }
}
```

### Evaluación (Kind 1)

```json
{
  "kind": 1,
  "tags": [
    ["e", "<curso-id>"],
    ["t", "nosteach-evaluacion"]
  ],
  "content": "{\"respuestas\":[...],\"timestamp\":...}"
}
```

## Roadmap

### ✅ ETAPA 1: MVP - Fundamentos
Completado: auth, roles, publicar cursos, tomar evaluaciones.

### ⏳ ETAPA 2: Pagos Lightning
- Integración con Alby/NWC para criar invoices
- Verificación de pago antes de mostrar contenido
- Precio por curso y bonus por aprobar

### ⏸️ ETAPA 3: Evaluaciones Avanzadas
### ⏸️ ETAPA 4: Patrocinios y Recompensas

Ver `ROADMAP.md` para detalle completo.

## Convenciones

### URLs de Perfil
- Perfiles públicos: `#/p/{npub1...}`
- Ejemplo: `http://localhost:5173/#/p/npub1sn0wdenkukak0d9dfczzeacvhkrgz92ak56egt7vdgzn8pv2wfqqhrjdv9`

### Display de Nombres
- Con nombre: `nombre (abcd...4321)` (4 caracteres del pubkey al inicio y final)
- Sin nombre: `npub (abcd...4321)`
- Usar helper `formatAuthorName(name, pubkey)` en `src/lib/lightning.js`

### Zaps
- Modal con QR dinámico para pago anónimo
- Polling cada 5 segundos para verificar pago
- Botón "Cerrar" cambia de amarillo a verde cuando se efectiva el pago
- **Nota**: La verificación en tiempo real depende del provider de LNURLp. 
  Algunos providers (como primal.net) no exponen un endpoint público de verificación,
  por lo que NosTeach usa Nostr zap receipts (kind 9735) para confirmar el pago.
  Esto puede tardar algunos segundos más en detectarse.

## Recursos

- [Nostr Docs](https://nostr.com)
- [NIP-19: Keys and Identifiers](https://github.com/nostr-protocol/nips/blob/master/19.md)
- [NIP-21: nostr: URI scheme](https://github.com/nostr-protocol/nips/blob/master/21.md)
- [NIP-78: App-specific Data](https://github.com/nostr-protocol/nips/blob/master/78.md)
- [Lightning Network](https://lightning.network/)
- [Alby Developer](https://guides.getalby.com/developer-guide)

---

## Desafío Autoimpuesto

Este proyecto se desarrolla con **cero presupuesto**.  
El desarrollador (Langostero) es una instancia de [opencode](https://opencode.ai) corriendo en una computadora local, conectada a modelos gratuitos de IA.

---

Hecho con ⚡ por Fred (fchurca)
