# SYSTEM — Mercado Libre Afiliados (MX)

## Verdict (2026-10-08 closeout)

**Classification: `NO_OFFICIAL_AUTOMATION_INTERFACE_FOUND`.**  
**Automation status: `BLOCKED_FOR_AUTOMATION`.**  
**Report schema: `OFFICIAL_REPORT_SCHEMA_NOT_PUBLISHED`.**  
**Affiliate economic ingest: `NOT_SUPPORTED_BY_OFFICIAL_API`.**

An external application cannot obtain affiliate conversions, approval state, confirmation, reversals, commission amounts, external IDs, or attribution evidence through a documented Mercado Libre mechanism.

Reviewed on 2026-10-08, official surfaces only:

| Surface | What it actually is | Usable for Aventa conversions? |
|---------|---------------------|--------------------------------|
| Programa de Afiliados y Creadores (MX/AR help) | Logged-in Central: links, etiquetas, colaboradores, Métricas and Ingresos (`en revisión`, `proceso de pago`). Metrics refresh about every 24h. | No. UI copy is not an API, export schema, or partner contract. |
| https://www.mercadolibre.com.mx/l/primerospasos-recorre-la-central-de-afiliados | Panel de métricas and ingresos. | No. |
| https://www.mercadolibre.com.mx/l/primerospasos-organiza-tus-links | Etiquetas in Central (manual, max 100). | No conversion feed. |
| https://www.mercadolibre.com.mx/l/como-se-calculan-tus-ganancias | Program policy, including the 24h window. | Policy, not events. |
| https://developers.mercadolibre.com.mx | Seller/catalog apps: OAuth, orders, billing reports, Display Ads metrics, marketplace campaigns. Search for an affiliate conversions API returns no such resource. | No. Seller orders, billing, and Display Ads are different products. |
| Seller “Descargar reporte / Excel de ventas” | Seller sales history. | No. Not affiliate authority. |

Not found in those sources: affiliate conversion endpoint, commission endpoint, webhook, poll API, published CSV/export column contract, or partner integration that lets a third-party app pull per-sale affiliate evidence.

Aventa therefore keeps ML affiliate economic ingest **fail-closed**. Absence of a feed is `DATA INCOMPLETE`, never zero sales.

Seller OAuth already in Aventa (`lib/integrations/mercadolibre`) is for **Supply/catalog** — **not** affiliate commission authority.

## Official capability matrix (summary)

| Capability | Support |
|------------|---------|
| Attribution window (24h last-click) | SUPPORTED (program policy) |
| Generate affiliate link | PARTIALLY (Central UI + Aventa `tag`/`matt_*`) |
| Tags / campañas | PARTIALLY (Central etiquetas ≤100) |
| Conversion reporting API | **NOT_SUPPORTED** |
| Commission reporting API | **NOT_SUPPORTED** |
| Conversion / commission IDs | **NOT_SUPPORTED** |
| Webhook (affiliate) | **NOT_SUPPORTED** |
| Polling API | **NOT_SUPPORTED** |
| Signature verification | **NOT_SUPPORTED** |
| Historical backfill API | **NOT_SUPPORTED** |
| Metrics API (affiliate) | **NOT_SUPPORTED** |
| Amount (confirmed cents) | **NOT_SUPPORTED** |
| CSV/export automation | UNKNOWN as a human download; schema **not published**. Status `OFFICIAL_REPORT_SCHEMA_NOT_PUBLISHED`. Do not scrape. |

Full machine-readable matrix: `lib/economy/providers/mercadolibre/capabilityMatrix.ts`

### Official sources used

- https://www.mercadolibre.com.mx/l/como-se-calculan-tus-ganancias
- https://www.mercadolibre.com.mx/l/primerospasos-recorre-la-central-de-afiliados
- https://www.mercadolibre.com.mx/l/primerospasos-organiza-tus-links
- https://www.mercadolibre.com.mx/l/primerospasos-suma-colaboradores
- https://www.mercadolibre.com.mx/landing/afiliados
- https://www.mercadolibre.com.ar/l/primeros-pasos-preguntas-frecuentes-afiliados (Métricas = Central UI, refresh ~24h)
- https://developers.mercadolibre.com.mx — no affiliate conversions/commissions resource
- Seller billing (`/billing`) and Display Ads metrics are seller/advertiser APIs, not this program

Machine-readable status:

- `MERCADOLIBRE_DISCOVERY_CLASSIFICATION`
- `MERCADOLIBRE_AUTOMATION_STATUS`
- `MERCADOLIBRE_OFFICIAL_REPORT_SCHEMA`

## Authentication

| Concern | Mechanism |
|---------|-----------|
| Affiliate program | ML user + Central UI session |
| Aventa link tagging | Server env `ML_AFFILIATE_TAG` / `ML_MATT_WORD` / `ML_MATT_TOOL` |
| Seller API (supply) | OAuth tokens — **must not** authorize affiliate commissions |
| Economic ingest | Disabled |

