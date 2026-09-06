# HSE-01 — CONTROL Baseline Capture

**Fase:** HSE-01  
**Estado:** BASELINE CAPTURE COMPLETE — READY FOR REVIEW  
**Objetivo:** documentar cómo funciona **AVENTA HOY** (CONTROL), no cómo debería funcionar.  
**Evidencia dominante:** **E3 System Observation** (inspección de código).  
**Product version (git al capturar):** `d2949ad` (+ working tree WIP no incluido; ver git status).  
**Protocolo:** [../RESEARCH_PROTOCOL.md](../RESEARCH_PROTOCOL.md)

---

## Regla absoluta (cumplida)

Sin cambios a Home, componentes, UX/UI, analytics, APIs, Auth, Rewards, DB, lab `/hse`, deploy ni push.  
Solo documentación bajo `docs/hse/baseline/`.

---

## Documentos

| Archivo | Contenido |
|---|---|
| [CONTROL_BASELINE.md](./CONTROL_BASELINE.md) | Mapa de rutas, superficies, auth, mobile/desktop |
| [JOURNEY_MAP.md](./JOURNEY_MAP.md) | ENTRY→OUTCOME del CONTROL |
| [TASK_BASELINE.md](./TASK_BASELINE.md) | TASK-001…015 contra código |
| [INTERACTION_MAP.md](./INTERACTION_MAP.md) | Interacciones implementadas |
| [DECISION_MAP.md](./DECISION_MAP.md) | Puntos de decisión |
| [ERROR_MAP.md](./ERROR_MAP.md) | Errores y recovery |
| [ACCESSIBILITY_BASELINE.md](./ACCESSIBILITY_BASELINE.md) | a11y observado / UNKNOWN |
| [TELEMETRY_BASELINE.md](./TELEMETRY_BASELINE.md) | Eventos existentes |
| [UNKNOWN_AND_OPEN_QUESTIONS.md](./UNKNOWN_AND_OPEN_QUESTIONS.md) | Ambiguities |

---

## Etiquetas

| Etiqueta | Uso en HSE-01 |
|---|---|
| `E3` | Hecho verificado en código |
| `UNKNOWN` | No determinable sin runtime/usuarios |
| `IMPLEMENTED INTERACTION` | Código que implementa el evento |
| `OBSERVED USER INTERACTION` | **No usado** (sin E4 en esta fase) |
| `POTENTIAL FRICTION POINT` | Hecho objetivo de implementación (no juicio) |
| `OBSERVED TIME` | **UNKNOWN** para todas las tareas |

---

## Qué responde esta fase

> ¿Cómo funciona AVENTA HOY?

No responde:

> ¿Cómo debería funcionar?
