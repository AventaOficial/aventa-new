# FOUNDATION DDL SPECIFICATION

**Status:** SPEC ONLY — **no executable SQL generated, no applies**  
**Date:** 2026-09-17  
**Production evidence:** `npx supabase db query --linked` READ-ONLY SELECT against `mkgsrpsuvedwwlzmzmzh`  
**Artifacts (local/gitignored):** `tmp/gate0_prod_catalog_summary.json`, `tmp/gate0_foundation_extract.json`, `tmp/staging-prod-schema-diff.json`  
**Staging forensic diff:** `docs/SYSTEMS/STAGING_SCHEMA_FORENSIC_DIFF.md`  
**Foundation SQL (authored, not applied):** `docs/supabase-migrations/FOUNDATION_BASELINE_20260917.sql`  
**Writes:** production = 0, staging = 0  

Confidence: **HIGH** for objects listed as present on production with columns from `information_schema`.  
**UNKNOWN** where marked (auth internals, storage objects beyond buckets metadata, staging catalog SQL).

---

## 0. Production inventory snapshot

### Schemas observed
`auth`, `cron`, `extensions`, `graphql`, `graphql_public`, `maintenance`, `public`, `realtime`, `storage`, `supabase_migrations`, `vault`

### Public BASE TABLES (47)
`affiliate_commission_revisions`, `affiliate_commissions`, `affiliate_conversions`, `affiliate_economic_events`, `affiliate_ledger_entries`, `affiliate_reconciliation_findings`, `affiliate_reconciliation_runs`, `announcements`, `app_config`, `comment_likes`, `comments`, `commission_allocations`, `commission_pools`, `communities`, `community_offers`, `creator_rewards`, `hunter_shadow_cycles`, `hunter_shadow_outcomes`, `hunter_source_health`, `hunter_supply_runs`, `ingest_cycle_locks`, `ledger_settlements`, `mercadolibre_oauth_tokens`, `moderation_logs`, `moderation_outcomes`, `notifications`, `offer_events`, `offer_favorites`, `offer_health_state`, `offer_price_snapshots`, `offer_quality_checks`, `offer_reports`, `offer_votes`, `offers`, `plaza_discussions`, `plaza_requests`, `product_price_snapshots`, `profiles`, `reward_audit_log`, `reward_clawback_adjustments`, `reward_outbound_clicks`, `reward_payouts`, `user_activity`, `user_bans`, `user_email_preferences`, `user_roles`, `write_jobs_queue`

### Public VIEWS (3)
`daily_system_metrics`, `ofertas_ranked_general`, `public_profiles_view`

### Functions (public)
38 functions (names in catalog dump). Includes rewards RPCs such as payout execution paths — full arg lists in artifact.

### RLS
All **47** base tables: `relrowsecurity = true`. **Zero** tables with RLS disabled.  
`user_roles`: `relforcerowsecurity = true`.

### Distribution
`distribution_*` tables: **ABSENT on production** (migration file exists in repo; not applied to prod).

---

## 1. Classification (repo + prod evidence)

### CORE — CANONICAL
`offers`, `profiles`, `offer_votes`, `offer_events`, `offer_favorites`, `comments`, `comment_likes`, `notifications`, `announcements`, `app_config`, `write_jobs_queue`, `plaza_requests`, `plaza_discussions`, `community_offers`, `offer_reports`, `communities`  
Views: `ofertas_ranked_general`, `public_profiles_view`, `daily_system_metrics` (view)

### MODERATION — CANONICAL
`moderation_logs`, `moderation_outcomes`, `user_bans`

### ATTRIBUTION — CANONICAL
`reward_outbound_clicks` (+ attribution foundation columns present on prod)

### ECONOMY — CANONICAL
`affiliate_ledger_entries`, `affiliate_conversions`, `affiliate_commissions`, `affiliate_commission_revisions`, `affiliate_economic_events`, `affiliate_reconciliation_runs`, `affiliate_reconciliation_findings`, `creator_rewards`, `reward_payouts`, `reward_audit_log`, `reward_clawback_adjustments`, `ledger_settlements`, `commission_pools`, `commission_allocations`

### SUPPLY — CANONICAL
`hunter_supply_runs`, `hunter_source_health`, `hunter_shadow_cycles`, `hunter_shadow_outcomes`, `product_price_snapshots`, `offer_price_snapshots`, `offer_health_state`, `ingest_cycle_locks`, `mercadolibre_oauth_tokens`

