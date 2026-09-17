# SYSTEM — CEO / Operations Foundation

## Architecture

CEO Control Center (`/admin/owner`) agrega:

| Panel | Pregunta operacional | Fuente |
|-------|----------------------|--------|
| Supply Today | ¿Hay candidatos hoy? ¿Sticky vs Fresh? | `buildSupplyToday` |
| Supply Truth | ¿Verified en ventanas today/24h/7d? | suma `hunter_supply_runs.verified_deals` (lite; sin registry/fs) |
| Moderation | ¿Backlog / throughput / reclaim? | `buildModerationOpsStats` |
| Attribution Truth | ¿Clicks con canal/destination? | `buildAttributionTruth` |
| Conversion / Commission | ¿Ingest económico? ¿counts? | `buildConversionCommissionTruth` |
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

Panel CEO (`data-ceo-attribution`):

- Persisted clicks / unique IDs / completeness / **attribution gap** (SoT = `reward_outbound_clicks`)
- Volume outbound etiquetado como `offer_events ≠ clicks`
- Top channels / campaigns
- **Conversion ingest = not connected** (capa ECONOMIC INGEST aún sin red cableada)
- Counts: `reported=0` cuando tablas vacías — distinto de “sistema ausente”
- **Revenue = not connected** (nunca $0 fingido; settlement OFF)

Definición gap: ver `docs/SYSTEMS/SYSTEM_attribution.md` (`isPersistedClickAttributionComplete`).  
Economy layers: ver `docs/SYSTEMS/SYSTEM_economy.md`.  
ML provider: `docs/SYSTEMS/SYSTEM_mercadolibre_affiliate.md` (`providers.mercadolibre.connected=false`).

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
- `docs/SYSTEMS/SYSTEM_economy.md`
- `docs/SYSTEMS/SYSTEM_mercadolibre_affiliate.md`
- `docs/SYSTEMS/SYSTEM_conversion_commission.md`
- `docs/SYSTEMS/SYSTEM_moderation.md`
