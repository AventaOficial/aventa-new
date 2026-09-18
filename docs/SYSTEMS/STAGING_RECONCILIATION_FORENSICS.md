# STAGING RECONCILIATION FORENSICS

**Gate:** 0.5  
**Date:** 2026-09-17  
**Method:** READ-ONLY MCP `execute_sql` / catalog SELECT with explicit `project_id`  
**Artifact:** `tmp/staging-reconciliation.json`  
**Companion:** `STAGING_SCHEMA_FORENSIC_DIFF.md`, `FOUNDATION_BASELINE_REVIEW.md`  

**Remote writes:** production = **0**, staging = **0**  
**No migrations applied. No FOUNDATION SQL executed.**

---

## 1. Environment safety

| Check | Value |
|-------|--------|
| Production | `mkgsrpsuvedwwlzmzmzh` |
| Staging | `oojshofrpbfwsiypcecr` |
| `.env.local` URL ref | **`mkgsrpsuvedwwlzmzmzh` (PROD)** |
| `AVENTA_EXPECTED_SUPABASE_REF` | `oojshofrpbfwsiypcecr` |
| `AVENTA_SUPABASE_TARGET` | `staging` |
| Mismatch | **YES** — URL ≠ guards |
| Auto-fix | **NOT performed** (per brief) |

All forensics used MCP `project_id` (not `.env.local`). Env-bound app traffic today would hit **production**.

---

## 2. staging.offers

| Attribute | Evidence |
|-----------|----------|
| Kind | **VIEW** (`relkind=v`), not materialized |
| RLS on view | false (RLS applies on underlying `ofertas`) |
| Definition | `SELECT id, user_id, titulo AS title, descripcion AS description, categoria AS category, imagen_url AS image_url, original_link, created_at, status, community_id, duplicate_flag, eligible, eligible_for_unlock_at, reviewed_by, reviewed_at, rejection_reason FROM ofertas;` |
| Source table | **`public.ofertas`** (BASE TABLE, bigint PK) |
| Exposed columns | 16 (compat subset) |
| Types | `id`/`community_id` = **bigint** via source; not uuid |
| Dependent public views | also: `ofertas_author_compat`, `ofertas_scores`, `ofertas_scores_mv`, `offer_vote_counts`, `offers_normalized` |
| Backup deps | `aventa_backup_2025_09_19._backup_ofertas` |
| Physical data | **`ofertas`** — **5 rows** (demo/seed titles; not production volume) |
| App code `.from('ofertas')` | **none found** |
| App code `.from('offers')` | **heavy** (expects prod uuid table + columns like `offer_url`, `display_name` paths, etc.) |

### Why is it a VIEW?

Legacy English-compat shim over Spanish `ofertas` during early product dual-naming. It is **not** the 2026 canonical table.

### Data disposition

| Option | Assessment |
|--------|------------|
| Discardable? | Staging demo-scale (5 rows); **low business value**, but do not DROP without founder call |
| Migrable to uuid `offers`? | Structurally **hard** (bigint→uuid, missing columns, different semantics) → **MIGRATE LATER / ARCHIVE**, not blocking foundation if names freed |
| Must keep? | Keep **`ofertas` table**; rename **view** `offers` so CREATE TABLE can proceed |

**Conclusion:** Rename view `offers` → e.g. `offers_legacy_compat_v` **before** foundation. Keep `ofertas` untouched (KEEP/ARCHIVE).

---

## 3. staging.user_roles

| Attribute | Evidence |
|-----------|----------|
| Kind | **VIEW** |
| Definition | `SELECT id AS user_id, COALESCE(role, 'user') AS role FROM profiles p;` |
| Source | **`profiles.role`** (embedded staff/user role on profile) |
| Parallel table | **`user_roles_tbl`** (0 rows) — closer to prod staff-roles idea but different CHECK roles (`moderator/analyst/finance/growth_manager`, no `owner`) |
| Effective view | `user_roles_effective` = `user_roles` UNION `user_roles_tbl` |
| Row count via view | 1 (mirrors 1 profile) |
| App `.from('user_roles')` | **yes** (admin dashboards) — expects prod table shape (`id`, `user_id`, `role`, `created_at`) + RLS forced |

