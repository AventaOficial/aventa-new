# SYSTEM — Economy Foundation

## Purpose

```
click_id
  → attribution
  → [signature verification]
  → AffiliateNetworkAdapter (normalize)
  → conversion / commission / revision
  → economic_event (audit)
  → reconciliation (compare only)
  → settlement futuro (DISABLED)
```

**No liquida dinero.** Rewards / payouts / settlement OFF. Ninguna red live cableada.

## Layer responsibilities (una cada una)

| Capa | Responsabilidad | Persistencia | Estado |
|------|-----------------|--------------|--------|
| **ATTRIBUTION** | click identity | `reward_outbound_clicks` | LIVE |
| **NETWORK INGESTION** | HTTP + signature gate | — (sin webhook público) | **ML: NOT_SUPPORTED_BY_OFFICIAL_API** |
| **NORMALIZATION** | `AffiliateNetworkAdapter` EXTERNAL→NORMALIZED | in-memory types | Contract LIVE |
| **ECONOMIC EVENTS** | conversion / commission records | `affiliate_conversions`, `affiliate_commissions` | Schema LIVE; 0 rows |
| **REVISIONS** | append-only amount history | `affiliate_commission_revisions` | Schema LIVE |
| **RECONCILIATION** | network truth vs aventa truth | `affiliate_reconciliation_runs` / `_findings` | Foundation LIVE |
| **ACCOUNTING** | platform ledger | `affiliate_ledger_entries` | Manual / gated |
| **SETTLEMENT** | commission → balance | — | **DISABLED** |
| **REWARDS / PAYOUTS** | creator share | `creator_rewards`, `reward_payouts` | **OFF** |

## CURRENT ECONOMIC GRAPH

```
EXTERNAL NETWORK EVENT
  → verifyNetworkSignature()          # fail-closed si no hay adapter
  → AffiliateNetworkAdapter.parse     # nunca sale×%
  → NormalizedConversion|Commission|Revision
  → recordConversion / recordCommission / recordCommissionRevision
  → affiliate_economic_events (audit)
  → [ledger_entry_id = NULL]

Reconciliation:
  External snapshot  vs  affiliate_* tables
  → findings only (MATCHED / MISSING_* / *_MISMATCH / DUPLICATE / ORPHAN)
  → NO money mutation
```

## Adapter contract

`lib/economy/adapter/*`

- `AffiliateNetworkAdapter`: `verifySignature` + `parsePayload`
- Registry vacío en producción → `createNotConnectedAdapter`
- Test harness: `createTestAffiliateNetworkAdapter` (solo tests)
- `ingestNetworkHttpEvent` server-only — **sin** `app/api/webhooks/*`

## Signature boundary

```
HTTP/request → verifyNetworkSignature → adapter.parse → persist
```

Sin red seleccionada: siempre `network_not_connected`.  
No inventar algoritmo/header de proveedor desconocido.

## Commission revisions (append-only)

Tabla: `affiliate_commission_revisions`

- `UNIQUE(source, network, external_revision_id)`
- semantics: `delta` | `replacement`
- kinds: positive/negative_adjustment, correction, reversal
- **Nunca** `UPDATE affiliate_commissions SET gross_commission_cents`
- Effective amount = `applyRevisionsToGross(original, recorded revisions)`
- Status: `recorded` → `superseded` | `reversed`

## Conversion status changes

Reutilizan `transitionConversionStatus` + `affiliate_economic_events`.  
**No** tabla paralela de conversion revisions.

## Reconciliation

`runAffiliateReconciliation(snapshot)`:

- ventana temporal + source/network
- idempotency_key determinista
- persiste run + findings
- **no** modifica commissions/conversions/ledger/rewards/payouts

## CEO Truth

`buildConversionCommissionTruth()`:

| Campo | Semántica |
|-------|-----------|
| `networkConnectionStatus=not_connected` | sin adapter live |
| `connected_zero` | adapter registrado, 0 filas |
| `connected_with_data` | hay filas (aún no payable) |
| `revenue` | always **not connected** |
| `reconciliation.*` | unmatched / amount≠ / status≠ / orphan |

## Security

- Frontend no ingiere economía
- anon/authenticated sin grants en tablas nuevas
- RLS ON, 0 policies
- Adapter no puede settlement/payout
- Firma obligatoria antes de parse en path HTTP

## Migrations

1. `20260916_conversion_commission_foundation.sql` (aplicada PROD)
2. `20260916_economy_adapter_revisions_reconciliation.sql` (revisions + recon)

## Code map

| Pieza | Path |
|-------|------|
| Types / transitions | `lib/economy/types.ts` |
| Adapter types | `lib/economy/adapter/types.ts` |
| Registry / signature / ingest | `lib/economy/adapter/*` |
| Revisions | `lib/economy/revisions/*` |
| Reconciliation | `lib/economy/reconciliation/*` |
| CEO truth | `lib/economy/buildConversionCommissionTruth.ts` |
| Tests | `tests/economy/*` |

## Mercado Libre (first provider research)

See `docs/SYSTEMS/SYSTEM_mercadolibre_affiliate.md`.

**Economic ingest: NOT_SUPPORTED_BY_OFFICIAL_API.**  
Link tagging via env remains; seller OAuth ≠ affiliate commissions.
## Explicit non-goals

- NO invented ML affiliate webhooks/endpoints
- NO scraping Central de Afiliados
- NO sale � % commissions
- NO settlement / rewards / payouts / Supply WRITE
- NO fictitious prod inserts
