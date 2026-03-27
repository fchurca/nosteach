# NosTeach - Roadmap

**Hackathon**: FOUNDATIONS - La Crypta Hackathons 2026  
**PR**: https://github.com/lacrypta/hackathons-2026/pull/X

## Integrantes

| Nombre | GitHub | Rol |
|--------|--------|-----|
| Fred | fchurca | Lead Dev |
| Langostero | fchurca | Dev |

---

## PITCH

### Problema
La educación online actual está centralizada en plataformas que:
- Cobran suscripciones altas
- Se quedan con tus datos
- Pueden censurar contenido
- Cobran fortunas por certificaciones

### Solución
**NosTeach** es una plataforma educativa **descentralizada** donde:
- Los **maestros** publican cursos como eventos Nostr (NIP-78)
- Los **alumnos** consumen contenido ydan evaluaciones
- Los **patrocinadores** pueden becar o premiar en sats

### Diferenciadores
| Tradicional | NosTeach |
|-------------|----------|
| Plataformas centralizadas | Sin servidor, solo relays Nostr |
| Suscripción mensual | Paga por curso (micropagos en sats) |
| Certificados centralizados | Reputación on-chain via Nostr |
| Contenido censurable | Resistencia a censura via Nostr |

### Modelo de negocio
- **Alumno → Maestro**: Paga por curso (NWC/LNURL)
- **Maestro → Alumno**: Premia por buen rendimiento (en sats)
- **Patrocinador → Curso**: Patrocina contenido
- **Patrocinador → Alumno**: Beca a estudiantes

---

## 🛠️ Stack técnico

| Capa | Tecnología |
|------|-------------|
| Frontend | Vite |
| Nostr | nostr-tools (WebSocket directo) |
| Pagos | @getalby/sdk (NWC), webln |
| Storage | Relays Nostr (NIP-78) |
| Auth | Nostr keypair (NIP-07) |
| Tests | Playwright |

---

## 🔐 Sistema de Roles y Permisos

### Roles disponibles

| Rol | Descripcion |
|-----|-------------|
| Teacher | Puede publicar cursos y zappear students |
| Student | Puede tomar evaluaciones y zappear teachers |
| Sponsor | Puede zappear teachers y students, patrocinar cursos |

### Matriz de permisos

| Feature | Teacher | Student | Sponsor | Publico |
|---------|---------|---------|---------|---------|
| Ver cursos | ✅ | ✅ | ✅ | ✅ |
| Publicar curso | ✅ | ❌ | ❌ | ❌ |
| Tomar evaluacion | ❌ | ✅ | ❌ | ❌ |
| Zap a teachers | ❌ | ✅ | ✅ | ❌ |
| Zap a students | ✅ | ❌ | ✅ | ❌ |
| Patrocinar | ❌ | ❌ | ✅ | ❌ |

**Notas:**
- Teacher no zappea teacher
- Roles son simultaneos y acumulativos
- Se persisten en localStorage (para MVP)

### Perfil de usuario (kind 0)

```json
{
  "name": "...",
  "display_name": "...",
  "picture": "...",
  "lud16": "user@lightning.address",
  "lnurl": "lnurl...",
  "nosteach_roles": {
    "teacher": true,
    "student": false,
    "sponsor": true
  },
  "nosteach_zapper": "delegated",
  "nosteach_nwc": "nostr+walletconnect://..."
}
```

### Zap flow

```
Zap
├── Delegated (default): genera LNURL/QR para wallet externa
└── NWC (opcional): usa NWC del perfil kind 0

Configuracion en kind 0:
- nosteach_zapper: "delegated" | "nwc"
- nosteach_nwc: URL NWC (opcional)
```

### Preguntas resueltas

| Pregunta | Respuesta |
|----------|-----------|
| Persistencia roles | localStorage (para MVP) |
| Config zapper | kind 0 |
| Zap recipients | Del kind 0 del usuario (lud16/lnurl) |
| Student evaluation | Contenido visible → toma evaluacion (gratis) |
| Teacher respuestas | Query manual a relays (dashboard en Social) |

### Pending items (Social Stage)

- Limite de inscriptos
- Browser publico (filtrar cursos publicos vs todos)
- Suscripciones
- Identificacion de students/teachers por curso
- Notificaciones
- Dashboard de respuestas para teachers
- Sincronizar roles a kind 0

---

## 📅 ROADMAP

### 🚧 ETAPA 1: MVP - Fundamentos (COMPLETADO)

**Objetivo**: Demo funcional de publicación y consumo de cursos

#### Decisiones de arquitectura

| # | Decisión | Opción |
|---|----------|--------|
| 1 | Identificación de curso | `d` tag |
| 2 | Kind para curso | 30078 |
| 3 | Kind para evaluación | Kind 1 |
| 4 | Reintentos | Entradas nuevas (no modificables, feature de trazabilidad) |
| 5 | Relays | Configurables, default 3 públicos |
| 6 | Precio | Lista + custom |

#### Relays por defecto

```javascript
const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band'
];
```

#### Lista de precios

