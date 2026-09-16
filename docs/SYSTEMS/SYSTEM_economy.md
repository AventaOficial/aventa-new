# SYSTEM — Economy Foundation (Conversion + Commission)

## Purpose

Representación determinística y auditable de:

```
click_id
  → conversion externa (futura, autoridad = red)
  → commission externa (futura, autoridad = red)
  → economic_event (audit)
  → settlement futuro (DISABLED)
```

**Esta fase no liquida dinero.** Rewards / payouts / settlement permanecen OFF.

## Separation of concerns

| Capa | Responsabilidad | Persistencia | Estado actual |
|------|-----------------|--------------|---------------|
| **ATTRIBUTION** | click identity + channel/destination | `reward_outbound_clicks` | LIVE |
| **ECONOMIC INGEST** | conversion + commission reportados por red | `affiliate_conversions`, `affiliate_commissions` | Foundation LIVE en schema; **ingest not connected** |
| **ACCOUNTING** | ledger de plataforma (ops) | `affiliate_ledger_entries` | Manual / gated |
| **SETTLEMENT** | commission → elegibilidad ledger → balance | — | **DISABLED** |
| **REWARDS** | creator share / holds / payouts | `creator_rewards`, `reward_payouts` | **OFF / frozen** |

Nunca mezclar: un click no es conversion; una commission approved no es balance disponible.

## Source of truth

| Entidad | Autoridad | Persistencia |
|---------|-----------|--------------|
| Click | `POST /api/track-outbound` | `reward_outbound_clicks` |
| Conversion | Red afiliada (webhook/API/CSV futuro) vía `recordConversion` | `affiliate_conversions` |
| Commission amount | Red afiliada (importe confirmado) vía `recordCommission` | `affiliate_commissions` |
| Audit | server append-only | `affiliate_economic_events` |

**Prohibido:** inventar conversion desde click; inventar commission = sale × %.

## Domain

### Conversion (`affiliate_conversions`)

- Identity: `UNIQUE(source, network, external_conversion_id)`
- Attribution: `attributed` | `unattributed` | `unresolved`
- Status: `received` → `pending` → `confirmed` | `rejected`; `confirmed` → `reversed`
- `order_amount_cents` opcional ≠ commission

### Commission (`affiliate_commissions`)

- Identity: `UNIQUE(source, network, external_commission_id)`
- FK `conversion_id` RESTRICT
- `gross_commission_cents` + `currency` desde fuente trusted
- Status: `reported` → `pending` → `approved` | `rejected`; `approved` → `reversed`
- `ledger_entry_id` **siempre NULL en foundation**

### Economic events (`affiliate_economic_events`)

Append-only: `created` / `status_transition`. Sin PII / secretos.

## Ledger boundary

```
commission (approved)
  → [settlement DISABLED]
  → ledger eligibility (futuro)
  → creator_rewards / payouts (OFF)
```

`ECONOMIC_LEDGER_BOUNDARY.settlementEnabled = false`

## Security

- Solo server-side `lib/economy/recordConversion|recordCommission`
- **No hay** API pública de ingest en esta fase
- Frontend no es autoridad de amount/currency/status/ledger_entry_id
- RLS ON, 0 policies; grants solo `service_role` (+ owner postgres)
- anon/authenticated: sin grants → no SELECT/INSERT vía Data API
- Webhook signature: **requerida antes de cablear red real**

## Production migration

| Item | Valor |
|------|-------|
| File | `docs/supabase-migrations/20260916_conversion_commission_foundation.sql` |
| Project | `mkgsrpsuvedwwlzmzmzh` (Aventa Cazadores de ofertas) |
| Applied via | `npx supabase db query --linked -f ...` |
| Date | 2026-09-16 |
| Effect | 3 tablas nuevas + índices + UNIQUE + RLS |
| Money delta | 0 (ledger/rewards/payouts counts unchanged on apply) |
| Seed data | **none** — 0 conversions / 0 commissions / 0 events |

## CEO Truth

`buildConversionCommissionTruth()`:

- `ingestSourceConnected: false` → **NOT CONNECTED** (≠ zero activity)
- counts desde tablas (0 si vacías)
- `revenue: { connected: false, label: "not connected" }`

## Code map

| Pieza | Path |
|-------|------|
| Types / transitions | `lib/economy/types.ts` |
| recordConversion | `lib/economy/recordConversion.ts` |
| recordCommission | `lib/economy/recordCommission.ts` |
| Audit | `lib/economy/appendEconomicEvent.ts` |
| CEO truth | `lib/economy/buildConversionCommissionTruth.ts` |
| Tests | `tests/economy/conversionCommissionFoundation.test.ts` |
| Detail (alias) | `docs/SYSTEMS/SYSTEM_conversion_commission.md` |

## Explicit non-goals (this phase)

- NO Amazon / Mercado Libre / other network webhooks
- NO settlement
- NO rewards activation
- NO payouts
- NO SUPPLY_ENGINE_WRITE
- NO fictitious prod inserts
