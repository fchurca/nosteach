# AGENTS.md — Instrucciones para Agentes de Código

## Contexto del Proyecto

**NosTeach** es una plataforma educativa descentralizada construida sobre Nostr.
- **Hackathon**: FOUNDATIONS - La Crypta Lightning Hackathons 2026
- **Premio**: 1,000,000 sats
- **Info**: https://hackaton.lacrypta.ar/hackathons/foundations.html

### Concepto

NosTeach permite:
- **Profesores** publicar cursos como eventos Nostr (kind 30078)
- **Alumnos** consumir contenido y tomar evaluaciones
- **Patrocinadores** apoyar con zaps Lightning

### Stack Técnico

| Capa | Tecnología |
|------|------------|
| Frontend | Vite + Vanilla JS |
| Nostr | nostr-tools (WebSocket directo a relays) |
| Pagos | @getalby/sdk (NWC), webln |
| Storage | Relays Nostr (NIP-78) |
| Auth | Nostr keypair (NIP-07, NIP-46) |
| Tests | Playwright |

### Relays en Uso

```
nos.lol, relay.damus.io, purplepag.es, filter.nostr.wine, relay.snort.social, inbox.nostr.wine
```

Nota: Algunos relays no funcionan (nostr.band, e.nostrar.io).

### Usuario de Testing

Los datos de testing están en `.secrets` (NO COMMITEAR):
- Copiar `.secrets.example` a `.secrets` y completar
- O setear `TEST_NSEC` como variable de entorno
- **nombre**: debbie

### Secretos y Credenciales

**REGLA CRÍTICA**: NUNCA poner secrets en código o documentación commiteable.

1. **Origen de secrets**: Siempre leer desde `.secrets` o variables de entorno
2. **No hardcodear**: Ni en código, ni en tests, ni en documentación
3. **Archivos .secrets**: Siempre en `.gitignore` (ya configurado)
4. **Pattern a usar**:
   ```javascript
   import { readFileSync, existsSync } from 'fs';
   
   let MY_SECRET = process.env.MY_SECRET;
   if (!MY_SECRET && existsSync('.secrets')) {
     const secrets = readFileSync('.secrets', 'utf-8');
     const match = secrets.match(/MY_SECRET=(.+)/);
     if (match) MY_SECRET = match[1];
    }
    ```

### Debug Mode

Para habilitar logs de debug en la consola del browser:

1. **URL param**: Agregar `?debug=true` a la URL
   ```
   http://localhost:5173/?debug=true
   ```

2. **localStorage**: Ejecutar en la consola:
   ```javascript
   localStorage.setItem('debug', 'true')
   ```
   Para desactivar: `localStorage.removeItem('debug')` o `?debug=false` en la URL.

El flag se mantiene en localStorage hasta que se desactive manualmente.

### Git Operations

**El usuario gestiona**: Commits, pushes y operaciones de escritura.
  - NUNCA proponer o hacer commits uno mismo - siempre pedirle al usuario que lo haga
  - EXCEPCIÓN: si el usuario pide un estado de git con intención de resumir tareas, podés proponer un mensaje de commit corto de una línea
  - Antes de proponer cualquier operación git que cambie el estado del repositorio, verificar primero con `git status` el estado actual
  - Mostrar diff antes de commit
  - Pedir confirmación del mensaje de commit
  - Nunca hacer push sin autorización explícita

---

## Reglas de Trabajo

### Comunicação

1. **No asumas** — Preguntá antes de hacer cambios grandes
2. **Explicá mientras hacés** — El usuario está aprendiendo
3. **Código funcional** — Mejor poco y funcionando que mucho y roto
4. **Testea** — Siempre verificá que compile y corra
5. **Sé práctico** — Menos teoría, más ejemplos

### Idioma

- **Interfaz**: Castellano rioplatense neutro (como noticiero argentino)
- **No lunfardismos** — Evitar "tecate", "pibe", "che", "boludo", etc.
- **Comandos en inglés** para código, comentarios técnicos

### Code Style

1. **Sin comentarios** a menos que el usuario los pida
2. **Clases** para componentes (no hooks de React)
3. **CSS vanilla** con variables CSS
4. **WebSocket directo** en vez de SimplePool (no funciona con Vite)

### UI/UX

- **Modales**: Si la pantalla es tan compleja que el usuario extrañaría cerrarla accidentalmente, no es un modal. Los modales deben poder cerrarse con ESC y con click fuera. Nunca se cierran automáticamente.

- **Navegación**: El usuario debe poder navegar sin perder contexto.

### Testing

1. **Levantar el servidor primero**: `npm run dev` (corre en puerto 5173)
2. **En otra terminal**: ejecutar `npm test` después de cambios
3. **Playwright**: ya está instalado, requiere dependencias del sistema (`npx playwright install-deps chromium`)
4. **Tests manuales**: abrir http://localhost:5173 en el browser

### Lightning Wallet para Testing

Crear wallet de prueba:
```bash
curl -X POST https://lncurl.lol
```

Respuesta: `nostr+walletconnect://...?lud16=username@getalby.com`

Crear invoice para recibir sats (ej: 210 sats):
```bash
# 1. Obtener LNURLp del lightning address
curl "https://username@getalby.com/.well-known/lnurlp/username"

# 2. Crear invoice (amount en milisats)
curl "https://getalby.com/lnurlp/username/callback?amount=210000"
```

