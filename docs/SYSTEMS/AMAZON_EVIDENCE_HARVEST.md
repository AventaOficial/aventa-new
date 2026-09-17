# AMAZON EVIDENCE HARVEST — Associates MX

**Status:** BLOCKED on live export  
**Date:** 2026-09-16  
**Repo scan result:** **NO** real Amazon Orders/Earnings export files found (no `.csv` / `.xlsx` / `.xml` report artifacts under repo).

Related research: [`RESEARCH_affiliate_economic_intelligence.md`](./RESEARCH_affiliate_economic_intelligence.md)

---

## Legend

| Label | Meaning |
|-------|---------|
| **CONFIRMED** | Primary Amazon Associates MX / official help |
| **UNKNOWN** | Not verified without live export or deeper primary docs |
| **HYPOTHESIS** | Engineering guess — not fact |
| **BLOCKED** | Prevents Verified Economic Ingestion |

---

## 1. What already exists in Aventa (repo audit)

| Layer | Path | Connected? | Economic truth? |
|-------|------|------------|-----------------|
| Attribution clicks | `lib/attribution/*`, `reward_outbound_clicks` | LIVE | Click truth only |
| Conversion/commission tables | migrations + `lib/economy/record*` | Schema LIVE; ingest empty | Foundation |
| Adapter abstraction | `lib/economy/adapter/*` | LIVE (fail-closed registry) | Contract only |
| ML provider | `lib/economy/providers/mercadolibre/*` | **connected=false** | NOT_SUPPORTED API |
| Amazon provider economic | — | **MISSING** | — |
| Amazon PAAPI / ASIN bots | `lib/bots/ingest/amazonPaapi.ts`, hunter sources | Catalog/supply | **NOT** commission truth |
| Associate tag linking | `AMAZON_ASSOCIATE_TAG` / `applyPlatformAffiliateTags` | LIVE | Tagging only |
| Settlement / rewards / payouts | gated OFF | OFF | Must stay OFF |

**Confusion risk:** Creators/PAAPI catalog ≠ Associates Earnings. Never treat PAAPI as economic authority.

---

## 2. What to download from Associates Central MX

Log into: **https://afiliados.amazon.com.mx**

Download **both** for the **same** date window:

| Report | Why |
|--------|-----|
| **Orders** (Informe de pedidos / Today’s Orders if available) | Ordered items; near-term activity; referral/link context |
| **Earnings** (Informe de ganancias / Commissions) | Shipped-based commission amounts (provider-reported) |

### Recommended period

1. **Last 7 days** — small sample for column forensics  
2. **Last 30 days** (or max &lt;90 days UI custom range) — uniqueness statistics  
3. If possible: one window that includes a **return/refund** month so negatives appear  

### Formats (download all available)

Official help documents: **XLSX**, **CSV/TXT** (tab-separated in practice), **XML**.

Store under a **private** ops folder **outside** git if files contain PII/account data, e.g.:

`ops-private/amazon-associates-mx/YYYY-MM-DD/{orders,earnings}.{xlsx,txt,xml}`

Do **not** commit real exports to the public repo unless fully redacted.

---

## 3. Questions the export must answer

### Identity / idempotency

1. Is there an **Order ID** (or equivalent) unique per economic event?  
2. Is uniqueness **(Order ID + ASIN + quantity line)** or only ASIN aggregates?  
3. Does Tracking ID appear **per line**?  
4. Can the same logical sale appear in Orders and Earnings with a join key?  
5. Do re-downloads of the same period produce identical rows (stable IDs)?

### Economic authority

6. Which column is **commission amount** (not revenue, not price)?  
7. Currency explicit or implied MXN?  
8. Ordered vs shipped vs returned columns — which authorizes “confirmed” commission?  
9. How do **negatives** appear (returns/refunds)? Separate rows? Negative earnings?

### Time

10. Report date vs order date vs ship date — which fields exist?  
11. Timezone labeled?

### Attribution

12. Any field that could map to Aventa `click_id`? (**Expect: no**)  
13. Only Tracking ID / Associate tag? → **AGGREGATED_ONLY** channel attribution  

### Duplicates / reconciliation

14. Same ASIN multiple lines same day — how distinguished?  
15. Can we detect missing days / overlapping imports?

---

## 4. Field forensics worksheet (fill after download)

For **each** header in Orders and Earnings:

| FIELD | EXISTENCE | TYPE | UNIQUENESS | STABILITY | ECONOMIC AUTHORITY | ATTRIBUTION VALUE | CONFIDENCE |
|-------|-----------|------|------------|-----------|--------------------|-------------------|------------|
| (fill) | Y/N | string/number/date | unique / not unique / unknown | stable / changes | conversion / commission / none | click / tracking / none | CONFIRMED/UNKNOWN |

**Do not** mark UNIQUENESS=unique without counting:

```
distinct(field) == row_count  → candidate unique
duplicates(field) > 0         → not unique alone
```

