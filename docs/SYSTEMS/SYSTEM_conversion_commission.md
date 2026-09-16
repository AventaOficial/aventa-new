# SYSTEM — Conversion + Commission Foundation

## Purpose

Representación determinística y auditable de:

```
click_id → conversion → commission
```

**Sin liquidar dinero.** Settlement / rewards / payouts permanecen OFF.

## Source of truth

| Entidad | Autoridad | Persistencia |
|---------|-----------|--------------|
| Click | `POST /api/track-outbound` | `reward_outbound_clicks` |
| Conversion | Red afiliada (futuro webhook/API/CSV) vía `recordConversion` | `affiliate_conversions` |
| Commission amount | Red afiliada (importe confirmado) vía `recordCommission` | `affiliate_commissions` |
| Platform ledger | Admin CSV/manual (existente) | `affiliate_ledger_entries` |
| Creator payout | Rewards engine (existente, frozen) | `creator_rewards` → `reward_payouts` |

**Un click nunca crea conversion automáticamente.**

**Aventa no inventa commission = sale × %** sin confirmación de red.

Estado actual de ingest live: **not connected** (foundation only).

**PROD (2026-09-16):** migración aplicada en `mkgsrpsuvedwwlzmzmzh` — tablas vacías (0/0/0). Ver `docs/SYSTEMS/SYSTEM_economy.md` y `MIGRATION_20260916_conversion_commission_foundation.md`.

## Domain model

### Conversion (`affiliate_conversions`)

- Identity: `UNIQUE(source, network, external_conversion_id)`
- `click_id` opcional → attribution
- `attribution_status`: `attributed` | `unattributed` | `unresolved`
- `status`: `received` → `pending` → `confirmed` | `rejected`; `confirmed` → `reversed`
- `order_amount_cents` opcional (valor orden ≠ commission)

### Commission (`affiliate_commissions`)

- Identity: `UNIQUE(source, network, external_commission_id)`
- FK `conversion_id` (RESTRICT)
- `gross_commission_cents` + `currency` desde fuente trusted
- `status`: `reported` → `pending` → `approved` | `rejected`; `approved` → `reversed`
- `ledger_entry_id` **siempre NULL en foundation**

### Audit (`affiliate_economic_events`)

Append-only: created / status_transition. Sin PII.

## Attribution link

| Status | Significado |
|--------|-------------|
| attributed | `click_id` existe en `reward_outbound_clicks` |
| unattributed | sin `click_id` |
| unresolved | `click_id` enviado pero no resoluble |

Nunca inventar click.

## Ledger boundary

```
commission (approved)
  → [settlement DISABLED]
  → ledger eligibility (futuro)
  → creator_rewards / payouts (OFF)
```

`ECONOMIC_LEDGER_BOUNDARY.settlementEnabled = false`

## Idempotency

Insert + UNIQUE + recovery `23505` + reread canónico (mismo patrón que Attribution).

## Reversals

Capability modelada: `confirmed/approved → reversed`.  
**Ninguna red live conectada aún** → no hay webhook de refund cableado. Gap documentado.

## CEO

`buildConversionCommissionTruth()`:

- `ingestSourceConnected: false`
- counts desde tablas (0 si vacías) ≠ “actividad económica cero inventada”
- `revenue: not connected`

## Security

- Solo server-side `recordConversion` / `recordCommission`
- Frontend no es autoridad de amount/currency/status
- Tablas RLS ON, grants solo `service_role`
- Webhook signature: **requerida antes de cablear red real** (pendiente)

## Migration

`docs/supabase-migrations/20260916_conversion_commission_foundation.sql`

## Code map

| Pieza | Path |
|-------|------|
| Types / transitions | `lib/economy/types.ts` |
| recordConversion | `lib/economy/recordConversion.ts` |
| recordCommission | `lib/economy/recordCommission.ts` |
| CEO truth | `lib/economy/buildConversionCommissionTruth.ts` |
| Tests | `tests/economy/conversionCommissionFoundation.test.ts` |
