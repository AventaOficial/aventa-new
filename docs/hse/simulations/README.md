# HSE-02 — User Simulation Engine

**Status:** SIMULATION BASELINE COMPLETE — READY FOR REVIEW  
**Evidence:** **E2 Simulation** only  
**Disclaimer:** Resultados `SIMULATED` — **no** E4 / E5.

## Qué responde

> ¿Cómo podría comportarse cada tipo de usuario al utilizar AVENTA ACTUAL para las tareas definidas?

No responde comportamiento humano real.

## Fuente de verdad

- `docs/hse/baseline/` (HSE-01 CONTROL, E3)
- `docs/hse/USER_MODELS.md`
- `docs/hse/TASK_CATALOG.md`
- `docs/hse/METRICS.md`, `EVIDENCE_MODEL.md`, `AGENT_ROLES.md`

Si faltaba dato → `UNKNOWN` (nunca funcionalidad inventada).

## Contenido

| Path | Descripción |
|---|---|
| `runs/TASK-xxx/USER-y.md` | **150** corridas USER×TASK |
| `SIMULATION_MATRIX.md` | Matriz 15×10 |
| `DIVERGENCE_ANALYSIS.md` | Divergencias simuladas |
| `CONVERGENCE_ANALYSIS.md` | Convergencias simuladas |
| `FRICTION_HYPOTHESES.md` | Hipótesis de fricción (E2) |
| `SIMULATION_SYNTHESIS.md` | Síntesis Chief Scientist |
| `UNKNOWN_AND_LIMITATIONS.md` | Límites |

## Escala de error de simulación

`SIM-ERR-0` … `SIM-ERR-3` — **distinta** del Evidence Model E0–E5.

## Tiempo

`TIME = UNKNOWN` en todas las corridas (sin falsa precisión).

## Agentes

Diseño de corridas: AGENT-12 (primario), 01, 03, 05, 06, 07, 08, 09, 10, 11.  
Síntesis: AGENT-14.

## Conclusión obligatoria

Estos resultados representan **SIMULATED E2** y **NO** representan comportamiento observado de usuarios reales.
