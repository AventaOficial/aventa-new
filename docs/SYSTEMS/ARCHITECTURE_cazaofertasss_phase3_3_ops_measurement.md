# CAZAOFERTASSS — FASE 3.3 (OPERATING GROWTH + MEASUREMENT ENGINE)

Estado: **contratos + read-models analytics**. Sin cron. Sin adapters provider.
Sin scrapers. Sin money authority.

## Audit map (pre-implementación)

### EXISTENTE
- `DealPublicationMetrics` / `EMPTY_PUBLICATION_METRICS` (nullable)
- `PublicationRevenueMetricsView` + `derivePublicationRevenueMetrics`
- `DerivedRevenueMetrics` / reconcile (ledger FASE 3)
- AttributionCandidate KNOWN/UNKNOWN/AMBIGUOUS/CONFLICT
- TrackingIdentity + registry
- Outbox statuses PREPARED/SENDING/PUBLISHED/FAILED
- Telegram `sendMessage` → message_id (único observable de envío)

### MISSING (esta fase)
- Business event log operativo (no-revenue)
- Funnel derivado con rates seguros
- CazaDailySnapshot
- Publication performance queries
- Dashboard contract
- Telegram capability map explícito
- Operating loop documentation

### DUPLICATE (evitar)
- No reimplementar ledger revenue como “ops commission amount”
- No segundo registry de tracking
- No segundo EMPTY metrics con ceros

### AMBIGUOUS (resuelto en diseño)
- `COMMISSION` ops event = señal de correlación, **no** monto financiero
- `DerivedRevenueMetrics.clicks: number` (0) vs ops snapshot (`null` si no hubo eventos):
  ops usa null-si-ausente; ledger metrics cuentan eventos presentes

## Arquitectura

```
BusinessEvents (append-only, idempotent)
        ↓
Funnel / DailySnapshot / PublicationPerformance / Dashboard
        ↓
(analytics only — never Aventa money path)
```

Revenue known solo vía FASE 3 ledger + evidencia oficial.

## Telegram metrics

| Métrica | Kind |
|---------|------|
| send success/fail, message_id, chat_id, attempts | observable |
| pipeline counts by status | derivable |
| views / forwards / reactions / CTR nativo | **unknown** |

`TELEGRAM_VIEW` solo se emite con source `telegram|manual` y evidencia; no se inventa.

## Funnel

discovered → … → commission  
`safeRate`: null si denominador 0/null.

## Scalability

- Todo listado exige `limit` acotado
- Ventanas `from/to` obligatorias en queries diarias
- Prohibido `listAll` / `fetchAll`
- Índices lógicos: eventId, occurredAt window, publicationId, trackingLabel

## Daily operating loop (doc only — no cron)

| Momento | Acción |
|---------|--------|
| Inicio de día | Inspeccionar pipeline (prepared/sending/failed) |
| Durante el día | discovery → scoring → publication |
| Fin de día | `CazaDailySnapshot`, top categorías, pubs sin clicks, evidence/affiliate failures |

Horarios son orientación operativa, **no** schedule hardcodeado ni cron.

## Money isolation

Ops no escribe `creator_rewards`, `payout_intents`, `reward_payouts`,
`commissions`, `settlement`, ni `affiliate_ledger_entries` de Aventa.
