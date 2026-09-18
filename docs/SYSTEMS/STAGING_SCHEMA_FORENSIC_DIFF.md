# STAGING SCHEMA FORENSIC DIFF

**Date:** 2026-09-17  
**Method:** READ-ONLY Supabase MCP `execute_sql` (SELECT only) + `list_tables` with explicit `project_id`  
**Artifact:** `tmp/staging-prod-schema-diff.json`  
**Companion:** `FOUNDATION_DDL_SPEC.md`, `FOUNDATION_BASELINE_20260917.sql`  

**Remote writes:** production = **0**, staging = **0**

---

## 1. Executive summary

Staging (`oojshofrpbfwsiypcecr`) is a **legacy 2025 schema** with Spanish dual naming and compatibility views. Production (`mkgsrpsuvedwwlzmzmzh`) is the **canonical 2026 schema**.

Critical blockers for applying foundation DDL on staging:

1. **`public.offers` is a VIEW** over `ofertas` (bigint), not a uuid table.  
2. **`public.user_roles` is a VIEW** over `profiles.role`, not the staff roles table.  
3. **`public.profiles` exists as a TABLE with incompatible legacy columns** (no `display_name`; has `full_name`/`role`/`karma`).  
4. **`communities.id`**: staging `bigint` vs prod `uuid`.  
5. Local `.env.local` **URL currently points to PRODUCTION** while `AVENTA_EXPECTED_SUPABASE_REF` / `AVENTA_SUPABASE_TARGET` expect staging — **env mismatch**.

Name-only overlap between base tables: **`profiles`, `communities`** only. Almost all 2026 tables are **MISSING** on staging.

---

## 2. Environment refs

| Item | Value |
|------|--------|
| Production | `mkgsrpsuvedwwlzmzmzh` |
| Staging | `oojshofrpbfwsiypcecr` |
| `.env.local` URL ref (preflight) | **`mkgsrpsuvedwwlzmzmzh` (PRODUCTION)** |
| `AVENTA_EXPECTED_SUPABASE_REF` | `oojshofrpbfwsiypcecr` |
| `AVENTA_SUPABASE_TARGET` | `staging` |
| Forensics transport | MCP `project_id` (does not use `.env.local`) |

**Safety note:** Any script/app using `.env.local` today would hit **production**. Gate0 forensics intentionally did **not** use env-bound clients for writes or inventory that could mutate.

---

## 3. Tables MATCH (base name both sides)

| Name | Notes |
|------|--------|
| `profiles` | Name match only → **CONFLICT** columns (see §6) |
| `communities` | Name match only → **CONFLICT** PK type (see §6) |

No other base-table names match between prod and staging.

---

## 4. Tables MISSING on staging (present on prod as BASE TABLE)

Includes all foundation/domain objects such as:

`offers` (as table), `user_roles` (as table), `offer_votes`, `offer_events`, `offer_favorites`, `comments`, `comment_likes`, `moderation_logs`, `moderation_outcomes`, `notifications`, `user_email_preferences`, `write_jobs_queue`, `app_config`, `announcements`, plaza_*, `community_offers`, rewards/economy/supply/hunter tables, `reward_outbound_clicks`, etc.

Full list: `tmp/staging-prod-schema-diff.json` → `tables.missing_on_staging_vs_prod` (**43** entries; note `offers`/`user_roles` appear as staging **views**, not base tables).

---

## 5. Tables EXTRA / LEGACY on staging

| Staging relation | Class |
|------------------|--------|
| `ofertas` | LEGACY SoT (bigint) |
| `votos` | LEGACY votes |
| `moderation_log` | LEGACY (singular) |
| `user_roles_tbl` | LEGACY staff table (prod uses `user_roles`) |
| `community_members` | LEGACY (prod uses `community_offers` pattern) |
| `payouts`, `affiliate_*` (legacy names), `ui_events*`, `site_settings`, `stores`, `merchants`, score MVs/views, etc. | LEGACY / EXTRA |

**Do not DROP.** Coexistence allowed until explicit deprecate phase.

Backup schemas observed on staging (not touched): `aventa_backup_2025_09_19`, `aventa_backup_now`.

---

## 6. Column differences (canonical overlaps)

### 6.1 `profiles` — CONFLICT

| | Production | Staging |
|--|------------|---------|
| Shape | `display_name`, reputation_*, tracking tags, welcome_offer_id, legal/rewards consent, … | `full_name`, `role`, `karma`, `rank_tier`, unlock fields, … |
| `display_name` | present | **absent** |
| Staff roles | separate `user_roles` table | embedded `profiles.role` + view |

`CREATE TABLE IF NOT EXISTS profiles` would **no-op** and leave legacy shape — foundation SQL **aborts** if `display_name` missing.

### 6.2 `offers` — CONFLICT (kind + columns)

| | Production | Staging |
|--|------------|---------|
| Kind | BASE TABLE | **VIEW** |
| PK | `uuid` | view exposes `bigint` from `ofertas` |
| Columns | full 2026 set (`offer_url`, `original_offer_url`, ranking, lock/snooze, …) | subset mapped from Spanish `ofertas` |

### 6.3 `user_roles` — CONFLICT (kind + columns)

