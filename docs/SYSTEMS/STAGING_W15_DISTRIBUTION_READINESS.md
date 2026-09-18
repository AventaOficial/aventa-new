# STAGING W1.5 — DISTRIBUTION READINESS

**Date:** 2026-09-17  
**Staging:** `oojshofrpbfwsiypcecr`  
**Distribution status:** **OFF** — do not implement in this wave.

---

## Classification

| Area | Status | Notes |
|------|--------|-------|
| **offers** | **READY** | Canonical table + synthetic seed; app path uses `offers` / `ofertas_ranked_general` |
| **profiles** | **READY** | Additive canonical cols; auth.users match; 1 admin user |
| **auth** | **READY** | Staging auth project wired via local env |
| **RLS** | **READY** | W1 policies + W1.5 grants lockdown on `offer_events` / `write_jobs_queue` / `app_config` |
| **moderation** | **READY** | Tables + pending seed offer present |
| **tracking** | **READY** | `offer_events` service_role path verified in smoke (staging-safe URL) |
| **distribution tables** | **BLOCKED** | Not created / not in W1 foundation scope |
| **cron** | **UNKNOWN** | Code exists; staging cron secrets/schedules not verified this wave |
| **queue** | **READY** | `write_jobs_queue` RLS+grants aligned; service insert smoke PASS |
| **storage** | **UNKNOWN** | Buckets/policies not inventoried in W1.5 |
| **routing** | **READY** | App build PASS; canonical routes use `offers` |

---

## Explicit non-goals (remain OFF)

- Distribution D2 / Telegram / WhatsApp
- Money / rewards / payouts / settlement
- Supply Intelligence / attribution product work

---

## Gate to start Distribution later

1. Distribution tables + RLS designed against staging canonical schema  
2. Cron/env for staging documented  
3. No dependency on legacy `ofertas`  
4. Communities strategy decided if Distribution needs community_id uuid  

**Recommended next action after W1.5:** Distribution design gate (docs only) or W2 communities strategy — **not** auto-implement Distribution.
