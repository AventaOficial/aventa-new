# STAGING — DISTRIBUTION GATE 1

**Date:** 2026-09-17  
**Gate:** Distribution Implementation Gate 1 — Staging foundation readiness + canonical storage  
**Status:** COMPLETE (DETENTE — no Distribution implementation)

---

## 1. Target / ref

| Check | Value |
|-------|-------|
| Staging | `oojshofrpbfwsiypcecr` |
| Production (forbidden) | `mkgsrpsuvedwwlzmzmzh` |
| Local URL ref | `oojshofrpbfwsiypcecr` |
| `AVENTA_EXPECTED_SUPABASE_REF` | `oojshofrpbfwsiypcecr` |
| `AVENTA_SUPABASE_TARGET` | `staging` |

---

## 2. Preflight

**PASS.** No SQL executed until staging confirmed. No `--linked` CLI used.

---

## 3. Foundation diff (vs `FOUNDATION_BASELINE_20260917.sql` + app/lib)

**FOUNDATION_BASELINE was NOT executed blindly.**

| Object | Classification |
|--------|----------------|
| `offers` (table uuid) | **EXISTS_CORRECT** |
| `profiles` (additive canonical cols) | **EXISTS_CORRECT** (legacy cols retained) |
| `user_roles` (table) | **EXISTS_CORRECT** |
| `offer_votes`, `offer_events`, `offer_favorites` | **EXISTS_CORRECT** |
| `comments`, `comment_likes` | **EXISTS_CORRECT** |
| `offer_reports`, `moderation_logs`, `moderation_outcomes` | **EXISTS_CORRECT** |
| `user_bans`, `notifications`, `user_email_preferences` | **EXISTS_CORRECT** |
| `write_jobs_queue`, `app_config` | **EXISTS_CORRECT** (+ W1.5 grants lockdown) |
| `announcements`, `plaza_*`, `user_activity` | **EXISTS_CORRECT** |
| Views `public_profiles_view`, `ofertas_ranked_general`, `daily_system_metrics` | **EXISTS_CORRECT** |
| `offers_legacy_compat_v`, `user_roles_from_profiles_v` | **LEGACY_ONLY** (preserved) |
| `ofertas`, `votos`, `moderation_log`, `user_roles_tbl` | **LEGACY_ONLY** |
| `communities` | **EXISTS_WRONG_SHAPE** (bigint vs uuid) — deferred, out of gate |
| `distribution_*` tables | **MISSING** — intentionally not created this gate |
| Indexes `idx_user_roles_*`, `idx_offer_events_offer_event_created_at`, `idx_offer_favorites_user_id`, `idx_offers_active_product_fingerprint`, `profiles_slug_key` | were **MISSING** → patched |
| Policy `comments_select_approved_on_visible_offer` | was **MISSING** → patched |
| Storage `offer-images` | was **MISSING** → created |
| Storage INSERT policy for `offer-images` | **UNKNOWN** (absent on prod inventory — not invented) |

---

## 4. Foundation gaps (resolved vs deferred)

### Resolved (safe additive)

- Missing foundation indexes (IF NOT EXISTS)
- `comments_select_approved_on_visible_offer` (evidenced in foundation baseline)
- Bucket `offer-images` public + SELECT policy

### Deferred / STOP intentionally

| Gap | Reason |
|-----|--------|
| Distribution tables | Gate forbids creating them this wave |
| Communities uuid | Non-reversible conversion; separate wave |
| Storage INSERT on `offer-images` | No prod INSERT policy evidence → **UNKNOWN** |
| Legacy `ofertas` → `offers` data | Non-deterministic; already decided empty+seed |
| Telegram/WhatsApp/drain/cron `/r/d` | Explicitly out of scope |

---

## 5. Patches applied

**File:** `docs/supabase-migrations/STAGING_FOUNDATION_GAP_PATCH_20260917.sql`  
**Applied to:** `oojshofrpbfwsiypcecr` only via MCP `execute_sql` (explicit project_id).

Contents:

1. Indexes: `idx_user_roles_user_id`, `idx_user_roles_role`, `idx_offer_events_offer_event_created_at`, `idx_offer_favorites_user_id`, `idx_offers_active_product_fingerprint`, `profiles_slug_key`
2. Policy: `comments_select_approved_on_visible_offer`
3. Storage: `INSERT … offer-images` + policy `"Allow public read offer-images"`

No DROP/TRUNCATE/DELETE of data. Legacy buckets untouched.

---

## 6. Storage status

| Bucket | Public | Status |
|--------|--------|--------|
| `ofertas` | true | **PRESERVED** |
| `ofertas-images` | true | **PRESERVED** |
| `offer-images` | true | **CREATED / VERIFIED** |

---

## 7. Storage policies

| Policy | Status |
|--------|--------|
| `"Allow public read offer-images"` SELECT TO public | **APPLIED** (matches prod + `storage_offer_images_public.sql`) |
| Authenticated INSERT on `offer-images` | **UNKNOWN** — not created (prod has no such policy in inventory) |
| Legacy `ofertas*` policies | **PRESERVED** |

---

## 8. Distribution readiness (prerequisites only)

| Prerequisite | Status |
|--------------|--------|
| `isOfferTrackable` / `isOfferDistributable` | **READY** (code); seed approved offer probe **true** |
| Canonical `offer_url` / `image_url` / `category` / `expires_at` cols | **READY** |
| Tracking context builder (no second attribution path) | **READY** (code; does not call `recordAttributedClick`) |
| `DISTRIBUTION_ENGINE_ENABLED` | **OFF** (unset / false) |
| Money / rewards / ledger / payouts | **UNTOUCHED** |
| Supply / DQE / attribution schema | **UNTOUCHED** |
| Moderation CAS | **UNTOUCHED** |
| Distribution tables / drain / adapters | **NOT CREATED** (correct for this gate) |

---

## 9. Tests

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | **PASS** |
| projectRefs guard + distribution foundation contracts | **31 PASS** |
| `npm run ci:verify` | **PASS** (1636 tests + build) |
| `scripts/staging-w15-smoke.mjs` | **PASS** (exit 0) |

---

## 10. Production safety

| Item | Result |
|------|--------|
| Production writes | **0** |
| Production buckets | unchanged (`offer-images` still present) |
| CLI `--linked` | not used |

---

## 11. Remaining blockers (next gates)

1. Apply `20260917_distribution_engine_foundation.sql` **staging-only** (tables) — Gate 2  
2. Decide authenticated upload path for `offer-images` (service_role vs evidenced INSERT policy)  
3. SSRF/host-allowlist helper for Distribution media  
4. Staging Vercel cron / `CRON_SECRET` verification  
5. Communities uuid strategy (independent)  
6. Still **no** Telegram / WhatsApp / drain / `/r/d` until later gates

---

## 12. Exact next step

**Distribution Gate 2 (when authorized):** apply distribution foundation SQL on `oojshofrpbfwsiypcecr` only, keep `DISTRIBUTION_ENGINE_ENABLED=false`, no adapters, no cron drain, no production.

---

## Definition of Done checklist

- [x] STAGING confirmado  
- [x] Foundation diff completo  
- [x] No foundation completa a ciegas  
- [x] Gaps reales identificados  
- [x] Gap patch aplicado (seguro)  
- [x] `offer-images` verificado/creado  
- [x] Legacy buckets preservados  
- [x] Distribution prerequisites auditados  
- [x] Money / Supply / Attribution untouched  
- [x] Production untouched  
- [x] tsc / ci:verify PASS  
- [x] Documentación actualizada  

**NO CONTINÚES A DISTRIBUTION IMPLEMENTATION.**