### DISTRIBUTION — CANONICAL (repo) / ABSENT (prod)
`distribution_brands`, `distribution_destinations`, `distribution_publications`, `distribution_events` — specified in `20260917_distribution_engine_foundation.sql` only

### ANALYTICS — CANONICAL
`user_activity`; view `daily_system_metrics`

### AUTH — CANONICAL
`profiles`, `user_roles`, `user_email_preferences`, `user_bans` + Supabase `auth` schema (**UNKNOWN** detailed DDL here — managed by Supabase)

### UNKNOWN / review
`offer_quality_checks` — present on prod, **no** `.from('offer_quality_checks')` found in app inventory → treat as **UNKNOWN** until code/docs proof

### LEGACY (staging only — not on prod public list)
`ofertas`, `votos`, `moderation_log`, `payouts`, score MVs, etc. → **LEGACY** (staging)

---

## 2. Foundation vs domain

| Tier | Objects |
|------|---------|
| **FOUNDATION REQUIRED** | `profiles`, `user_roles`, `offers`, `offer_votes`, `offer_events`, `offer_favorites`, `comments`, `comment_likes`, `moderation_logs`, `user_bans`, `notifications`, `user_email_preferences`, `offer_reports`, `write_jobs_queue`, `app_config`, `public_profiles_view`, `ofertas_ranked_general` |
| **FOUNDATION OPTIONAL** | `announcements`, `plaza_*`, `communities`, `community_offers`, `user_activity`, `daily_system_metrics` view |
| **DOMAIN MIGRATION** | Rewards/attribution/economy/supply/distribution dated SQL (create empty tables + ALTERs) |
| **LEGACY** | Staging Spanish dual tables / old RPCs |
| **UNKNOWN** | `offer_quality_checks`; full `auth`/`storage` object DDL |

---

## 3. Object specifications (FOUNDATION REQUIRED)

Source: production catalog. Defaults shown as reported by Postgres (may include sequences/casts). Policies summarized from `pg_policies`.

### 3.1 `profiles`
| Field | Value |
|-------|--------|
| Purpose | User profile + reputation + program flags |
| PK | `id` (uuid) |
| FK | `welcome_offer_id` → `offers.id` (circular with offers — create offers first without this FK, then add, **or** defer FK) |
| RLS | enabled |
| Columns (prod) | `id uuid`, `username text?`, `avatar_url text?`, `created_at timestamptz?`, `display_name text?`, `onboarding_completed bool`, `offers_submitted_count int4`, `offers_approved_count int4`, `offers_rejected_count int4`, `display_name_updated_at timestamptz?`, `reputation_score int4`, `reputation_level int4`, `is_trusted bool`, `slug text?`, `leader_badge text?`, `ml_tracking_tag text?`, `preferred_categories text[]?`, `vote_weight_multiplier int4`, commissions_* / fiscal / amazon_tracking_tag / reward_* / legal consent / rewards_terms_* |
| Confidence | HIGH |
| Evidence | Gate0 columns query + app `profiles` usage |

**Note:** FK to `offers` implies ordered creation: create both tables, add FK after.

### 3.2 `user_roles`
| Field | Value |
|-------|--------|
| Purpose | Staff roles (owner/admin/moderator) |
| PK | `id` uuid |
| Columns | `id uuid`, `user_id uuid`, `role text`, `created_at timestamptz` |
| RLS | enabled + **forced** |
| Policies | 1 (staff-oriented) |
| Confidence | HIGH |

### 3.3 `offers`
| Field | Value |
|-------|--------|
| Purpose | Canonical offer SoT |
| PK | `id` uuid |
| FK | `created_by` → `profiles.id` |
| RLS | enabled |
| Policies (3) | `offers_owner_read_own` SELECT authenticated; `offers_select_public` SELECT anon+authenticated (approved/published, not deleted, not expired); `offers_select_staff` SELECT authenticated via `user_roles` |
| Triggers | 2 (names/actions in catalog dump) |
| Columns | See list in Gate0 extract: includes `title`, `price`, `original_price`, `image_url`, `store`, `created_at`, `status`, `created_by`, `is_featured`, `expires_at`, `rejection_reason`, `offer_url`, `description`, vote counters, ranking fields, `steps`, `conditions`, `coupons`, `msi_months`, `image_urls`, `deleted_at`, `category`, `moderator_comment`, `bank_coupon`, `tags`, `link_mod_ok`, lock/snooze, `bot_meta`, `product_fingerprint`, `original_offer_url`, … |
| Confidence | HIGH |

