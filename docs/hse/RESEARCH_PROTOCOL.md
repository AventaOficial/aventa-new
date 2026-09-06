# HSE Research Protocol

**ID:** HSE-00  
**Versión del protocolo:** 0.1.0  
**Fecha de establecimiento:** 2026-09-06  
**Producto baseline:** AVENTA (CONTROL — no modificar en HSE-00)

---

## 1. Propósito

Definir un marco experimental reproducible para investigar la interacción humano–AVENTA.

El resultado de HSE **no** es “gusto de diseño”. Es:

- problemas situados en tareas  
- evidencia clasificada  
- hipótesis falsables  
- experimentos con control  
- métricas etiquetadas (`SIMULATED` | `OBSERVED`)

---

## 2. Principio fundamental (CONTROL)

AVENTA actual = **BASELINE / CONTROL**.

Prohibido recomendar cambios solo por estética o preferencia personal.

Checklist mínimo de una recomendación válida:

| # | Campo | Obligatorio |
|---|---|---|
| 1 | Problema | sí |
| 2 | Locus (pantalla / componente / flujo) | sí |
| 3 | Usuario modelo afectado | sí (USER-*) |
| 4 | Tarea afectada | sí (TASK-*) |
| 5 | Evidencia (nivel E*) | sí |
| 6 | Métrica deteriorada | sí si E≥2; si no → HYPOTHESIS ONLY |
| 7 | Modificación propuesta | sí |
| 8 | Riesgo introducido | sí |
| 9 | Plan de medición | sí |

Si falta evidencia → **`STATUS = HYPOTHESIS ONLY`**.

---

## 3. Definición formal de interacción

### 3.1 Interacción (definición)

Una **interacción** es un evento discreto iniciado por el usuario (o por el sistema en respuesta a una acción del usuario) que cambia el estado percibido de la interfaz, el foco, la información mostrada, o el estado de datos relevante a una tarea.

No todas las interacciones tienen el mismo **peso**. El peso se asigna en el análisis de tarea (ver [TIME_AND_MOTION.md](./TIME_AND_MOTION.md)), no a priori.

### 3.2 Taxonomía de eventos (mínima)

| Código | Evento | Peso relativo típico (orientativo, no normativo) |
|---|---|---|
| INT-CLICK | click | medio |
| INT-TAP | tap | medio |
| INT-HOVER | hover | bajo (desktop) |
| INT-SCROLL | scroll | bajo–medio (volumen importa) |
| INT-SWIPE | swipe | medio (móvil) |
| INT-FOCUS | focus (teclado/asistivo) | medio–alto en a11y |
| INT-INPUT | input de texto | alto |
| INT-SEARCH | búsqueda | alto |
| INT-SELECT | selección | medio |
| INT-FILTER | cambio de filtro | alto (cambia set de información) |
| INT-MODAL-OPEN | apertura de modal | alto |
| INT-NAV | navegación de ruta | alto |
| INT-BACK | regreso / back | medio–alto (coste de navegación) |
| INT-SUBMIT | submit | alto |
| INT-VOTE | voto | alto (compromiso + feedback) |
| INT-FAV | favorito | medio–alto |
| INT-COMMENT | comentario | muy alto |
| INT-OUTBOUND | outbound click (tienda) | crítico (outcome) |
| INT-ERROR | error percibido | alto (fricción) |
| INT-RETRY | reintento | alto |
| INT-ABANDON | abandono | crítico (outcome negativo) |

### 3.3 Jerarquía de unidades de análisis

```text
MICRO-INTERACTION
  → TASK INTERACTION
    → TASK
      → USER JOURNEY
        → SESSION
```

| Unidad | Definición |
|---|---|
| **MICRO-INTERACTION** | Evento atómico (p. ej. un tap en el corazón). |
| **TASK INTERACTION** | Secuencia de micro-interacciones con un sub-objetivo dentro de una tarea (p. ej. “abrir detalle y leer precio”). |
| **TASK** | Objetivo completo del catálogo (TASK-001…). |
| **USER JOURNEY** | Encadenamiento de tareas y etapas (ENTRY→…→OUTCOME) en un contexto de persona. |
| **SESSION** | Periodo continuo de uso acotado por entrada/salida (o timeout definido en el estudio). |