```javascript
const PRECIOS = [
  { label: "Gratis", value: 0 },
  { label: "21 sats", value: 21 },
  { label: "69 sats", value: 69 },
  { label: "210 sats", value: 210 },
  { label: "690 sats", value: 690 },
  { label: "2,100 sats", value: 2100 },
  { label: "Custom", value: null }
];
```

**Validación custom**: Si custom > 21,000,000 BTC en sats → "y cómo vas a pagar eso?"

#### Estructura de archivos

```
src/
├── main.js
├── App.js
├── components/
│   ├── NostrConnect.js      # Conexión wallet
│   ├── CourseList.js        # Lista de cursos
│   ├── CourseCard.js        # Card individual
│   ├── CourseView.js        # Vista de curso + pagos
│   ├── CourseForm.js       # Form crear curso (maestro)
│   ├── EvaluationForm.js    # Tomar evaluación
│   ├── ZapButton.js         # Botón de zap reutilizable
│   ├── InvoiceModal.js      # Modal con QR y pago
│   └── EvaluationList.js    # Lista de respuestas
├── lib/
│   ├── nostr.js           # Wrapper NDK
│   ├── lightning.js        # Wrapper WebLN + LNURL
│   ├── schema.js           # Validación de datos
│   └── constants.js        # Relays, kinds, precios
└── styles/
    └── main.css
```

#### Modelo de datos

**Curso (Kind 30078):**
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

**Evaluación (Kind 1):**
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

#### Sprints

| Sprint | Descripción | Estado |
|--------|-------------|--------|
| 1.1 | Estructura del proyecto | ✅ Completado |
| 1.2 | Conexión Nostr + Publicar/Lista cursos | ✅ Completado |
| 1.3 | Publicar curso (Maestro) | ✅ Completado |
| 1.4 | Listar cursos (Alumno) | ✅ Completado |
| 1.5 | Sistema de Roles y Navegación | ✅ Completado |
| 1.6 | Ver curso y evaluar | ✅ Completado |
| 1.7 | Verificación | ✅ Completado |

---

### ✅ ETAPA 2: Pagos Lightning (COMPLETADO)

**Objetivo**: Monetización de cursos

| Feature | Descripción |
|---------|-------------|
| Cobrar por curso | Invoice LNURL cuando alumno quiere acceder |
| Pago al maestro | Funds van directo a wallet NWC del maestro |
| Gratis/Paid | Maestro define si curso es gratuito o pago |
| Reward por evaluación | Maestro define bonus en sats por aprobar |

**Flow técnico:**
```
Alumno clickea "Inscribirse" 
  → Frontend genera invoice (LNURL-pay del maestro)
  → Alumno paga con WebLN/NWC
  → Frontend verifica pago
  → Alumno puede ver contenido
```

**Entregables**:
- [x] Integración con WebLN (Alby) para pagos
- [x] Invoice modal con QR code
- [x] Pagos para evaluaciones (student paga para enviar respuestas)
- [x] Zap a profesores (sponsor zap unconditional)
- [x] Premiar a estudiantes (teacher zap student)
- [x] Ver respuestas de evaluaciones (teacher dashboard)
- [ ] Invoice estáticas para patrocinios recurrentes (próximo sprint)
- [ ] NWC para conectar wallet propia (próximo sprint)

---

### 🔴 ETAPA 3: Evaluaciones Avanzadas (Semana 3)

**Objetivo**: Sistema de evaluación robusto

| Feature | Descripción |
|---------|-------------|
| Multiple choice | Preguntas con opciones, respuesta única/múltiple |
| Puntuación manual | Maestro revisa y califica respuestas abiertas |
| Histórico de notas | Alumno tiene registro on-chain de calificaciones |
| Certificado digital | Evento Nostr de "aprobación" firmado por maestro |

**Estructura evaluación:**
```json
{
  "tipo": "multiple_choice",
  "preguntas": [...],
  "ponderacion": [10, 20, 30, 40],
  "nota_minima": 70
}
```

**Entregables**:
- [ ] Tipos de preguntas (opción múltiple, abierta)
- [ ] Cálculo automático de nota
- [ ] Revisión manual por maestro
- [ ] Evento de "certificación" (kind 30078 con tag "certificado")

---

### 🏆 ETAPA 4: Patrocinios y Recompensas (Semana 4)

**Objetivo**: Ecosistema de financiamiento bidireccional

| Feature | Flujo |
|---------|-------|
| Patrocinar curso | Patrocinador paga para que curso sea gratis |
| Becar alumno | Patrocinador cubre costo de curso de un alumno |
| Premiar desempeño | Maestro da bonus sats a mejores alumnos |
| Rewards externo | Empresa patrocina cursos relacionados a su producto |

**Arquitectura de sponsors:**
```json
{
  "tipo": "sponsor",
  "monto": 5000,
  "destino": "curso:123",
  "condiciones": "primeros 10 alumnos"
}
```

**Entregables**:
- [ ] Dashboard de patrocinadores
- [ ] Sistema de filtros (becas por mérito, necesidad, etc.)
- [ ] Lightning address para recibir sponsor
- [ ] Tracking de incentivos pagados

---

## 💰 Estimación de costos

- **Infraestructura**: $0 (solo relays públicos)
- **Dominio**: ~$10/año (opcional)
- **Lightning**: Sin costo si usás NWC de Alby