| | Production | Staging |
|--|------------|---------|
| Kind | BASE TABLE (`id`, `user_id`, `role`, `created_at`) | **VIEW** (`user_id`, `role` from profiles) |
| RLS | enabled + **forced** | N/A (view) |
| Staging table | — | `user_roles_tbl` similar to prod table |

### 6.4 `communities` — CONFLICT

| | Production | Staging |
|--|------------|---------|
| `id` | **uuid** | **bigint** |
| Columns | id, name, slug, description, icon, created_at | many legacy revenue/policy columns |

Foundation baseline **excludes** `communities` / `community_offers` for this reason.

---

## 7. FK differences

Production foundation FKs (evidence): `offers.created_by → profiles`, `profiles.welcome_offer_id → offers`, children → `offers`/`auth.users`/`profiles` as documented in Gate0 constraint dump.

Staging: FKs centered on `ofertas`/`votos`/`moderation_log` (legacy). Canonical FKs for `offer_*` / `moderation_logs` **absent** (tables missing).

Exact staging FK inventory for all relations: available via MCP constraint query artifact path in session; summary = **no parity** with prod foundation graph.

---

## 8. Constraint differences

Prod foundation CHECKs (votes value set, event_type, moderation decision, bank_coupon, msi_months, …) **absent** on staging (objects missing).

Staging has legacy CHECKs on `ofertas`/`votos` — **UNKNOWN** full list beyond observed table defs; not used as architectural SoT.

---

## 9. Index differences

Prod has rich indexes on `offers`, `offer_votes`, `offer_events`, moderation, etc. Staging indexes target `ofertas`/`votos`. **No match** for foundation index set.

Foundation SQL includes a **subset** of prod indexes evidenced in Gate0 (not every redundant prod index).

---

## 10. RLS differences

| Env | Finding |
|-----|---------|
| Prod | All **47** base tables RLS enabled; `user_roles` forced; policies for offers/profiles/moderation/… |
| Staging | Listed base tables RLS enabled; policies use `es_admin()` / `profiles.role` / Spanish table names |

Policies are **not interchangeable**. Foundation SQL reproduces **prod** policies for new canonical tables only.

---

## 11. View differences

| View | Prod | Staging |
|------|------|---------|
| `ofertas_ranked_general` | YES (over `offers` table) | **MISSING** |
| `public_profiles_view` | YES | **MISSING** |
| `daily_system_metrics` | YES | **MISSING** |
| `offers` | N/A (table) | **VIEW** (compat) |
| `user_roles` | N/A (table) | **VIEW** (compat) |
| Many score/helpers views | no | LEGACY present |

---

## 12. Function / RPC differences (foundation-relevant)

| Prod (examples) | Staging |
|-----------------|---------|
| `offer_vote_summary`, vote counter triggers, `recalculate_offer_metrics`, `handle_new_user`, rewards payout RPC, hunter calibration RPCs | Legacy `es_admin`, `ofertas_*`, `admin_payouts_*`, analytics_* |

**Overlap:** `handle_new_user`, `set_updated_at` names exist on both — **bodies may differ** (UNKNOWN without full `pg_get_functiondef` compare). Foundation SQL does **not** recreate trigger function bodies (TODO).

---

## 13. Storage differences

| Env | Buckets |
|-----|---------|
| Prod | `offer-images` (public) |
| Staging | `ofertas`, `ofertas-images` (public) |

**CONFLICT_NAMES.** No bucket mutations in this gate.

---

## 14. Auth observations

| Env | `auth.users` count |
|-----|---------------------:|
| Prod | 17 |
| Staging | 1 |

No user mutations. No PII exported.

---

## 15. Critical blockers

1. Env URL → production mismatch vs staging guards.  
2. Staging `offers` VIEW blocks `CREATE TABLE offers`.  
3. Staging `user_roles` VIEW blocks `CREATE TABLE user_roles`.  
4. Staging `profiles` incompatible — cannot silently IF NOT EXISTS.  
5. `communities` uuid vs bigint — deferred from foundation baseline.  
6. Trigger/function completeness UNKNOWN in authored SQL.  
7. Storage bucket naming drift for images.

---

## 16. Unknowns

- Exact full staging FK/index dump beyond foundation-relevant conflicts (partial).  
- Function body diffs for shared names.  
- Whether staging OpenAPI previously listed `offers` as table — catalog proves **view**.  
- Grants exact REVOKE matrix for `offer_events` / `write_jobs_queue` (prod service_role-only pattern) — partially TODO in SQL footer.

---

## 17. Recommended migration order (after approval — not executed)

1. Fix `.env.local` to staging URL (founder).  
2. Manually rename staging views: `offers` → e.g. `offers_legacy_v`, `user_roles` → e.g. `user_roles_from_profiles_v` (**no DROP of underlying data**).  
3. Resolve `profiles` CONFLICT (dedicated reconcile plan — **not** silent ALTER in this file).  
4. Apply `FOUNDATION_BASELINE_20260917.sql` on staging only.  
5. Validate tables/RLS/views.  
6. Later domain waves (rewards/attribution/economy/supply/distribution).  
7. Never DROP `ofertas`/`votos`/`moderation_log` in this phase.

---

## Extensions inventory

| Prod | Staging extra |
|------|----------------|
| pg_cron, pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp | + `pg_graphql`, `pg_trgm` |
