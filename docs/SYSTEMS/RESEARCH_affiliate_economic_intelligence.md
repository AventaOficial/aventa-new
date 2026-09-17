# RESEARCH — Affiliate Economic Intelligence (Amazon + Mercado Libre MX)

**Date:** 2026-09-16  
**Scope:** Evidence for Verified Economic Ingestion into Aventa foundation  
**Rule:** Primary sources only for capability claims. No invented APIs. Settlement OFF.

## Executive summary

| Provider | Economic ingest via public official API | Report/dashboard economic data | Stable per-event external ID (confirmed) | Automation | Verdict for FASE 2 code |
|----------|----------------------------------------|--------------------------------|------------------------------------------|------------|-------------------------|
| **Amazon Associates MX** | **NOT_SUPPORTED** (Creators API = catalog only) | **CONFIRMED** (Orders / Earnings / downloads) | **UNKNOWN** until live export schema inspected | **PARTIALLY_AUTOMATABLE** (manual/ops export) | **NO-GO** until ID schema verified with credentials |
| **Mercado Libre Afiliados MX** | **NOT_SUPPORTED_BY_OFFICIAL_API** | UI Central metrics only (aggregated) | **NOT_SUPPORTED** | MANUAL_ONLY (UI) | **NO-GO** |

**Blocker for Verified Economic Ingestion:** neither provider currently has a **CONFIRMED** public API that returns per-conversion/commission events with **stable external IDs + provider-reported amounts**. Amazon has the strongest *reporting* path (official XLSX/CSV/XML downloads), but without credential-verified export columns proving a unique event ID, Aventa must **DETENTE** on production ingest code.

---

## Scientific method (per capability)

Template applied below: Hypothesis → Primary source → Evidence → Interpretation → Limitation → Confidence.

---

## Amazon Associates (MX) — capability matrix

Sources (primary):

- https://afiliados.amazon.com.mx/help/node/topic/GMWAK55DQX8JEK7C — Cómo utilizar los Informes  
- https://afiliados.amazon.com.mx/help/node/topic/GCDWWRFEMW3Q2TE2 — Informe de ganancias  
- https://afiliados.amazon.com.mx/help/node/topic/GPTZ495QPL6TEZLJ — Informe de pedidos  
- https://afiliados.amazon.com.mx/help/node/topic/G5KVDATAT5RKBBBG — Glosario (CSV/XML/Tracking ID)  
- https://afiliados.amazon.com.mx/help/node/topic/GK5TZZ4AWML2QSLA — IDs de seguimiento  
- https://affiliate-program.amazon.com/help/node/topic/GF4ZWWG8EYT5TNR2 — Download formats  
- https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference — Creators API ops  
- https://affiliate-program.amazon.com/help/operating/policies — Operating policies (tags/subtags)

| Capability | Status | Notes |
|------------|--------|-------|
| A. Dashboard access | CONFIRMED | Associates Central MX reports |
| A. Download XLSX / CSV-TXT / XML | CONFIRMED | Official download help |
| A. Creators API catalog | CONFIRMED | SearchItems/GetItems/GetVariations/GetBrowseNodes |
| A. Creators API earnings/commissions | NOT_SUPPORTED | Not in official API reference |
| A. Webhook conversions | NOT_SUPPORTED | Not documented |
| B. Tracking ID / Associate tag | CONFIRMED | Link `?tag=ID`; multiple Tracking IDs |
| B. Network click ID | NOT_SUPPORTED | Not exposed as affiliate click UUID |
| B. Subtag ↔ end-user mapping | NOT_SUPPORTED (policy forbid) | Policies: must not dynamically assign sub-tags to specific end users |
| C. Orders report (ordered items) | CONFIRMED | Near real-time (~3h); not necessarily shipped |
| C. Earnings report (shipped + commission) | CONFIRMED | Lag: earnings as of previous day |
| C. Stable Amazon Order ID in reports | UNKNOWN | UI docs emphasize product/title metrics; export schema not verified live |
| D. Commission amount (provider) | CONFIRMED (in Earnings) | “Ganancias” / Commission Income on shipped |
| D. Estimated vs confirmed | PARTIALLY_CONFIRMED | Ordered ≠ shipped; earnings based on paid+shipped |
| E. Returns / refunds / negatives | CONFIRMED | Negative earnings; return vs refund topics exist |
| F. Latency | CONFIRMED | Orders ~hourly/≤3h; Earnings T-1 |
| F. History window UI | CONFIRMED | Custom range &lt;90 days on page |
| G. Attribution window | CONFIRMED | Cart add within 24h; purchase within 90 days |
| H. Reconciliation feasibility | PARTIALLY_CONFIRMED | Possible vs downloads **if** stable IDs exist |
| I. Automation | PARTIALLY_AUTOMATABLE | Manual download official; no public reports API |
| J. Auth for reports | CONFIRMED | Associates Central session |
| J. Auth for Creators API | CONFIRMED | Credential ID/Secret (catalog only) |
| K. Policy: special links + tag | CONFIRMED | Required |
| K. Policy: no end-user subtag | CONFIRMED | Blocks encoding Aventa `click_id` as Amazon subtag |
| L. Mexico marketplace | CONFIRMED | afiliados.amazon.com.mx / amazon.com.mx / tag `…-21` |

