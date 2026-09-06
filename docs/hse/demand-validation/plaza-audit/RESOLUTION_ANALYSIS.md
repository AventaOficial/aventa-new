# Resolution Analysis

## Señales buscadas

| Señal | ¿Existe? | Observación |
|---|---|---|
| status | Sí (`pending\|approved\|closed`) | 0 filas; `closed` nunca usado |
| Comentarios/replies a request | No | — |
| Links ligados a request | No `request_id` | — |
| Clicks/outbound ligados | No FK | `offer_events` sin request |
| Votes sobre request | No | — |
| Confirmación del autor “resuelto” | No UI/API | — |
| Edición / cierre desde UI | No observada en código Plaza | — |

## Veredicto

> **RESOLUTION = UNKNOWN**

Incluso con `status = closed` futuro, sin feedback del autor / outcome, no sería resolución confiable de necesidad.

**No inferir** resolución por una oferta publicada tras «Ayudar a cazar» (sin vínculo).