---

## 4. Modelo de journey (etapas)

```text
SESSION
  → ENTRY
  → DISCOVERY
  → EVALUATION
  → DECISION
  → ACTION
  → OUTCOME
```

| Etapa | Objetivo | Información típica | Decisiones | Interacciones típicas | Riesgos | Métricas (familia) |
|---|---|---|---|---|---|---|
| ENTRY | Orientarse / autenticarse si hace falta | marca, nav, estado de sesión | ¿continuar anónimo? ¿dónde empezar? | NAV, FOCUS | confusión de entrada | TIME, SCREENS |
| DISCOVERY | Encontrar candidatos | cards, filtros, ranking | ¿qué mirar? | SCROLL, FILTER, SEARCH, CLICK | overload, scroll infinito | SCROLLS, INTERACTIONS |
| EVALUATION | Juzgar valor | precio, descuento, tienda, votos, texto | ¿vale la pena? | CLICK, MODAL, SCROLL | confianza baja, anclaje engañoso | DECISIONS, INFORMATION ACCESS |
| DECISION | Elegir acción | señales de confianza | guardar / votar / salir / comprar | SELECT | fatiga decisional | DECISION COUNT |
| ACTION | Ejecutar | CTA, favorito, voto, outbound | confirmar | FAV, VOTE, OUTBOUND, SUBMIT | error, fricción F3+ | ERRORS, FRICTION |
| OUTCOME | Resultado | éxito/fracaso/abandono | ¿reintentar? | RETRY, ABANDON, BACK | abandono silencioso | TASK SUCCESS/FAILURE |

---

## 5. Modelo de fricción (F0–F5)

| Nivel | Nombre | Criterios objetivos (asignar si se cumple ≥1) |
|---|---|---|
| **F0** | Sin fricción | Tarea avanza sin corrección; sin error; sin backtrack; latencia percibida aceptable en el protocolo del estudio. |
| **F1** | Mínima | 1 micro-ajuste (hover/scroll extra menor) o 1 duda breve sin error; sin reintento. |
| **F2** | Moderada | ≥1 backtrack **o** ≥2 micro-acciones correctivas **o** búsqueda de información no evidente; sin abandono. |
| **F3** | Alta | Error recuperable **o** ≥2 backtracks **o** reintento ≥1 **o** bloqueo temporal (loading/validación) que altera el plan. |
| **F4** | Bloqueo | No se puede completar el siguiente paso sin salir del flujo, pedir ayuda externa, o cambiar de dispositivo/cuenta. |
| **F5** | Fracaso | Tarea no completada; abandono; o resultado incorrecto aceptado como “éxito” erróneo (error de decisión). |

La fricción se reporta por **etapa** y por **tarea**, con nivel de evidencia E*.

---

## 6. Baseline (CONTROL) — captura formal

Cada corrida de baseline debe registrar:

| Campo | Descripción |
|---|---|
| `protocol_version` | p. ej. HSE-00 / 0.1.0 |
| `product_version` | commit / release / fecha de build del CONTROL |
| `screen` | ruta o superficie (sin alterar UI) |
| `task_id` | TASK-* |
| `user_model_id` | USER-* |
| `agent_id` | AGENT-* (si aplica) |
| `steps` | secuencia ordenada |
| `interactions` | conteo por código INT-* |
| `time_estimate` | con etiqueta `SIMULATED` o `OBSERVED` |
| `errors` | lista |
| `friction_max` | F0–F5 |
| `outcome` | success / failure / abandon / inconclusive |
| `evidence_level` | E0–E5 |
| `notes` | texto libre no normativo |

**El baseline NO se modifica automáticamente.** Nuevos hallazgos generan hipótesis o experimentos, no reescritura silenciosa del CONTROL.