### 3.4 `offer_votes`
| Field | Value |
|-------|--------|
| PK | `id` uuid |
| FK | `offer_id` → `offers.id` |
| Columns | `id`, `offer_id`, `user_id`, `value int4`, `created_at`, `vote int2?` |
| RLS | enabled; 1 policy; **6 triggers** |
| Confidence | HIGH |

### 3.5 `offer_events`
| Field | Value |
|-------|--------|
| PK | `id` uuid |
| FK | `offer_id` → `offers`; `user_id` → `profiles` |
| Columns | `id`, `offer_id`, `user_id?`, `event_type text`, `created_at` |
| RLS | enabled; **0 policies** in dump (service_role / grants path) |
| Confidence | HIGH |

### 3.6 `offer_favorites`
Present on prod (4 cols, PK id, RLS on). Detail in catalog dump. **Confidence HIGH.**

### 3.7 `comments` / `comment_likes`
`comments`: PK id; FKs offer/user/parent; cols content/status/image_url; RLS + 2 policies.  
`comment_likes`: unique(comment_id,user_id). **Confidence HIGH.**

### 3.8 `moderation_logs`
PK id; FK offer_id; action/status/reason/metadata. RLS + 1 policy. **HIGH.**

### 3.9 `user_bans`, `notifications`, `user_email_preferences`, `offer_reports`
Present on prod with RLS enabled. Full columns in catalog dump. **HIGH.**

### 3.10 `write_jobs_queue`
PK `id int8`; cols job_type/payload/status/attempts/…; RLS on; 0 policies. Matches `write_jobs_queue.sql`. **HIGH.**

### 3.11 `app_config`
Present. **HIGH.**

### 3.12 Views
| View | Depends on | Confidence |
|------|------------|------------|
| `public_profiles_view` | `profiles` (id, display_name, avatar_url, leader_badge, ml_tracking_tag, slug, amazon_tracking_tag) | HIGH |
| `ofertas_ranked_general` | `offers` (ranking expression) | HIGH |
| `daily_system_metrics` | `offers`, `offer_votes`, `offer_events` | HIGH |

### 3.13 DOMAIN objects (spec summary)
Full column lists captured in `tmp/gate0_foundation_extract.json` for rewards/economy/supply tables present on prod.  
**Do not invent.** When authoring future DDL, copy from that evidence or re-run Gate0 READ-ONLY queries.

### 3.14 DISTRIBUTION
**UNKNOWN on production** (absent). Spec source = migration file `20260917_distribution_engine_foundation.sql` only (not live-verified on prod). Confidence for live prod shape: **N/A — not deployed**.

---

## 4. Staging compatibility (vs FOUNDATION REQUIRED)

Staging evidence: REST inventory (`STAGING_SCHEMA_DRIFT.md`).

| Object | Staging | Class |
|--------|---------|-------|
| `offers` | Present (legacy dual with `ofertas`) | MATCH name / **CONFLICT?** cols UNKNOWN without staging catalog |
| `profiles` | Present | MATCH name / cols UNKNOWN |
| `user_roles` | Present | MATCH name |
| `offer_votes` | Missing (`votos` LEGACY) | MISSING |
| `offer_events` | Missing | MISSING |
| `offer_favorites` | UNKNOWN (not in staging OpenAPI list) | MISSING/UNKNOWN |
| `comments` / likes | Missing | MISSING |
| `moderation_logs` | Missing (`moderation_log` LEGACY) | MISSING |
| `notifications`, `write_jobs_queue`, `app_config`, plaza | Missing | MISSING |
| Views ranked / public_profiles | Not in staging OpenAPI | MISSING |
| Legacy `ofertas`/`votos`/`payouts`/… | Present | LEGACY — may coexist |
| `distribution_*` | Missing | MISSING (also missing on prod) |

**Coexistence:** Legacy tables can remain; foundation adds modern names alongside.

---

## 5. Safety statement

| Check | Result |
|-------|--------|
| Production writes | **0** (SELECT-only CLI) |
| Staging writes | **0** (no staging catalog CLI; prior REST was GET) |
| Money/Supply/attribution/distribution code | Untouched |
| Executable foundation SQL | **Not generated** (per brief) |
