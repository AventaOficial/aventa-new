# Data Inventory — Plaza E3

**Fuente:** Supabase project `mkgsrpsuvedwwlzmzmzh` · SQL READ-ONLY · 2026-09-06

## Contexto de base (no Plaza)

| Métrica | Valor | Nota |
|---|---|---|
| `auth.users` | 16 | Escala beta |
| Sign-in últimos 30d | 3 | No implica uso de Plaza |
| Sign-in últimos 90d | 4 | |
| `most_recent_sign_in` | 2026-08-31 | |
| `profiles` | 16 | |
| Offers by status | rejected 263 · pending 30 · approved 8 | Supply-side legacy/beta |
| `offer_events` | view 83 · share 2 · outbound 2 | Últimos eventos ~2026-08-31 |
| `cazar_cta` events | 0 | |

**Stakeholder:** usuarios de beta privada; **sin comunidad activa actual** orientada a Plaza.

## Plaza — `plaza_requests`

| Métrica | Valor |
|---|---|
| Total | **0** |
| pending | **0** |
| approved | **0** |
| closed | **0** |
| rejected | **N/A** — status no existe en CHECK |
| Distinct creators | **0** |
| with_budget / with_store / with_details | **0** |
| oldest / newest | **null** |

## Plaza — `plaza_discussions`

| Métrica | Valor |
|---|---|
| Total | **0** |
| pending / approved / hidden | **0** |
| Distinct authors | **0** |

## Respuestas a solicitudes

| Métrica | Valor |
|---|---|
| Tabla `request_responses` | **NO EXISTE** en Prod |
| Total respuestas | **UNKNOWN** (modelo ausente) → operacionalmente **0 posibles en schema** |
| Solicitudes con 0/1/N respuestas | **UNKNOWN** |

## Temporal

| Serie | Resultado |
|---|---|
| Requests por mes/semana | **vacío** (0 filas) |
| Respuestas por mes/semana | **UNKNOWN** |
| Tiempo a primera respuesta | **UNKNOWN** |

## Consultas realizadas (READ-ONLY)

1. `to_regclass` plaza_requests / plaza_discussions / request_responses (ambos proyectos)  
2. Aggregates `plaza_requests` status/creators/budget/store/details/min-max created_at  
3. Aggregates `plaza_discussions`  
4. `date_trunc` month/week on requests (vacío)  
5. `information_schema.columns` plaza_requests  
6. EXISTS request_responses  
7. Contexto: auth.users activity, profiles count, offers by status, offer_events by type, cazar_cta count  

**Proyecto sin tablas Plaza:** `oojshofrpbfwsiypcecr` (AventaOficial) — plaza_* = null.

## Métricas UNKNOWN (lista)

- Cualquier métrica de **respuestas** a requests  
- Tiempo de respuesta  
- Resolución confirmada por autor  
- request→offer→click path  
- “activas” semánticas más allá de status enum  
- Clasificación de demanda (muestra 0)  
- Rechazadas (no hay status rejected)