Plantilla sugerida (futuro HSE-01): `docs/hse/templates/BASELINE_RUN.md` — **no creada en HSE-00** salvo necesidad; el esquema anterior es la fuente de verdad.

---

## 7. Laboratorio experimental (arquitectura conceptual)

### 7.1 Separación

Propuesta de superficie **independiente** de producción:

- `/hse` **o** `/aventa-lab`

Separado de: `/` (Home), ofertas, login, admin, operaciones, etc.

### 7.2 Contenido permitido del lab (futuro)

- simulaciones  
- prototipos aislados  
- experimentos  
- dashboards de métricas HSE  
- escenarios TASK × USER  
- reportes  

### 7.3 Invariante

El laboratorio **nunca** altera producción por defecto.  
Sin feature flags que cambien el Home real sin autorización explícita de producto.

**HSE-00 no implementa el lab.**

---

## 8. Principio de no regresión

Una mejora **no** se acepta solo porque mejora una métrica aislada.

Si reduce clicks/taps pero aumenta errores, abandono, confusión, tiempo total, o pérdida de información crítica → puede ser **regresión HSE**.

### Criterio formal

Sea un experimento con métrica primaria \(M_p\) y conjunto de guardrails \(G = \{g_1..g_n\}\).

- **Éxito tentativo:** \(M_p\) mejora según criterio preregistrado **y** ningún \(g_i\) empeora más allá de umbral preregistrado.  
- **Regresión:** cualquier \(g_i\) crítico empeora (errores, abandono, task failure, trust collapse, a11y blocker) aunque \(M_p\) mejore.  
- **Inconcluso:** mejora de \(M_p\) con evidencia &lt; E3, o guardrails no medidos.

Guardrails mínimos recomendados: `ERROR COUNT`, `ABANDONMENT`, `TASK SUCCESS`, `FRICTION max`, barreras de accesibilidad críticas.

---

## 9. Consistencia entre documentos

| Concepto | Fuente canónica |
|---|---|
| Tareas | [TASK_CATALOG.md](./TASK_CATALOG.md) |
| Personas | [USER_MODELS.md](./USER_MODELS.md) |
| Agentes | [AGENT_ROLES.md](./AGENT_ROLES.md) |
| Métricas | [METRICS.md](./METRICS.md) |
| Tiempos/movimientos | [TIME_AND_MOTION.md](./TIME_AND_MOTION.md) |
| Psicología | [PSYCHOLOGY.md](./PSYCHOLOGY.md) |
| Confianza | [TRUST.md](./TRUST.md) |
| Accesibilidad | [ACCESSIBILITY.md](./ACCESSIBILITY.md) |
| Experimentos / HSE Score | [EXPERIMENT_DESIGN.md](./EXPERIMENT_DESIGN.md) |
| Evidencia | [EVIDENCE_MODEL.md](./EVIDENCE_MODEL.md) |

---

## 10. Validación HSE-00

- [x] Documentos mínimos creados bajo `docs/hse/`  
- [x] CONTROL / no modificar producción enunciado  
- [x] SIMULATED vs OBSERVED separado  
- [x] E0–E5 definido; prohibido confundir niveles  
- [x] Sin datos inventados de usuarios reales  
- [x] Protocolo reproducible por IDs (TASK/USER/AGENT/INT/E/F)  

---

## Próximas fases

| Fase | Objetivo |
|---|---|
| **HSE-01** | Captura baseline CONTROL (plantillas de corrida, sin UI prod) |
| **HSE-02** | Instrumentación de observación (solo lectura / telemetría ya existente; sin cambiar Home) |
| **HSE-03** | Scaffold del lab `/hse` o `/aventa-lab` (aislado) |
| **HSE-04** | Primer experimento controlado (EXPERIMENT A) con pre-registro |

---

## Seguridad

No Home · no componentes prod · no Supabase · no Rewards · no money · no Auth/API/DB · no Vercel/cron/extension · no WIP · no migration · no deploy · no push en HSE-00 salvo commit documental autorizado.