### Attribution implication (FACT vs INFERENCE)

- **FACT:** Amazon attributes via Special Link tag/Tracking ID + 24h/90d cookie/cart rules.  
- **FACT:** Policy forbids associating sub-tags with a specific end user.  
- **INFERENCE:** Deterministic join `Amazon event → Aventa click_id` is likely **impossible** via subtag encoding.  
- **ENGINEERING:** Attribution to Aventa clicks will be `unattributed` or coarse `Tracking ID → campaign_key` at best.

---

## Mercado Libre Afiliados (MX) — capability matrix

Sources (primary): prior Aventa research + program pages

- https://www.mercadolibre.com.mx/l/como-se-calculan-tus-ganancias  
- https://www.mercadolibre.com.mx/l/primerospasos-recorre-la-central-de-afiliados  
- https://www.mercadolibre.com.mx/l/primerospasos-organiza-tus-links  
- Developers API catalog: no affiliate conversion/commission endpoints found  
- Aventa code: `lib/economy/providers/mercadolibre/capabilityMatrix.ts`

| Capability | Status |
|------------|--------|
| Link generation (Central / Barra) | PARTIALLY_SUPPORTED |
| Etiquetas (≤100) | PARTIALLY_SUPPORTED |
| Attribution window 24h last-click | CONFIRMED (policy) |
| Conversion/commission API | **NOT_SUPPORTED_BY_OFFICIAL_API** |
| Webhook / polling / signature | **NOT_SUPPORTED** |
| Per-event external IDs | **NOT_SUPPORTED** |
| Confirmed commission amount API | **NOT_SUPPORTED** |
| Seller OAuth / orders API as affiliate truth | **NOT_SUPPORTED** (wrong product) |
| Automation | MANUAL_ONLY (UI) |

---

## Comparison snapshots

### Clicks / attribution

| | Amazon | Mercado Libre |
|--|--------|---------------|
| Network click UUID | NOT_SUPPORTED | NOT_SUPPORTED |
| Tracking/tag | Tracking ID / Associate tag | etiquetas / matt_word / tag |
| Aventa click_id join | Blocked by subtag policy (likely) | No event API |
| Window | 24h cart + 90d purchase | 24h last-click |

### Conversions

| | Amazon | Mercado Libre |
|--|--------|---------------|
| Source | Orders report / Today’s Orders | Central UI aggregates |
| Granularity | Product/referral (UI); export TBD | Aggregated |
| External ID | UNKNOWN | NOT_SUPPORTED |

### Commissions

| | Amazon | Mercado Libre |
|--|--------|---------------|
| Amount | Earnings report (shipped) | UI only |
| Authority | PROVIDER_REPORTED in Earnings | No API amount |
| Never sale×% | Required | Required |

### Revisions

| | Amazon | Mercado Libre |
|--|--------|---------------|
| Returns/refunds | Negatives in earnings | Policy voids gains |
| Event stream | Report deltas / negatives | No event API |

### Reporting / automation

| | Amazon | Mercado Libre |
|--|--------|---------------|
| Formats | XLSX, tab CSV/TXT, XML | UI |
| API | Catalog only | None affiliate |
| Automation class | PARTIALLY_AUTOMATABLE | MANUAL_ONLY |

---

## Go / No-Go for FASE 2 implementation

### Go criteria (ALL required)

1. CONFIRMED conversion/order-level rows with **stable unique external ID**  
2. CONFIRMED provider-reported commission amount + currency  
3. CONFIRMED access method (API or approved export pipeline) without scraping  
4. Attribution model documented (even if unresolved)  
5. Policy review note for rewards/display (legal, non-blocking for ingest-only)

### Current decision: **NO-GO (DETENTE)**

| Criterion | Amazon | ML |
|-----------|--------|-----|
| Stable external ID | UNKNOWN (needs live export) | FAIL |
| Commission amount | CONFIRMED in Earnings UI/report | FAIL |
| Access | CONFIRMED downloads | FAIL API |
| Policy for click-level | FAIL/risk (no end-user subtag) | N/A |

**Exact next evidence step (not code):** follow `docs/SYSTEMS/AMAZON_EVIDENCE_HARVEST.md` — download Orders+Earnings XML/TXT from Associates MX, fill field uniqueness worksheet, then re-evaluate Go/No-Go.

---

## Architecture implications (no code this phase)

If Amazon export later PASSES ID check:

```
Ops/manual or approved download
  → AmazonReportNormalizer (XML/CSV)
  → external_conversion_id = <verified composite or Amazon ID>
  → recordConversion / recordCommission (amount from Earnings only)
  → attribution_status = unattributed | unresolved (not click-level)
  → revisions from negative/return lines
  → reconciliation vs Aventa
  → settlement OFF
```

If FAIL ID check: remain report-only / CEO “not connected” for economic ingest.

Never: Creators API as commission source. Never: ML seller OAuth as affiliate source. Never: scrape Central.

---

## Unknowns until credentialed dashboard access

1. Exact MX Orders/Earnings export columns  
2. Presence of Amazon Order ID / Item ID uniqueness  
3. Whether XML tags include Tracking ID per line  
4. Whether Creators “reports” access exists for this account (discretionary; not in public API ref)  
5. Timezone of report timestamps  
6. Historical download limits beyond UI 90-day picker