### Why VIEW?

Legacy model stored role on `profiles`; English name `user_roles` was a projection. Prod moved staff roles to dedicated table.

**Conclusion:** Rename view `user_roles` → e.g. `user_roles_from_profiles_v`; update or later replace `user_roles_effective`. Keep `user_roles_tbl` (BRIDGE/ARCHIVE). Create canonical `user_roles` TABLE via foundation after rename.

---

## 4. profiles — production vs staging

### Shared (name + compatible-ish type)

| Column | Prod | Staging | Notes |
|--------|------|---------|--------|
| `id` | uuid NOT NULL PK → auth.users | uuid NOT NULL PK → auth.users | **1:1** |
| `avatar_url` | text null | text null | **1:1** |
| `created_at` | timestamptz default now() | timestamptz default now() | **1:1** |

### Semantic near-matches (NOT 1:1 rename-safe without mapping)

| Staging | Prod analogue | Conflict |
|---------|---------------|----------|
| `full_name` | `display_name` | different name |
| `trusted` | `is_trusted` | name + nullability (prod NOT NULL default false) |
| `approved_offers_count` | `offers_approved_count` | name |
| `level` | `reputation_level` | semantic overlap UNKNOWN |
| `role` | *(moved to `user_roles` table)* | structural |

### Staging-only (legacy)

`phone`, `telefono`, `direccion`, `address`, `join_number`, `user_number`, `country`, `currency`, `role`, `rank_tier`, `rank_points`, `karma`, `muted_until`, `trusted`, `level`, `is_unlocked`, `unlocked_at`, `unlock_basis_count`, `approved_offers_count`, `total_votes_cast`, `full_name`

### Production-only (missing on staging)

`username`, `display_name`, `onboarding_completed`, `offers_submitted_count`, `offers_approved_count`, `offers_rejected_count`, `display_name_updated_at`, `reputation_score`, `reputation_level`, `is_trusted`, `slug`, `leader_badge`, `ml_tracking_tag`, `preferred_categories`, `vote_weight_multiplier`, commissions/fiscal/tracking/rewards/legal/welcome_offer fields, …

### Constraints / RLS

| | Prod | Staging |
|--|------|---------|
| UNIQUE | `username` | `user_number` |
| CHECK | leader_badge, vote_weight | `role IN (user,moderator,admin)` |
| FK | welcome_offer_id → offers; owner_auto_approve_by → auth.users | id → auth.users only |
| RLS policies | 4 modern (`profiles_*`) | many duplicate read policies + admin via `profiles.role` |

### Data

Staging **1** profile row. Preserve identity (`id`) for auth continuity. Column reshape is a **dedicated reconcile wave** — not silent `CREATE IF NOT EXISTS` (foundation already aborts).

**Classification:** profiles table = **KEEP** (row) + **BRIDGE/MIGRATE LATER** (schema to canonical). Cannot apply foundation profiles CREATE while legacy table occupies the name with wrong shape.

---

## 5. communities

| | Production | Staging |
|--|------------|---------|
| PK `id` | **uuid** | **bigint** |
| Columns | id, name, slug, description, icon, created_at | + owner_id, revenue_*, policies, status, … |
| Rows | 1 (prod) | **0** (staging) |
| Dependents (staging) | — | `community_members.community_id` FK; `ofertas.community_id` FK; functions `create_community`, `analytics_by_community`, `can_insert_offer_into_community`, … |

**bigint→uuid conversion:** structurally possible only with coordinated rewrite of FKs, functions, and any stored ids — **not recommended now**; staging has **0** community rows so a future **parallel** uuid table or rename+recreate is easier than in-place cast.

**Foundation:** correctly **excluded** communities from baseline.

**Classification:** **KEEP** legacy table; canonical communities = **MIGRATE LATER** / separate wave.

---

## 6. Legacy inventory

