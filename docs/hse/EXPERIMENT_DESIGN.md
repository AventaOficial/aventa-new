# HSE Experiment Design & HSE Score (proposal)

**Protocolo:** HSE-00  
**Importante:** No ejecutar A/B en producción. No implementar lab todavía.

---

## 1. Estructura CONTROL vs EXPERIMENT

```text
CONTROL     = AVENTA actual (baseline)
EXPERIMENT A = variante aislada (lab / prototipo)
EXPERIMENT B = variante alternativa (opcional)
```

Cada brazo debe ser **versionado** y no alterar el Home real sin autorización explícita futura.

---

## 2. Plantilla de experimento (obligatoria)

| Campo | Descripción |
|---|---|
| `experiment_id` | p. ej. HSE-EXP-001 |
| `hypothesis` | Afirmación falsable |
| `independent_variable` | Qué cambia (IV) |
| `dependent_variables` | Qué se mide (DV) |
| `control` | Descripción del CONTROL |
| `population` | USER-* (simulada o reclutada) |
| `task_id` | TASK-* primaria |
| `primary_metric` | Una métrica primaria |
| `secondary_metrics` | Lista |
| `guardrails` | Métricas que no deben degradarse |
| `risks` | Riesgos de producto/usuario |
| `success_criterion` | Preregistrado |
| `failure_criterion` | Preregistrado (incluye regresión) |
| `evidence_plan` | E2 sim → E3/E5 |
| `status` | draft / preregistered / running / analyzed |

### Ejemplo esquemático (no corrido)

```text
hypothesis: Reducir campos visibles en card baja TIME en TASK-001 sin subir ERRORS en TASK-003.
IV: densidad de metadatos en card
DV primaria: M-TIME-TOTAL (TASK-001)
DV secundarias: SCROLLS, TASK SUCCESS
guardrails: ERRORS en TASK-003, TRUST self-report, a11y blockers
population: USER-A + USER-H (SIMULATED primero)
success: TIME↓ ≥ umbral Y guardrails OK
failure: cualquier guardrail crítico empeora
```

Valores numéricos de umbral se fijan al pre-registrar — **no inventados aquí**.

---

## 3. Principio de no regresión (aplicado a experimentos)

Ver [RESEARCH_PROTOCOL.md](./RESEARCH_PROTOCOL.md).  

Resumen: mejorar la métrica primaria **no basta**. Si guardrails críticos empeoran → **regresión** / failure_criterion.

Guardrails mínimos recomendados:

- TASK SUCCESS  
- ERROR COUNT  
- ABANDONMENT  
- FRICTION max  
- a11y Blockers  

---

## 4. HSE Score — framework experimental (NO definitivo)

**Estado:** propuesta de dimensiones · **sin score numérico oficial** en HSE-00.

### Dimensiones candidatas

| Dimensión | Pregunta | Métricas relacionadas |
|---|---|---|
| EFFICIENCY | ¿Bajo coste de interacción/tiempo con éxito? | TIME, INT, IE candidata |
| USABILITY | ¿Se puede usar sin errores graves? | ERRORS, FRICTION, SUCCESS |
| TASK SUCCESS | ¿Se completa la tarea? | M-OK / M-FAIL |
| COGNITIVE LOAD | ¿Esfuerzo mental excesivo? | M-COG proxies |
| TRUST | ¿Credibilidad suficiente para actuar? | M-TRUST, outbound |
| ACCESSIBILITY | ¿Barreras bloqueantes? | M-A11Y |
| FRICTION | ¿Nivel F* aceptable? | M-FRIC |
| DECISION QUALITY | ¿Decisiones informadas? | INFO ACCESS, errores de juicio |
| SATISFACTION | ¿Experiencia aceptable? | self-report (E4) |

### Cómo podría construirse después

1. Normalizar cada dimensión a una escala común **por estudio** (no global prematuro).  
2. Pesos **preregistrados** según objetivo del experimento (p. ej. cazadores vs novatos).  
3. Penalización dura si hay Blocker a11y o F5.  
4. Reportar siempre desglose dimensional — nunca solo un número opaco.  
5. Validar el score contra E4/E5 antes de usarlo para decisiones de producto.

Hasta entonces: **no calcular HSE Score como verdad de producto**.

---

## 5. Arquitectura del lab (recordatorio)

Superficie propuesta: `/hse` o `/aventa-lab`  
Contiene simulaciones, prototipos, dashboards, reportes.  
**No** modifica `/` Home ni flujos reales por defecto.

HSE-00 = documentación solamente.
