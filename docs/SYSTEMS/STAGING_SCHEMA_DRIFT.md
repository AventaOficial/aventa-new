# STAGING SCHEMA DRIFT REPORT

**Date:** 2026-09-17 (resumed inventory)  
**Production ref:** `mkgsrpsuvedwwlzmzmzh` (**not queried** this run — no prod credentials in local)  
**Staging ref:** `oojshofrpbfwsiypcecr` (**verified** via `.env.local`)  
**Method:** READ-ONLY REST OpenAPI + per-relation `GET /rest/v1/{table}?limit=1` with status codes  
**Artifact:** `tmp/staging-readonly-inventory.json` (gitignored; no secrets)  
**Script:** `scripts/inventory-staging-readonly.mjs`

**False-positive note:** supabase-js `.select(head:true)` on this project returned success for missing tables; inventory uses raw REST status (`PGRST205` = missing).

---

## 0. Environment verification (FASE 1)

| Check | Result |
|-------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` host ref | `oojshofrpbfwsiypcecr` |
| `AVENTA_EXPECTED_SUPABASE_REF` | `oojshofrpbfwsiypcecr` |
| `AVENTA_SUPABASE_TARGET` | `staging` |
| Production constant | `mkgsrpsuvedwwlzmzmzh` |
| Ambiguity | **None** for local target |

## Guard tests (FASE 2)

`tests/supabase/projectRefs.guard.test.ts` — **7 passed**  
Staging→prod accidental rejected by `assertStagingSupabaseUrl`.

---

## 1. Staging inventory summary

| Metric | Value |
|--------|--------|
| OpenAPI tables/views | **44** |
| OpenAPI RPCs | **71** |
| Auth users listed | **1** |
| Storage buckets | `ofertas-images` (public), `ofertas` (public) |
| Catalog SQL (RLS/indexes/FKs/triggers) | **UNKNOWN** (no `DATABASE_URL`) |
| CLI `supabase/.temp` linked project | **production** — **not used** |

### Relations present on staging (OpenAPI + REST OK)

`admin_kpi_daily`, `affiliate_clicks`, `affiliate_configs`, `affiliate_events`, `affiliate_programs`, `affiliate_verifications`, `communities`, `community_members`, `event_types`, `fx_rates`, `merchants`, `moderation_log`, `my_rank`, `ofertas`, `ofertas_author_compat`, `ofertas_scores`, `ofertas_scores_mv`, `offer_fingerprints`, `offer_interactions`, `offer_scores`, `offer_vote_counts`, `offer_vote_stats`, `offers`, `offers_normalized`, `payouts`, `profiles`, `promotion_requests`, `push_subscriptions`, `site_settings` (+ views), `stores`, `top_helpers_*`, `ui_events`, `ui_events_rejects`, `user_roles`, `user_roles_effective`, `user_roles_tbl`, `v_affiliate_revenue_by_user`, `v_payouts_pending`, `votes_norm`, `votos`

### Sample row counts (staging)

| Relation | Count |
|----------|------:|
| `offers` | 5 |
| `ofertas` | 5 |
| `profiles` | 1 |
| `affiliate_events` | 5 |
| `votos` | 0 |
| `moderation_log` | 0 |
| `communities` | 0 |
| Most others probed present | 0 |

Legacy dual naming: both `offers` and `ofertas` exist with data (early 2025 rows observed via REST body title fields — no secrets).

---

## 2. Aventa current-architecture checklist vs staging

Baseline = tables the **current** Next.js Aventa codebase / `docs/supabase-migrations` expect.  
Staging live via REST.

| Object | Staging | Class vs current Aventa |
|--------|---------|-------------------------|
| `offers` | Present (5) | **MATCH** (name) — column parity **UNKNOWN** |
| `ofertas` | Present (5) | **EXTRA** (legacy parallel) |
| `profiles` | Present (1) | **MATCH** (name) — columns **UNKNOWN** |
| `offer_votes` | Missing | **MISSING** |
| `votos` | Present (0) | **EXTRA** / legacy substitute |
| `offer_events` | Missing | **MISSING** |
| `communities` / `community_members` | Present | **MATCH** (names) |
| `moderation_logs` | Missing | **MISSING** |
| `moderation_log` | Present | **EXTRA** / legacy name |
| `moderation_outcomes` | Missing | **MISSING** |
| `affiliate_configs` / `programs` / `events` / `clicks` | Present | **MATCH** (names) — may be legacy defs |
| `affiliate_ledger_entries` | Missing | **MISSING** |
| `affiliate_conversions` / `commissions` / `economic_events` | Missing | **MISSING** |
| `reward_outbound_clicks` | Missing | **MISSING** |
| `creator_rewards` / `reward_payouts` / `reward_audit_log` | Missing | **MISSING** |
| `payouts` | Present | **EXTRA** / legacy money table |
| `ledger_settlements` | Missing | **MISSING** |
| `stores` / `merchants` / `promotion_requests` | Present | **MATCH** (names) |
| `offer_fingerprints` / `offer_interactions` | Present | **MATCH** (names) |
| `push_subscriptions` / `site_settings` | Present | **MATCH** (names) |
| `user_roles` / `user_roles_tbl` / `admin_kpi_daily` | Present | **MATCH** (names) |
| `plaza_requests` / `plaza_discussions` | Missing | **MISSING** |
| `comments` / `comment_likes` / `user_bans` | Missing | **MISSING** |
| `notifications` / `write_jobs_queue` / `app_config` / `announcements` | Missing | **MISSING** |
| `hunter_supply_runs` / shadow / price snapshots | Missing | **MISSING** |
| `distribution_*` (4 tables) | Missing | **MISSING** |

### Classification counts (checklist-oriented)

| Class | Meaning here |
|-------|----------------|
| MATCH | Relation name exists on staging |
| MISSING | Required by current Aventa / migrations; not on staging REST |
| EXTRA | On staging; not part of current primary naming |
| CONFLICT | Not proven at column/type level without catalog SQL |
| UNKNOWN | RLS, indexes, FKs, triggers, column diffs, live prod compare |

**Column/type/constraint CONFLICT:** **UNKNOWN** (no `information_schema` access).

---

## 3. Production vs staging (FASE 4)

| Approach | Result |
|----------|--------|
| Live production metadata | **NOT RUN** — local env has staging only; CLI link points at prod but **must not** be used |
| Compare staging vs migration catalog / current app expectations | Done above |
| Secret compare | Never |

**Production/staging differences (high confidence):** staging is a **legacy-era** surface (Spanish table names, old RPCs, `payouts`, scores MVs) lacking most 2026 foundation tables (rewards v1, attribution clicks foundation, plaza, hunter supply, distribution, moderation_outcomes, offer_events, …).

---

## 4. RLS / security (FASE 3 limits)

| Item | Status |
|------|--------|
| RLS enabled per table | **UNKNOWN** |
| Policies | **UNKNOWN** |
| Tables without RLS | **UNKNOWN** |
| Storage buckets public | `ofertas`, `ofertas-images` → **public: true** (observed) |
| Grants | **UNKNOWN** |

---

## 5. Legacy findings

1. Dual `offers` + `ofertas` (5 rows each) — preserve; do not DROP.  
2. `votos` instead of `offer_votes`.  
3. `moderation_log` instead of `moderation_logs`.  
4. `payouts` + many analytics RPCs from early product — treat as legacy.  
5. Auth: 1 user — low volume, still PII-capable.  
6. Backups / PITR: **UNKNOWN** (dashboard).  
7. Historical plaza-audit “no plaza on this project” — **confirmed** (`plaza_*` MISSING).

---

## 6. Distribution D2 readiness (FASE 6)

| Table | Staging |
|-------|---------|
| `distribution_brands` | MISSING |
| `distribution_destinations` | MISSING |
| `distribution_publications` | MISSING |
| `distribution_events` | MISSING |

**Verdict: `REQUIRES_MIGRATION`** (and broader schema catch-up).  
**Not READY.** Still **BLOCKED** for Telegram/drain/hop implementation until:

1. Explicit decision to apply `20260917_distribution_engine_foundation.sql` **only** to staging  
2. Plus likely prerequisite modern tables if D2/app paths assume them  

**Do not apply in this task.**

---

## 7. Migration blockers (ordered)

1. Staging schema ≠ current production architecture (many MISSING).  
2. Legacy EXTRA tables/RPCs — migration plan must not blindly DROP.  
3. No catalog-level RLS/column audit yet (`DATABASE_URL` / SQL editor needed).  
4. Live prod schema snapshot not available from this workstation.  
5. Distribution tables absent → D2 remote work blocked.

---

## 8. Exact next action

1. Founder: optional SQL Editor on staging — run `docs/supabase-migrations/inspect_schema_helpers.sql` (read-only) for RLS/columns; paste results or grant read-only DB URL to tooling.  
2. Plan **staging-only** migration sequence (modern foundations → distribution) — separate explicit approval.  
3. Keep production untouched; keep CLI link awareness (currently prod).  
4. Distribution D2 remains blocked until staging migration plan approved.