Monitorear pago de invoice:
```bash
# Verificar estado (usar el verify URL del response o polling)
curl "https://getalby.com/lnurlp/username/verify/{payment_hash}"
```

Guardar en `.secrets`:
- NWC URL completa (privada)
- Lightning address comentada

---

## Flujo de Trabajo

### 1. Objetivo del Agente

Hacer ganar al usuario en la hackathon. Construir un proyecto lo suficientemente bueno para ganar.

### 2. Al Iniciar Sesión

1. Leer `AGENTS.md` y `docs/ROADMAP.md`
2. Entender el estado actual del proyecto
3. Verificar que el servidor corra en puerto 5173
4. Correr tests: `npm test`

### 3. Al Proponer Cambios

- Explicar qué se va a hacer
- Pedir confirmación antes de ejecutar
- Después de cambios, comittear o proponer mensaje de commit

### 4. Commit Messages

Formato:
```
<tipo>: <descripción corta>

<tipo> = feat | fix | chore | docs | test | refactor
```

Ejemplos:
```
feat: MVP exploratorio con auth Nostr y cursos básicos
fix: session state sync entre UserMenu y App
docs: actualizar ROADMAP con estado actual
```

---

### 5. Antes de Commit

- Cuando el usuario pida un commit message, además proponer actualizar el changelog
- Si no hay cambios relevantes, avisar explícitamente

---

## Estructura del Proyecto

```
nosteach/
├── src/
│   ├── main.js              # Entry point
│   ├── App.js               # Componente principal, routing
│   ├── components/
│   │   ├── UserMenu.js     # Login dropdown, sesión
│   │   ├── RoleSelector.js # Selector de roles
│   │   ├── CourseView.js   # Vista de detalle de curso
│   │   └── UserProfile.js  # Perfil de usuario
│   ├── lib/
│   │   ├── schema.js       # Validación de datos
│   │   └── constants.js    # Relays, kinds, precios
│   └── styles/
│       └── main.css        # Estilos
├── tests/
│   ├── e2e.mjs             # Tests básicos (13 pasando)
│   └── full-test.mjs       # Tests exploratorios
├── public/
│   └── index.html
├── README.md
├── AGENTS.md               # Este archivo
├── docs/
│   ├── CHANGELOG.md
│   ├── ISSUES.md
│   ├── PITCH-FOUNDATIONS.md
│   └── ROADMAP.md
└── package.json
```

---

## Modelo de Datos

### Curso (Kind 30078)

```json
{
  "kind": 30078,
  "tags": [
    ["d", "nosteach-curso-{timestamp}-{random}"],
    ["t", "nosteach"],
    ["t", "curso"]
  ],
  "content": {
    "titulo": "...",
    "descripcion": "...",
    "precio": 0,
    "modulos": [
      { "tipo": "texto", "contenido": "..." },
      { "tipo": "enlace", "url": "...", "titulo": "..." }
    ],
    "evaluacion": {
      "preguntas": [
        { "pregunta": "...", "opciones": ["A","B","C"], "correcta": 0 }
      ]
    }
  }
}
```

### Evaluación (Kind 1)

```json
{
  "kind": 1,
  "tags": [
    ["e", "<curso-event-id>"],
    ["p", "<maestro-pubkey>"],
    ["t", "nosteach-evaluacion"]
  ],
  "content": "{\"respuestas\":[0,2,1],\"timestamp\":...}"
}
```

---

## Roadmap Status

### 🚧 ETAPA 1: MVP - Fundamentos (EN PROGRESO)
- [ ] Estructura del proyecto
- [ ] Conexión Nostr + Publicar/Lista cursos
- [ ] Publicar curso (Maestro)
- [ ] Listar cursos (Alumno)
- [ ] Sistema de Roles y Navegación
- [ ] Ver curso y evaluar
- [ ] Verificación

### ETAPA 2: Pagos Lightning ⏳ Pendiente
- [ ] Integración con Alby/NWC para criar invoices
- [ ] Verificación de pago antes de mostrar contenido
- [ ] Configurar precio por curso
- [ ] Bonus por aprobar evaluación

### ETAPA 3: Evaluaciones Avanzadas ⏸️ Pendiente
### ETAPA 4: Patrocinios y Recompensas ⏸️ Pendiente

---

## UX/UI Notes

Del análisis de UX del 2026-03-19:

### Problemas Críticos
- Inputs sin labels (accesibilidad WCAG)
- Contraste de texto insuficiente (opacity 0.4)
- Dropdown muestra caracteres de formato
- No hay validación en tiempo real en formularios

### Mejoras Rápidas Sugeridas
- Agregar skeleton loaders en vez de "Cargando..."
- Toast notifications en vez de alerts nativos
- Botón de eliminar para módulos/preguntas dinámicos
- Breadcrumbs en páginas internas

### Fraseo
| Original | Sugerencia |
|----------|------------|
| "zapear" | "enviar un apoyo" o "apoyar con sats" |
| "patrocionador" | "mecenas" o "financiador" |
| "vive en relays" | "se almacena en relays" |
| "publicá tu conocimiento" | "compartí tu conocimiento" |

---

## Al Finalizar la Hackathon

Ayudar al usuario a:
1. Escribir un buen README
2. Grabar un demo (video o screenshots)
3. Preparar el pitch de 3 minutos
4. Subir el proyecto a GitHub
5. Hacer PR agregando su proyecto a `data/projects/foundations.json` en el repo de la hackathon
