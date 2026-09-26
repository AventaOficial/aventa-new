# AVENTA — DAY 12.1 Observability Contract

**Authority:** DQE, S6.1, provenance mint-trust, and artificial-list detection remain the **only** decision gates.

Day 12.1 fields are **diagnostics**. They explain decisions; they never upgrade trust, never mint, and never write money.

## Schema

Persisted under `discovery_cycle_snapshots.payload`:

| Field | Meaning |
| --- | --- |
| `observability_schema_version` | Always `1` for this contract |
| `gate_samples` | Compact per-candidate gate mirror (≤50) |
| `candidate_observations` | Durable diagnostics (≤50) |

Also available on the in-process `DiscoveryCycleReport` as `gateSamples` / `candidateObservations`.

## `candidate_observations[]` (schema_version: 1)

| Field | When present | Null means | Source | Kind |
| --- | --- | --- | --- | --- |
| `url` / `source_id` / `product_id` | Always for observed candidates | `product_id` null if unknown | sticky tip / URL parse | identity |
| `history_ready` | Always | — | `meta.signals.historyReady` | gate mirror |
| `acquisition_path` | Always | — | enrich path | diagnostic |
| `original_recovered_via` | Sticky / evidence paths | null if N/A (non-PM) | observe / evidence | diagnostic |
| `current_price` / `original_price` | When meta extracted | null if absent | parsed meta | evidence mirror |
| `current_price_provenance` / `original_price_provenance` | When signals set | null if unset | `meta.signals` | evidence mirror |
| `quality_decision` / `would_insert` / `dqe_decision` | Always for evaluated | `dqe_decision` null if not extracted | DQE / S6.1 | **gate mirror** |
| `primary_terminal` / `reason_codes` | Always | — | verified-yield terminal | **gate mirror** |
| `provenance` | When diagnose ran | null if extraction failed early | `diagnoseProvenanceCompleteness` | diagnostic |
| `artificial` | Always when observation built | `reason` null if not detected | `mlPriceEngine` clauses | diagnostic |

### `original_recovered_via` vocabulary

Reuses live observe vocabulary (never invent):

- `prices_endpoint` — original came from `/items/{id}/prices`
- `products_items` — recovered via `/products/{id}/items` after sale-only prices
- `listing_card` — card/listing evidence fallback
- `explicit_source` — explicit source tag without sticky observe
- `unavailable` — no original recovered
- `unknown` — value present but not in vocabulary

### `acquisition_path`

- `sticky_observe` — live `observeStickySkuViaServer`
- `discovery_evidence_fallback` — census/evidence fill when live blocked
- `precomputed_only` — ingest already had meta
- `unknown` — default

### Provenance diagnostics (`provenance.*`)

| Field | Role |
| --- | --- |
| `complete` | Whether mint-trust evidence is present (observe-only) |
| `gap` | Structured gap kind (`missing_current_original`, `identity_mismatch`, …) |
| `detail` | Verifiable detail string |
| `diagnostic_codes` | Tokens appended beside S6.1 codes (`PROVENANCE_MISSING_CURRENT_EVIDENCE`, …) |

These codes do **not** change `assignPrimaryTerminalReason` priority beyond existing Day 12 behavior.

### Artificial diagnostics (`artificial.*`)

| Field | Role |
| --- | --- |
| `detected` | Mirror of `suspectedArtificialListPrice` (unchanged boolean) |
| `clauses` | Exact clauses that fired: `list_vs_regular`, `list_vs_habitual`, `extreme_list`, `extreme_list_no_history` |
| `reason` | Joined clauses (`a+b`) or null |
| `list_price` / `current_price` / `habitual30d` | Values used by the clauses |
| `history_ready` | Context for extreme-list labeling |

Detection thresholds are **unchanged**. Clauses are labels only.

## What Day 12.1 does NOT do

- No DQE / S6.1 / Offer Standard / mint / money changes
- No second writer
- No parallel discovery logic
- No relaxation of provenance or artificial gates
- No production deploy mandate

## Safety invariants

- `MONEY_PATH_FROZEN=true` (runtime env)
- dry-run → `pending_created=0`, `mintAttempted=false`
- lease / cycle_id uniqueness / retry idempotency unchanged
