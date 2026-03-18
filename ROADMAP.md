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
| Nostr | NDK (@nostr-dev-kit/ndk) |
| Pagos | @getalby/sdk (NWC), webln |
| Storage | Relays Nostr (NIP-78) |
| Auth | Nostr keypair (NIP-07) |

---

## 📅 ROADMAP

### 🟢 ETAPA 1: MVP - Fundamentos (Semana 1)

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
│   ├── CourseView.js        # Vista de curso
│   ├── CourseForm.js       # Form crear curso (maestro)
│   └── EvaluationForm.js    # Tomar evaluación
├── lib/
│   ├── nostr.js           # Wrapper NDK
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

| Sprint | Descripción | Complejidad |
|--------|-------------|-------------|
| 1.1 | Estructura del proyecto | Baja |
| 1.2 | Conexión Nostr | Media |
| 1.3 | Publicar curso (Maestro) | Media |
| 1.4 | Listar cursos (Alumno) | Baja |
| 1.5 | Ver curso y evaluar | Media |
| 1.6 | Verificación | Baja |

**Detalle de sprints:**

**Sprint 1.1: Estructura del proyecto**
- [ ] Crear estructura de carpetas
- [ ] Configurar Vite con SDKs
- [ ] Crear `.env` con configuración
- [ ] Setup básico de CSS

**Sprint 1.2: Conexión Nostr**
- [ ] `lib/nostr.js`: connect, publish, query
- [ ] `NostrConnect.js`: NIP-07 + fallback keys

**Sprint 1.3: Publicar curso (Maestro)**
- [ ] Schema de validación
- [ ] `CourseForm.js`: título, desc, precio, módulos, evaluación
- [ ] Publicar kind 30078

**Sprint 1.4: Listar cursos (Alumno)**
- [ ] Query kind 30078 filtrado por "nosteach-curso-"
- [ ] `CourseList.js` + `CourseCard.js`

**Sprint 1.5: Ver curso y evaluar**
- [ ] `CourseView.js`: renderizar módulos
- [ ] `EvaluationForm.js`: preguntas + submit kind 1
- [ ] Easter egg: validación custom > 21M BTC

**Sprint 1.6: Verificación**
- [ ] Test end-to-end
- [ ] Verificar en Primal
- [ ] Limpiar código

**Estimación total**: 2-3 días

---

### 🟡 ETAPA 2: Pagos Lightning (Semana 2)

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
- [ ] Integración con Alby/NWC para criar invoices
- [ ] Verificación de pago antes de mostrar contenido
- [ ] Configurar precio por curso
- [ ] Bonus por aprobar evaluación

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
