# Offer Connection — Solicitud → Oferta

## Búsqueda de vínculos (E3)

| Artefacto | Hallazgo |
|---|---|
| `request_id` en `offers` | **NO OBSERVED** en flujo Plaza / schema auditado |
| `offer_id` en respuestas Plaza | Tabla respuestas **ausente** |
| Prefill upload | Solo `title` query param — **sin** id de solicitud |
| `offer_events` | view/share/outbound/cazar_cta — **sin** request_id |
| Doc Fase 2 `request_responses` | Diseñado en docs; **no** en Prod |

## Pregunta crítica

> ¿Existe SOLICITUD → RESPUESTA → OFERTA → CLICK?

### NO OBSERVED CONNECTION

Cero ejemplos demostrables. Con 0 solicitudes, además imposible.

## Medible hoy

Solo conexiones **hipotéticas** no instrumentadas. Nada que contar.
