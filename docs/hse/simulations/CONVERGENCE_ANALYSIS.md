# Convergence Analysis - HSE-02

**Label:** SIMULATED CONVERGENCE (E2)

## Estructura recurrente (muchos perfiles)

Para tareas de discovery/eval/outbound, la mayoria de corridas converge en:

```text
HOME → DISCOVERY (scroll/tabs/filter) → OfferCard → /oferta/[id] → (EVALUATION|ACTION)
```

Esto refleja la arquitectura CONTROL documentada en HSE-01 (detalle = ruta, no modal montado).

## Convergencias especificas

| Patron | Quienes (simulado) | Nota |
|---|---|---|
| Card → `/oferta/[id]` | Casi todos en 001-009,012-015 | Estructura del sistema |
| Outbound solo desde detalle | Todos en TASK-006 | Baseline: no outbound desde card |
| Auth wall en voto/fav anon | USER-A/B/G/H en 007/008 | Gates documentados |
| Publisher path ActionBar modal | USER-F en 010 | CONTROL upload |
| `/me` requiere auth | Anon → SIM-ERR-3 | Middleware |

## No-convergencia util

- USER-J minimiza pasos vs USER-A explora tabs.
- USER-D prioriza precio vs USER-C prioriza tienda/votos.
- USER-H no ve Plaza en tabbar; USER-I si en sidebar.

Etiqueta: **SIMULATED CONVERGENCE** - no prueba de comportamiento real.
