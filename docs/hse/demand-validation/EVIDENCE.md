# Evidence Register — HSE-05

## Niveles presentes en esta entrega

| Nivel | ¿Presente? | Contenido |
|---|---|---|
| E0 | Evitado como conclusión | — |
| E1 | Sí (heredado) | Hipótesis HSE-04; preguntas; criterios |
| E2 | No nuevo | No se re-simularon journeys como “usuarios” |
| E3 | Sí (observación sistema documentada) | Plaza / eventos — abajo |
| E4 | **No** | 0 entrevistas, 0 concierge |
| E5 | **No** | — |

## E3 — AVENTA solicitudes / demanda (observación; no validación de hipótesis)

Fuente: HSE-03 `CAZAR_OFERTAS_ANALYSIS.md` + código CONTROL.

| Hecho | Detalle |
|---|---|
| Existe Plaza `/plaza` | Solicitudes / conversaciones / avisos |
| API | POST `pending`, GET `approved`; sin reply/match/notify |
| Form | title + details; budget/store en API no enviados por UI |
| «Ayudar a cazar» | Prefill upload **sin** `request_id` |
| Telemetría | `view`, `outbound`, `share`, `cazar_cta` — **no** “request_resolved” |
| Lo que no podemos medir hoy (sin queries Prod) | # requests approved, tasas de respuesta, utilidad |

**Advertencia:** actividad futura en Plaza ≠ prueba de superioridad vs Google/PD.

## E4 planeado

Entrevistas (INTERVIEW_PROTOCOL) + Concierge (CONCIERGE_EXPERIMENT) + templates.

## Anti-patrones evitados

- No fabricar quotes.  
- No promover E1 a “los usuarios quieren X”.  
- No vender la solución en el protocolo de apertura.
