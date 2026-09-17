# SYSTEM — Mercado Libre Afiliados (MX)

## Verdict (2026-09-16)

**Affiliate economic ingest: `NOT_SUPPORTED_BY_OFFICIAL_API`.**

Mercado Libre’s **Programa de Afiliados y Creadores** exposes link generation + Central UI metrics.  
There is **no documented Developers API** for affiliate conversion IDs, commission amounts, webhooks, or polling of per-sale economic events.

Aventa therefore keeps ML affiliate economic ingest **fail-closed**.

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
| CSV/export automation | UNKNOWN (no scrape; no session cookies) |

Full machine-readable matrix: `lib/economy/providers/mercadolibre/capabilityMatrix.ts`

### Official sources used

- https://www.mercadolibre.com.mx/l/como-se-calculan-tus-ganancias
- https://www.mercadolibre.com.mx/l/primerospasos-recorre-la-central-de-afiliados
- https://www.mercadolibre.com.mx/l/primerospasos-organiza-tus-links
- https://www.mercadolibre.com.mx/l/primerospasos-checklist
- https://www.mercadolibre.com.mx/landing/afiliados
- Developers catalog search: no affiliate conversions/commissions endpoints found

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

`providers.mercadolibre`: enabled / configured / **connected=false** / economicAPI=NOT_SUPPORTED / settlement=OFF.  
Revenue: **not connected**.

## Activation procedure (future)

1. Obtain **official** Developers documentation for affiliate conversion+commission events with stable external IDs + amounts.
2. Implement real `verifySignature` + `parsePayload` against that contract.
3. Flip `economicIngestAllowed` only after tests prove amount authority from ML.
4. Keep settlement OFF until a later money phase.

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
| `tests/economy/mercadolibreAffiliateProvider.test.ts` | Deterministic tests |
