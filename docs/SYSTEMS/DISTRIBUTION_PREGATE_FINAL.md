# DISTRIBUTION PRE-GATE FINAL

**Date:** 2026-09-17  
**Staging:** `oojshofrpbfwsiypcecr`  
**Production:** `mkgsrpsuvedwwlzmzmzh` (untouched)  
**Engine flag:** `DISTRIBUTION_ENGINE_ENABLED` default **false** / local unset  
**This document does NOT authorize implementation of Telegram, WhatsApp, drain, or seeds.**

Related forensics:

- `STAGING_CRON_FORENSIC.md`
- `STAGING_STORAGE_FORENSIC.md`
- `STAGING_W15_DISTRIBUTION_READINESS.md`
- `docs/supabase-migrations/20260917_distribution_engine_foundation.sql` (**not applied**)

---

## Checklist

### DATABASE

| Item | Status | Evidence |
|------|--------|----------|
| distribution tables | **BLOCKED** | `distribution_*` = null on staging **and** production |
| offers (canonical) | **READY** | W1 table + W1.5 seed; app uses `offers` |
| profiles | **READY** | W1 additive columns + auth match |
| queue (`write_jobs_queue`) | **READY** | W1 + W1.5 grants; telemetry only — **not** Distribution publications |

### TRACKING

| Item | Status | Evidence |
|------|--------|----------|
| `recordAttributedClick` | **READY** (code) | `lib/attribution/recordAttributedClick.ts` — reuse required; must not fork |
| `click_id` | **READY** (contract) | attribution path existing |
| campaign key | **READY** (allowlist helpers) | `lib/attribution/channels.ts`; Distribution must pass allowlisted `campaign_key` |
| Hop `/r/d/{publicationId}` | **MISSING** | Spec only |
| Attribution schema changes | **BLOCKED** (by policy) | Do not modify attribution for D2 |

### SECURITY

| Item | Status | Evidence |
|------|--------|----------|
| target guards (local staging ref) | **READY** | `.env.local` → staging; W1.5 smoke abort on prod |
| RLS foundation tables | **READY** | W1/W1.5 |
| secrets / `CRON_SECRET` on staging deploy | **UNKNOWN** | Local missing; Vercel staging project not verified |
| public endpoints for Distribution | **MISSING** | No hop/drain yet — fail-closed by absence |
| Flag fail-closed | **READY** | `isDistributionEngineEnabled()` default false |

### SCHEDULING

| Item | Status | Evidence |
|------|--------|----------|
| cron architecture (prod Vercel) | **READY** (understood) | `vercel.json` + `requireCronSecret` |
| staging cron parity | **UNKNOWN** / **MISSING** | No proven staging Vercel crons |
| worker / `distribution-drain` | **BLOCKED** | Route **MISSING** |
| retries / idempotency | **BLOCKED** (runtime) | Designed in foundation SQL + docs; tables not applied |
| Accidental prod publish path | **UNSAFE** if miswired | GH Actions hardcodes `aventaofertas.com` |

### STORAGE

| Item | Status | Evidence |
|------|--------|----------|
| image source (`offers.image_url`) | **READY** for text+URL | Seed uses placehold.co |
| public/private behavior | **BLOCKED** for canonical uploads | Staging lacks `offer-images`; has legacy `ofertas*` |
| fallback no-image | **UNKNOWN** (adapter) | Spec says text-only; not coded |
| SSRF-safe validation | **MISSING** | Required before any remote fetch / sendPhoto |

### APPLICATION

| Item | Status | Evidence |
|------|--------|----------|
| approved eligibility | **READY** (code) | `isOfferDistributable` → `isOfferTrackable` |
| expiration | **READY** (code) | snapshot check rejects expired |
| moderation boundary | **READY** (contract) | Distribution must not approve / change moderation |
| Enqueue on approve hook | **MISSING** / gated | Code exists behind flag; tables missing → cannot persist |
| Provider adapters | **BLOCKED** | Telegram/WhatsApp not to be implemented this gate |

---

## Summary counts

| Status | Count (approx) |
|--------|----------------|
| **READY** | offers, profiles, queue telemetry, RLS, eligibility code, attribution reuse contract, cron auth pattern, flag OFF |
| **BLOCKED** | distribution tables, drain route, provider adapters, staging `offer-images`, applied idempotency schema |
| **UNKNOWN** | staging Vercel cron/env secrets, avatar bucket on prod, image fallback UX until adapter |
| **UNSAFE** (watch) | GH Actions prod URL copy-paste into Distribution; naive URL fetch |

---

## Exact next implementation step (when authorized)

**Step 1 only (still not Telegram):**

1. Apply **`docs/supabase-migrations/20260917_distribution_engine_foundation.sql` on staging only** (`oojshofrpbfwsiypcecr`), with abort if project-ref ≠ staging.  
2. Add staging bucket **`offer-images`** (public read) mirroring prod policies — additive, no prod copy.  
3. Add SSRF/host-allowlist helper for Distribution media URLs.  
4. Keep `DISTRIBUTION_ENGINE_ENABLED=false` until drain + stub adapter + staging destinations exist.

**Do not** in that step: Telegram bot, WhatsApp, channel seed to real chats, cron drain registration, communities migration, money/Supply/attribution schema edits.

---

## Production writes

**0** during this pre-gate forensic.
