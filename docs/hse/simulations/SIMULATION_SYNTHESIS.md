# Simulation Synthesis — HSE-02 (Chief Scientist)

**Agent:** AGENT-14 HSE Chief Scientist / Synthesizer  
**Evidence ceiling:** E2  

## Separación de claims

| Tipo | Contenido |
|---|---|
| OBSERVATION FROM BASELINE (E3) | Rutas, componentes, gates auth, telemetría — `docs/hse/baseline/` |
| SIMULATION (E2) | 150 corridas en `runs/` |
| HYPOTHESIS | Friction hypotheses; potential abandonment; attention model |
| UNKNOWN | Tiempos reales; atención real; abandono real; copy exacto de todos los toasts |

## Conteos (SIMULATED)

| Métrica | Valor |
|---|---|
| Simulations | **150** |
| Outcomes SUCCESS | 126 |
| Outcomes FAILURE | 13 |
| Outcomes PARTIAL | 10 |
| Outcomes EXIT | 1 |
| Σ INTERACTION COUNT | **578** (SIMULATED) |
| Σ DECISION COUNT | **290** (SIMULATED) |
| Σ ERROR COUNT | **39** (SIMULATED) |
| TIME | **UNKNOWN** (todas) |

## Lo que la estructura CONTROL fuerza (baseline → simulación)

1. Discovery centra en Home feed + cards.  
2. Evaluación/acción profundas en `/oferta/[id]`.  
3. Outbound no parte del card.  
4. Auth walls cambian outcomes para anónimos (voto/fav/publish/me).  
5. Móvil vs desktop cambia chrome (Plaza, search, rail).

## Divergencias por modelo (simulado)

- Novatos/casuales: más incertidumbre, más abandono potencial, más fallos de auth.  
- Cazador/precio: distinta prioridad de información.  
- Recurrente/eficiencia: menos pasos; Para ti / CTA.  
- Publisher: carga en modal upload y `/me`.

## Recomendaciones de cambio de producto

**Ninguna en HSE-02.**

## Disclaimer obligatorio

Estos resultados representan **SIMULATED E2** y **NO** representan comportamiento observado de usuarios reales.