For composite candidates (e.g. date+ASIN+tracking+qty): document collision rate.

---

## 5. Identity chain analysis (current knowledge)

```
Aventa click_id          → LIVE (reward_outbound_clicks)
Amazon Tracking ID/tag   → CONFIRMED (link param); AGGREGATED channel
Amazon Order/Conversion ID → UNKNOWN (needs export)
Amazon Commission line ID  → UNKNOWN (needs export)
ASIN / product             → CONFIRMED as catalog concept; report presence UNKNOWN until export
Aventa user                → NEVER encode in Amazon subtag (policy forbids end-user subtags)
```

| Relationship | Classification |
|--------------|----------------|
| click_id → Tracking ID | **UNSUPPORTED** as 1:1 (policy + granularity) |
| Tracking ID → conversion | **AGGREGATED_ONLY** / **UNKNOWN** detail |
| conversion → commission | **UNKNOWN** join until export |
| commission → Aventa user | **UNSUPPORTED** without deterministic attribution |

**Attribution outcome for design:** `unattributed` or Tracking-ID-level only — **never** auto-settle to creators from Amazon rows alone.

---

## 6. Economic authority (design contract)

| Fact | Authority |
|------|-----------|
| Conversion occurred | Amazon Orders/Earnings presence — **after** schema verified |
| Commission amount | Amazon Earnings **provider-reported** amount — never `sale×%` |
| Reversal | Amazon negatives / return-refund lines — **after** schema verified |
| Currency | Report field or program default — **UNKNOWN** until export |
| Status ordered vs shipped | Distinguishing Orders vs Earnings reports — CONFIRMED conceptually |

---

## 7. Adapter design — BLOCKED (no code until export)

Proposed (when unblocked):

```
lib/economy/providers/amazon/
  AmazonAssociatesReportAdapter.ts   # implements AffiliateNetworkAdapter
  parseReport.ts                     # format-specific
  normalize.ts
  identity.ts
  config.ts                          # AFFILIATE_AMAZON_ENABLED=false default
```

Pipeline:

```
RAW REPORT
→ VALIDATE FORMAT
→ PARSE
→ NORMALIZE
→ VALIDATE EXTERNAL IDENTITY   # FAIL if no stable ID
→ DEDUPE (UNIQUE source+network+external_*)
→ RECONCILE (findings only)
→ PERSIST conversions/commissions/revisions
→ SETTLEMENT DISABLED
```

**NO-GO until:** stable external ID **CONFIRMED** + commission amount column **CONFIRMED**.

Synthetic fixtures (if added later for architecture only) must be named:

`synthetic-amazon-report.fixture.*`

Never named like real Associates exports.

---

## 8. Amazon vs Mercado Libre (comparative)

| Capability | Amazon Associates MX | Mercado Libre Afiliados MX |
|------------|----------------------|----------------------------|
| Economic reporting UI | CONFIRMED | CONFIRMED (aggregated) |
| Official download export | CONFIRMED (XLSX/CSV/XML) | UNKNOWN / not confirmed API |
| Conversion IDs | UNKNOWN | NOT_SUPPORTED |
| Commission IDs | UNKNOWN | NOT_SUPPORTED |
| Commission amounts | CONFIRMED in Earnings concept | NOT_SUPPORTED via API |
| Attribution | Tracking ID; 24h/90d | 24h last-click; etiquetas |
| Public economic API | NOT_SUPPORTED (Creators=catalog) | NOT_SUPPORTED |
| Webhook | NOT_SUPPORTED | NOT_SUPPORTED |
| Automation | PARTIALLY (manual download) | MANUAL_ONLY |
| Reversals | Negatives in earnings (docs) | Policy-level; no event API |
| Stable identity | BLOCKED until export | NOT_SUPPORTED |
| Policy: end-user tracking | Subtag→user forbidden | N/A |
| Aventa provider code | Not built (blocked) | Fail-closed stub LIVE |

---

## 9. CEO Truth semantics (for later wiring)

| Flag | Meaning |
|------|---------|
| `NOT_CONNECTED` | No verified ingest path |
| `CONNECTED_ZERO` | Ingest path live; zero rows |
| `CONNECTED_WITH_DATA` | Rows persisted |
| `economic_data_available` | Provider amounts exist |
| `economic_data_attributable` | Deterministic click/user join |
| `economic_data_settleable` | Explicitly false while settlement OFF |

Today: **NOT_CONNECTED** for Amazon economic ingest. Tag linking ≠ economic connection.

---

## 10. Exact ops checklist (single next action)

1. Sign in to Associates Central MX.  
2. Download Orders + Earnings for last 7 days in **XML and TXT**.  
3. Place files in private ops storage (not git).  
4. Fill §4 field worksheet + uniqueness counts.  
5. Re-open Go/No-Go for `AmazonAssociatesReportAdapter`.

Until then: **DETENTE** on Amazon economic ingest implementation.
