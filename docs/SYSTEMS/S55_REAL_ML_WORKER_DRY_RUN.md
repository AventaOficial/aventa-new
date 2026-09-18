# S5.5 — Real ML Worker Dry-Run Validation

**Status:** Validated (READ-ONLY discovery + S4 local dry-run)  
**Date:** 2026-09-18  

## Method

1. Existing `smoke-gate-v2-discovery.mjs` (Playwright worker scrape, `noPost: true`)
2. Local `scripts/s55-ml-worker-real-dry-run.ts` → `runMlWorkerListingDryRun`
3. No POST to `/api/cron/bot-ingest-candidates`
4. No `offers` / moderation / distribution / rewards / economy / attribution writes

## Sample

- Requested: 15 (hard cap 50)
- Fetched: 15
- Seeds: `ofertas_hub`, `lightning`

## Adapter mapping (minimal)

`/up/MLMU…` user-product IDs accepted via existing `extractMercadoLibreUserProductId` (same fingerprint convention). Not a new scorer/queue/table.

## Key findings

- Schema compatible with `ExternalWorkerCandidate`
- PDP: 12/12 blocked (account-verification) → card evidence only; **all images null** → PARTIAL
- DealScore floor ~10–15 without price history; gate treats DealScore as advisory (`void dealScore`)
- WOULD_INSERT = passed machine gates, **not** “high-priority moderation worth”
- Idempotent across two local passes
- Write safety: all mutation counters 0 by construction

## Reports

- `scripts/_smoke-gate-v2-discovery.json`
- `scripts/_s55_reports/s55-report-latest.json`
