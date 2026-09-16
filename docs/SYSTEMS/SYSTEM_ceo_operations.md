# SYSTEM — CEO / Operations Foundation

## Architecture

CEO Control Center (`/admin/owner`) agrega:

| Panel | Pregunta operacional | Fuente |
|-------|----------------------|--------|
| Supply Today | ¿Hay candidatos hoy? ¿Sticky vs Fresh? | `buildSupplyToday` |
| Supply Truth | ¿Verified en ventanas today/24h/7d? | suma `hunter_supply_runs.verified_deals` (lite; sin registry/fs) |
| Moderation | ¿Backlog / throughput / reclaim? | `buildModerationOpsStats` |
| Attribution Truth | ¿Clicks con canal/destination? | `buildAttributionTruth` |
| System Health | ¿Qué subsistema está degradado? | `buildSystemHealthSnapshot` |
| Circuit Bottleneck | ¿Dónde se atasca el circuito? | `pickCircuitBottleneck` |

## Sticky vs Fresh (semántica corregida)

- **discovered / verified** = todos los runs del día (sticky + fresh)
- **freshDiscovered / freshVerified** = runs cuyo `source_id` **no** empieza por `sticky_`
- **sticky\*** = solo `source_id like sticky_%` (remap documentado en `sumStickyByNicheToday`)
- **freshApprovalReady** = null hasta que fresh persista approvalReady real
- **approvalReady** (Today) = stickyApprovalReady (único persistido hoy)

Nunca mezclar Supply Today con Supply Truth sin etiquetar.

## Attribution Truth

Muestra volumen, attributed clicks, completeness.  
**conversions = N/A**, **confirmed revenue = N/A** (no inventar dinero).

## System Health statuses

`healthy | degraded | blocked | unknown` por componente:

supply, moderation, attribution, price_memory, database, worker, cron, money

## Bottleneck detection

Prioridad: integrity → affiliate_tags → live_starvation → moderation_backlog → supply_stale → no_outbound → **attribution_gap** → none

Thresholds centralizados en `circuitBottleneck.ts` (LIVE_MIN, PENDING_RED/YELLOW, AGE_RED_HOURS, completeness < 40%).

## Load readiness (audit)

| Escala ofertas/día | Riesgo actual | Mitigación existente |
|--------------------|---------------|----------------------|
| 100–500 | OK | claim cap 1000, ops sample 500 |
| 1_000 | Moderado | índices offers pending; outcomes append |
| 5_000–10_000 | claim-next O(cap) + sort in-memory; supply runs `.limit(500)` undercount | Subir índices / paginar; no full-table |
| Events | offer_events volume alto | dedupe 10m outbound |

**No se hizo micro-optimización prematura.** Problemas reales corregidos: semántica sticky/fresh, attribution completeness signal.

## Money / Supply safety

WRITE=0 esperado. Money path frozen = healthy.  
No botones destructivos en CEO.

## Docs relacionadas

- `docs/SYSTEMS/SYSTEM_attribution.md`
- `docs/SYSTEMS/SYSTEM_moderation.md`