| Object | Kind | Rows | PK | Relates to canonical | App `.from` | Preserve class |
|--------|------|-----:|----|----------------------|-------------|----------------|
| `ofertas` | table | 5 | bigint | source of VIEW `offers` | none | KEEP / ARCHIVE |
| `offers` | **view** | 5 | — | shim | heavy (wrong shape) | BRIDGE → rename |
| `votos` | table | 0 | (offer_id,user_id) | vs `offer_votes` | none | KEEP |
| `moderation_log` | table | 0 | bigint | vs `moderation_logs` | none | KEEP |
| `user_roles` | **view** | 1 | — | from profiles.role | heavy | BRIDGE → rename |
| `user_roles_tbl` | table | 0 | uuid | partial staff roles | none | BRIDGE / ARCHIVE |
| `user_roles_effective` | view | — | — | UNION view+tbl | UNKNOWN | BRIDGE |
| `payouts` | table | 1 | — | legacy money | none | KEEP (do not touch money path) |
| `communities` | table | 0 | bigint | vs uuid communities | code expects uuid shape | KEEP legacy; later wave |
| `community_members` | table | 0 | uuid | staging-only | UNKNOWN | KEEP |
| affiliate_* legacy | tables | 0–5 | — | not 2026 economy | mixed/UNKNOWN | KEEP |
| score views/MVs | views | — | — | over ofertas | none modern | ARCHIVE |

Backup schemas `aventa_backup_*` exist — do not modify.

---

## 7. Data preservation summary

| Object | Class |
|--------|--------|
| offers VIEW | **BRIDGE** (rename required) |
| user_roles VIEW | **BRIDGE** (rename required) |
| profiles | **KEEP** data + **MIGRATE LATER** schema |
| communities | **KEEP** (empty) + **MIGRATE LATER** uuid model |
| ofertas | **KEEP** / **ARCHIVE** |
| votos | **KEEP** |
| moderation_log | **KEEP** |
| user_roles_tbl | **BRIDGE** / **ARCHIVE** |
| payouts | **KEEP** (money-adjacent; no ops) |

---

## 8. Foundation compatibility

See `FOUNDATION_BASELINE_REVIEW.md`.

**Verdict:** `FOUNDATION_BASELINE_20260917.sql` **cannot run on staging as-is**. Requires:

1. Env fix (founder)  
2. Rename conflicting views  
3. Profiles reconcile strategy (separate from IF NOT EXISTS)  
4. Prefer **waves** (preflight → missing tables only → constraints/RLS → views)

SQL file left **unmodified** this gate (guards already correct; issue is staging state).

---

## 9. Migration waves (design only — not implemented)

### Wave 0 — Environment + backups
- **Goal:** Point local/CI at staging; confirm PITR/backup; snapshot inventory JSON  
- **Objects:** env, docs  
- **Risk:** mis-pointing to prod  
- **Rollback:** restore previous env values  
- **Data:** none  

### Wave 1 — Name freing + foundation tables that do not collide
- **Goal:** Rename `offers`/`user_roles` views; create missing tables (`offer_votes`, `offer_events`, …) **and** only create `offers`/`user_roles` **tables** after rename  
- **Blocker:** `profiles` still wrong — either skip profiles CREATE (already exists) or run dedicated profiles reconcile **before** children needing display_name  
- **Risk:** breaking legacy RPCs that reference view names  
- **Rollback:** restore view definitions from saved DDL  
- **Data:** none destroyed  

### Wave 2 — Constraints / indexes / RLS on new tables
- Apply FKs/policies from foundation for newly created tables  
- Risk: policy recursion if user_roles incomplete  

### Wave 3 — Canonical views/functions
- `public_profiles_view`, `ofertas_ranked_general`, `daily_system_metrics`  
- Requires canonical `offers` **table** + profiles columns  

### Wave 4 — Domain tables
- rewards/attribution/economy/supply from dated migrations  
- Only after foundation healthy  

### Wave 5 — Distribution
- `distribution_*` from `20260917_distribution_engine_foundation.sql`  
- Flag OFF; no Telegram  

### Profiles special track (between Wave 0 and 1 or parallel)
- Additive columns vs rebuild — **decision deferred**; forensics only  
- Preserve `id` mapping to auth.users  

### Communities special track
- Defer; empty; create uuid table under new name or after legacy rename — later  

---

## 10. Exact next action

**Founder corrects `.env.local` so `NEXT_PUBLIC_SUPABASE_URL` ref = `oojshofrpbfwsiypcecr` (staging), matching guards — then re-run env preflight. No SQL yet.**