Flags (fail-closed):

```
AFFILIATE_MERCADOLIBRE_ENABLED=false   # default
AFFILIATE_MERCADOLIBRE_MODE=disabled   # default
```

Even if `ENABLED=true`, `economicIngestAllowed` remains **false** until an official API exists.

## Attribution

Official window: **24 hours**, last valid click.  
Aventa Attribution SoT remains `reward_outbound_clicks`.  
Without ML click/conversion IDs, Aventa cannot mark conversions as `attributed` from ML feed.

## Conversion / Commission / Revisions / Reconciliation

Foundation tables + adapter contract exist.  
ML adapter **refuses** `verifySignature` / `parsePayload` with `NOT_SUPPORTED_BY_OFFICIAL_API`.  
No webhook route. No poll client. No `sale × %` commissions.

## IDs

| ID | Status |
|----|--------|
| Aventa `click_id` | LIVE |
| ML affiliate conversion id | NOT_SUPPORTED |
| ML affiliate commission id | NOT_SUPPORTED |

## Rate limits / historical

N/A until affiliate event API exists. `historical_backfill = unsupported`.

## Security

- No public affiliate webhook
- No invented signatures
- No Central scraping / cookies
- Secrets only server-side
- Settlement / rewards / payouts OFF

## CEO

`providers.mercadolibre`: enabled / configured / **connected=false** / `BLOCKED_FOR_AUTOMATION` / economicAPI=NOT_SUPPORTED / settlement=OFF.  
Revenue: **not connected**. Growth sales label stays `DATA INCOMPLETE`.

## How to add another affiliate provider

Use the existing bridge. Do not add a Mercado Libre-shaped table or a second ledger.

1. Add the provider id to `AffiliateProvider` in `lib/affiliate/conversionBridge/contract.ts`.
2. Implement `AffiliateProviderAdapter.parseReport` only against a published schema, or an `AffiliateNetworkAdapter` only against a documented API.
3. Normalize into the canonical states (`PENDING`, `APPROVED`, `CONFIRMED`, `REVERSED`, `INVALID`). `PENDING` and `APPROVED` are not `CONFIRMED`.
4. Require an external conversion id, currency, and commission amount before `CONFIRMED`.
5. Match a click only by an exact unique reference. Otherwise the row stays `UNMATCHED` and cannot pay a hunter.
6. `MACHINE_HUNTER` and `SYSTEM` never become hunter rewards.
7. Persist through `recordConversion` / `recordCommission`. Settlement still obeys `MONEY_PATH_FROZEN`. This bridge does not create payouts.
8. Growth reads the result. It does not write economics. Missing evidence stays `DATA INCOMPLETE`.

## Activation procedure (future)

Unlock Mercado Libre only when one of these exists as an official, reproducible contract:

1. A Developers resource for affiliate conversions and commissions, with auth, ids, amounts, status, and reversals.
2. A published export schema (official docs or an authorized sample file), attested in `MERCADOLIBRE_ATTESTED_REPORT_HEADERS`.
3. A named partner mechanism with the same fields.

Then:

1. Implement `verifySignature` + `parsePayload`, or the attested report parser. Do not invent columns.
2. Prove idempotency, reversal history, and `CONFIRMED` only from provider evidence.
3. Keep `economicIngestAllowed` false until those tests pass.
4. Keep `MONEY_PATH_FROZEN=true`, `REWARDS_PROGRAM_ACTIVE=false`, and `REWARDS_PAYOUT_ENABLED=false` until a later money phase.

## What a future engineer must not do

- Scrape Central, reuse seller OAuth, or call orders/billing/Display Ads as affiliate conversions.
- Turn outbound clicks into sales.
- Turn `PENDING` or `APPROVED` into `CONFIRMED`.
- Treat a failed or empty import as zero sales.
- Guess campaign or hunter attribution.
- Write `creator_rewards` or `payout_intents` from this provider while the money path is frozen.
- Mark this provider completed while `BLOCKED_FOR_AUTOMATION` is still the status.

## Rollback

1. Keep `AFFILIATE_MERCADOLIBRE_ENABLED=false`
2. Do not register adapter as `connected: true`
3. No DB rollback required (no ML-specific economic tables in this phase)

## Code map

| File | Role |
|------|------|
| `lib/economy/providers/mercadolibre/capabilityMatrix.ts` | Official matrix |
| `lib/economy/providers/mercadolibre/MercadoLibreAffiliateAdapter.ts` | Fail-closed adapter |
| `lib/economy/providers/mercadolibre/config.ts` | Env gates |
| `lib/economy/providers/mercadolibre/health.ts` | CEO/ops health |
| `lib/affiliate/conversionBridge/providers/mercadolibreOfficialReport.ts` | Report import refused until schema is attested |
| `tests/economy/mercadolibreAffiliateProvider.test.ts` | Deterministic tests |
| `tests/economy/affiliateConversionBridge.test.ts` | Bridge contract, including frozen ledger |
