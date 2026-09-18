# STAGING SCHEMA BOOTSTRAP PLAN

**Status:** PLAN ONLY — **no SQL executed, no remote applies**  
**Date:** 2026-09-17  
**Staging:** `oojshofrpbfwsiypcecr` (verified)  
**Production:** `mkgsrpsuvedwwlzmzmzh` (do not touch)  
**Inputs:** `STAGING_SCHEMA_DRIFT.md`, `docs/supabase-migrations/*`, app `.from()` inventory, guards  

**Canonical flow (target):**

```text
REPO / CANONICAL MIGRATIONS  →  STAGING  →  VALIDATION  →  PRODUCTION
```

Not: manual prod table copy, data cloning, ad-hoc INSERT/UPDATE “fixes”, or staging-only forks.

---

## 1. Current staging state

From READ-ONLY REST inventory (`STAGING_SCHEMA_DRIFT.md`):

| Aspect | State |
|--------|--------|
| Character | Legacy ~2025 surface + dual naming |
| Present (examples) | `offers`+`ofertas` (5), `profiles` (1), `votos`, `moderation_log`, `payouts`, affiliate_* legacy, communities, stores/merchants, scores MVs, ~71 old RPCs |
| Missing vs current app | `offer_votes`, `offer_events`, `moderation_logs`/`outcomes`, plaza, comments stack, notifications, `write_jobs_queue`, rewards v1, modern ledger/economy, hunter/supply, `distribution_*`, … |
| Column/RLS/index parity | **UNKNOWN** (no catalog SQL) |
| Data | Preserve; no DROP/TRUNCATE/DELETE |

---

## 2. Target architecture

Objects the **current** Aventa codebase actually uses (confirmed `.from` / documented SoT). Grouped by domain.

### CORE
`offers`, `profiles`, `public_profiles_view` (view), `ofertas_ranked_general` (view), `offer_votes`, `offer_favorites`, `offer_events`, `comments`, `comment_likes`, `notifications`, `announcements`, `app_config`, `write_jobs_queue`, `plaza_requests`, `plaza_discussions`, `community_offers`, `offer_reports`

### MODERATION
`moderation_logs`, `moderation_outcomes`, `user_bans`, plus `offers` lock/status columns

### ATTRIBUTION
`reward_outbound_clicks` (+ columns from attribution foundation), `offer_events` (volume), `offers.offer_url` / `original_offer_url`

### ECONOMY
`affiliate_ledger_entries`, `affiliate_conversions`, `affiliate_commissions`, `affiliate_commission_revisions`, `affiliate_economic_events`, `affiliate_reconciliation_runs`, `affiliate_reconciliation_findings`, `creator_rewards`, `reward_payouts` (RPC `execute_reward_payout`), `reward_audit_log`, `reward_clawback_adjustments`, `ledger_settlements`, `commission_pools`, `commission_allocations`

### SUPPLY
`hunter_supply_runs`, `hunter_source_health`, `hunter_shadow_cycles`, `hunter_shadow_outcomes`, `product_price_snapshots`, `offer_price_snapshots`, `offer_health_state`, `ingest_cycle_locks`, `mercadolibre_oauth_tokens`

### DISTRIBUTION
`distribution_brands`, `distribution_destinations`, `distribution_publications`, `distribution_events`  
(Code enqueue uses destinations/publications/events; brands in architecture doc.)

### ANALYTICS
`daily_system_metrics`, `user_activity`, plus reuse of `offer_events` / shadow / moderation metrics

### AUTH
`profiles`, `user_roles`, `user_bans`, `user_email_preferences`, Supabase Auth (no `auth.users` `.from`)

**Not target for deletion:** staging-only legacy (`ofertas`, `votos`, `moderation_log`, `payouts`, score MVs, old RPCs) until classified KEEP/DEPRECATE with dependency proof.

---

## 3. Migration inventory (`docs/supabase-migrations/`)

### 3.1 Critical repo gap (BLOCKER)

**No `CREATE TABLE` for foundational app tables** found in this folder for:

`offers`, `profiles`, `offer_votes`, `offer_events`, `comments`, `moderation_logs`, `offer_favorites`, `offer_reports`, …

Most dated files are **ALTER / additive CREATE** assuming those bases already exist (as on production).

| Implication | Action in plan |
|-------------|----------------|
| Staging cannot be built from dated ALTER-only files alone if bases differ | **Gate 0:** produce **schema-only** canonical DDL for missing foundations (from production introspection or reconstructed DDL checked into repo) — **no data clone** |
| Without Gate 0, applying ALTERs may fail or assume wrong shapes | Validation gate before Wave 1 |

### 3.2 Chronological / named inventory (summary)

Legend: **CANONICAL** = additive, referenced by current architecture; **LEGACY** = cleanup/legacy policies; **OPS_DESTRUCTIVE** = data wipe; **PLAN_ONLY** = do not apply; **READ_ONLY** = inspect helpers; **UNKNOWN** = needs review / unclear CREATE base.

#### Dated wave (preferred apply order within wave)

| File | Intent | Creates / modifies | Destructive? | Staging-safe? | Status |
|------|--------|--------------------|--------------|---------------|--------|
| `20260830_beta_security_lockdown.sql` | RLS lockdown, `user_roles` | `user_roles`; ENABLE RLS on offers/etc. | No (states additive) | After foundations | CANONICAL |
| `20260830_cleanup_legacy_policies.sql` | Drop old policies | policies | Policy DROP only | Careful on legacy staging | LEGACY / review |
| `20260830_rewards_v1.sql` | Rewards + clicks | `reward_outbound_clicks`, `creator_rewards`, `reward_payouts`, `reward_audit_log`; profile cols | No | Needs `offers`/`profiles` | CANONICAL |
| `20260830_rewards_v1_monetary_hardening.sql` | Clawback | `reward_clawback_adjustments` | No | After rewards_v1 | CANONICAL |
| `20260830_rewards_rpc_permissions.sql` | RPC grants | privileges | No | After rewards RPCs exist | CANONICAL |
| `20260904_rewards_terms_accept.sql` | Terms cols | `profiles` | No | Yes | CANONICAL |
| `20260906_p04_ledger_settlements.sql` | Settlements table | `ledger_settlements` | No | Yes (settlement stays OFF in app) | CANONICAL |
| `20260906_p1_10_offer_product_fingerprint.sql` | Fingerprint | `offers` | No | Yes | CANONICAL |
| `20260906_p1_12_p1_5_integrity.sql` | Status default pending | `offers` | No | Yes | CANONICAL |
| `20260907_hunter_source_health.sql` | Supply health | `hunter_source_health` | No | Yes | CANONICAL |
| `20260907_offers_original_offer_url.sql` | Canonical URL col | `offers` | No | Yes | CANONICAL |
| `20260908_hunter_shadow_cycles.sql` | Shadow cycles | `hunter_shadow_cycles` | No | Yes | CANONICAL |
| `20260908_ingest_cycle_locks.sql` | Ingest locks | `ingest_cycle_locks` | No | Yes | CANONICAL |
| `20260911_hunter_supply_runs.sql` | Supply runs | `hunter_supply_runs` | No | Yes | CANONICAL |
| `20260912_hunter_shadow_outcomes.sql` | Shadow outcomes | `hunter_shadow_outcomes` | No | Yes | CANONICAL |
| `20260913_hunter_shadow_calibration_collection.sql` | Calibration alter | shadow tables | No | After shadow | CANONICAL |
| `20260914_ml_canonical_url_repair_PLAN_ONLY.sql` | Data repair plan | — | Would UPDATE if completed | **DO NOT APPLY** | PLAN_ONLY |
| `20260914_moderation_outcomes.sql` | Outcomes | `moderation_outcomes` | No | Needs `offers` | CANONICAL |
| `20260914_offer_events_cazar_cta_check.sql` | Event type check | `offer_events` constraint | No | Needs `offer_events` | CANONICAL |
| `20260914_offers_fingerprint_timeout_cooldown_index.sql` | Index | `offers` | No | Yes | CANONICAL |
| `20260916_attribution_foundation_clicks.sql` | Click attribution cols | `reward_outbound_clicks` | No | After rewards_v1 | CANONICAL |
| `20260916_conversion_commission_foundation.sql` | Economy foundation | conversions/commissions/events | No | Needs offers | CANONICAL |
| `20260916_economy_adapter_revisions_reconciliation.sql` | Revisions/recon | revision + recon tables | No | After conversion foundation | CANONICAL |
| `20260916_product_price_snapshots_niche_id.sql` | Niche col | `product_price_snapshots` | No | After PPS create | CANONICAL |
| `20260917_distribution_engine_foundation.sql` | Distribution | 4 `distribution_*` | No | After `offers` | CANONICAL (last wave) |

#### Undated / named files (apply by dependency, not filename date)

| File | Intent | Notes | Status |
|------|--------|-------|--------|
| `affiliate_platform_ledger.sql` | `affiliate_ledger_entries` | Economy ops SoT | CANONICAL |
| `announcements.sql` | announcements | Core | CANONICAL |
| `app_config.sql` | app_config | Core | CANONICAL |
| `write_jobs_queue.sql` | event queue | Core | CANONICAL |
| `plaza_aventa.sql` | plaza_* | Core | CANONICAL |
| `notifications_and_email_prefs.sql` | notifications + prefs | Core | CANONICAL |
| `comments_replies_likes_photos_bans.sql` | Alters `comments`; creates `comment_likes`, `user_bans` | **Requires `comments` base — CREATE missing** | CANONICAL + GAP |
| `product_price_snapshots.sql` / `offer_price_snapshots.sql` / `offer_health_state.sql` | Supply/price | CANONICAL |
| `mercadolibre_oauth_tokens.sql` | ML OAuth | CANONICAL |
| `commissions_*.sql` | Legacy commission pools | Still referenced by admin APIs | CANONICAL (legacy-economy) |
| `offers_*.sql`, `profiles_*.sql`, `categories_*.sql`, `reputation_*.sql` | Column ALTERs | Need base tables | CANONICAL |
| `offer_votes_*.sql` | Vote constraints/triggers | **Need `offer_votes` base — CREATE missing** | CANONICAL + GAP |
| `form_ofertas_ranked_general_category.sql`, `view_ranking_blend.sql`, `public_profiles_view_*.sql` | Views | Depend on offers/profiles shape | CANONICAL |
| `communities_rls_lockdown.sql` | RLS communities | Staging has communities | CANONICAL/review |
| `storage_offer_images_public.sql` | Storage | Buckets differ (`ofertas` vs prod names) | Review |
| `launch_scale_indexes.sql`, `final_hardening_constraints.sql` | Indexes/constraints | After columns exist | CANONICAL |
| `security_*.sql`, `rls_disabled_in_public_lockdown.sql`, `production_ready_revoke_definer_rpc.sql` | Security | Order carefully; may conflict with legacy policies | Review |
| `staff_roles_expansion.sql` | Roles | After `user_roles` | CANONICAL |
| `user_activity_first_last_seen.sql` | user_activity | Analytics | CANONICAL |
| `get_profile_by_slug_fallback.sql` | RPC | Profiles | CANONICAL |
| `offer_event_counts_for_offers.sql` | Helpers | Needs offer_events | CANONICAL |
| `inspect_schema_helpers.sql` | Catalog SELECTs | **READ_ONLY** | READ_ONLY |
| `clean_offers_and_metrics_data.sql` | DELETE offers + children | **DESTRUCTIVE** | **FORBIDDEN** on staging bootstrap |
| `20260914_ml_canonical_url_repair_PLAN_ONLY.sql` | Pseudo UPDATE | Not executable as-is | PLAN_ONLY |

---

## 4. Gap matrix

| Component | Target (repo/app) | Staging (REST) | Migration available | Gap | Risk |
|-----------|-------------------|----------------|---------------------|-----|------|
| CORE offers | `offers` modern cols | Present name; shape UNKNOWN | ALTER files yes; CREATE **UNKNOWN** | MATCH name / CONFLICT? cols | High if cols missing |
| CORE ofertas | not used by app | Present | N/A | LEGACY EXTRA | Keep until proven unused |
| CORE votes | `offer_votes` | Missing (`votos` exists) | ALTER/trigger files; CREATE **UNKNOWN** | MISSING | High — voting broken |
| CORE events | `offer_events` | Missing | CHECK migrate; CREATE **UNKNOWN** | MISSING | High — tracking volume |
| CORE comments | `comments`+likes | Missing | Partial CREATE likes; comments CREATE **UNKNOWN** | MISSING | High |
| MODERATION logs | `moderation_logs` | Missing (`moderation_log`) | No CREATE found | MISSING | High |
| MODERATION outcomes | `moderation_outcomes` | Missing | `20260914_moderation_outcomes.sql` | MISSING | Med |
| ATTRIBUTION clicks | `reward_outbound_clicks` | Missing | rewards_v1 + 20260916 attrs | MISSING | High for D2 hop later |
| ECONOMY ledger | `affiliate_ledger_entries` | Missing | `affiliate_platform_ledger.sql` | MISSING | Med (money OFF) |
| ECONOMY conversion | conversions/commissions | Missing | 20260916_* | MISSING | Med |
| ECONOMY rewards | creator_rewards / payouts | Missing (`payouts` legacy) | rewards_v1 | MISSING / LEGACY | Med |
| SUPPLY hunter | supply_runs / shadow / PPS | Missing | dated 20260907–16 | MISSING | Med |
| DISTRIBUTION | `distribution_*` | Missing | `20260917_distribution_engine_foundation.sql` | MISSING | Blocks D2 |
| ANALYTICS | write_jobs_queue, metrics | Missing / partial | write_jobs_queue.sql etc. | MISSING | Med |
| AUTH roles | `user_roles` | Present | beta lockdown | MATCH name | Col UNKNOWN |
| Plaza | plaza_* | Missing | plaza_aventa.sql | MISSING | Med |
| Views ranking | `ofertas_ranked_general` | UNKNOWN not in OpenAPI list | form_* / view_* SQL | MISSING? | High for feed |

---

## 5. Legacy classification

| Structure | Code `.from`? | Staging | Classification | Notes |
|-----------|---------------|---------|----------------|-------|
| `ofertas` | No | Yes (5) | **KEEP** (for now) | Parallel to `offers`; no delete |
| `votos` | No | Yes | **KEEP** | Until `offer_votes` live + dual-write decision |
| `moderation_log` | No | Yes | **KEEP** | Until `moderation_logs` live |
| `payouts` | No | Yes | **KEEP** | Distinct from `reward_payouts` |
| Score MVs / `ofertas_scores*` | No app `.from` | Yes | **KEEP** / **UNKNOWN** deps | Check RPC refs before deprecate |
| Old RPCs (`submit_offer`, `fn_generate_payouts`, …) | Mostly unused by Next app | Yes | **KEEP** / **DEPRECATE** later | Inventory RPC→table graph in SQL Editor |
| `affiliate_*` legacy set | Partial name overlap | Yes | **UNKNOWN** | May CONFLICT with modern ledger semantics — column audit required |
| `offers` (staging) | Yes (app) | Yes | **MIGRATE** (shape) | Bring columns to prod parity via ALTERs |

**Rule:** No DROP of legacy in bootstrap waves.

---

## 6. Migration dependency graph (conceptual)

```text
[Gate 0] Canonical foundation DDL for MISSING bases
    offers, profiles, offer_votes, offer_events, comments,
    moderation_logs, offer_favorites, offer_reports, …
         │
         ▼
[Wave 1] Security + roles (user_roles / RLS enable) — review vs legacy policies
         │
         ▼
[Wave 2] offers/profiles column ALTERs (category, locks, fingerprint, original_offer_url, bank_coupon, …)
         │
         ▼
[Wave 3] Core satellites: notifications, announcements, app_config, write_jobs_queue, plaza,
         comments extensions, offer_votes constraints/triggers, views (public_profiles, ranked)
         │
         ▼
[Wave 4] Moderation: moderation_outcomes (+ ensure moderation_logs)
         │
         ▼
[Wave 5] Attribution/Rewards: rewards_v1 → monetary hardening → RPC perms → terms → attribution_foundation
         │
         ▼
[Wave 6] Economy: affiliate_platform_ledger → conversion_commission → revisions/recon
         │         (commissions_pools optional; settlement table OK, app settlement OFF)
         ▼
[Wave 7] Supply: PPS, offer_price_snapshots, offer_health, hunter_*, ingest locks, ML oauth
         │
         ▼
[Wave 8] Distribution: 20260917_distribution_engine_foundation.sql
         │
         ▼
[Wave 9] Indexes/hardening/security advisor passes — only after objects exist
```

**Explicit exclusions from sequence:**  
`clean_offers_and_metrics_data.sql`, `*_PLAN_ONLY.sql`, any undocumented prod-only scripts.

---

## 7. Data safety plan

| Object | Schema-only OK? | Data migration? | Compat layer? | Backup? | Destructive? | Manual approval? |
|--------|-----------------|-----------------|---------------|---------|--------------|------------------|
| Legacy `ofertas`/`votos`/… | Leave intact | No for bootstrap | Optional views later | Yes before any future DROP | No in plan | Yes before deprecate |
| Staging `offers` (5 rows) | ALTER additive | No | App may fail until cols exist | Export CSV before Wave 2 | No if IF NOT EXISTS | Yes before Wave 2 |
| New empty tables | CREATE IF NOT EXISTS | No | N/A | Optional | No | Wave approvals |
| Rewards/economy tables | Create empty | No prod data | N/A | N/A | No | Note: money remains OFF |
| Distribution | Create empty | No | N/A | N/A | No | After Waves 1–7 gates |

**Forbidden during bootstrap:** DELETE/TRUNCATE/DROP, cloning production rows, “fix” INSERT to fake parity.

---

## 8. RLS verification plan

REST inventory could not verify RLS. Mark all policy state **UNKNOWN** until SQL Editor READ-ONLY on staging:

Run (from `inspect_schema_helpers.sql` + extensions):

1. `information_schema.tables` / `columns` for public  
2. `pg_policies` + `relrowsecurity` for each target table  
3. Compare to production **READ-ONLY** same queries (separate session; do not apply)  
4. List tables with RLS off that current lockdown migrations expect ON  

Classify results: **VERIFIED** only after that pass.

Security migrations (`20260830_beta_security_lockdown`, advisor phases) apply only after foundations exist and legacy policy conflicts are reviewed.

---

## 9. Distribution prerequisites

Before applying `20260917_distribution_engine_foundation.sql`:

| Prerequisite | Why |
|--------------|-----|
| `public.offers` exists with stable `id uuid` PK | FK `distribution_publications.offer_id` |
| Staging env guards verified | Prevent prod apply |
| Waves 1–2 complete enough that approve/enqueue paths won’t crash on missing cols | Runtime safety |
| Optional: attribution click table if testing hop later | Not required for CREATE of distribution_* |

**Distribution readiness today:** `REQUIRES_MIGRATION` (+ foundation gap).  
**Do not apply Wave 8 in this planning task.**

Money/Supply/attribution **code** stays untouched; creating empty tables is schema-only when later approved.

---

## 10. Exact staging migration sequence (when approved later)

1. **Gate 0 — Foundation DDL pack** (new canonical files derived from schema-only introspection; checked into `docs/supabase-migrations/`; review PR).  
2. **Gate 0b — READ-ONLY RLS/column audit** on staging + prod (document diffs).  
3. **Wave 1** — roles/security additive (review).  
4. **Wave 2** — offers/profiles ALTERs (dated + named offers_*/profiles_*).  
5. **Wave 3** — core satellites + views.  
6. **Wave 4** — moderation_outcomes (+ moderation_logs if in foundation).  
7. **Wave 5** — rewards_v1 chain + attribution_foundation.  
8. **Wave 6** — economy ledger + 20260916 economy files.  
9. **Wave 7** — supply/hunter/price.  
10. **Wave 8** — distribution foundation.  
11. **Wave 9** — indexes/hardening (non-destructive only).  

Each wave: apply on staging → run validation gates → record `MIGRATION_*_STAGING.md` with ref `oojshofrpbfwsiypcecr`.

---

## 11. Validation gates (per wave)

| Gate | Check |
|------|--------|
| G-ENV | `assertStagingSupabaseUrl` / expected ref staging |
| G-REST | `scripts/inventory-staging-readonly.mjs` — expected tables exist (404 gone) |
| G-APP | `npm run ci:verify` against staging env (no prod) |
| G-MOD | Claim/approve smoke only if human-approved (no auto) |
| G-ATTR | track-outbound against staging offer only if tables exist |
| G-DIST | distribution tables present; enqueue with flag OFF still no-ops providers |
| G-MONEY | Confirm settlement/rewards flags still OFF; no ledger writes in smoke |

Fail → stop sequence; do not continue to production promotion.

---

## 12. Rollback strategy

| Level | Action |
|-------|--------|
| Before wave | Schema-only backup / Supabase backup point if available |
| Failed CREATE | Tables are IF NOT EXISTS — drop only with explicit approval (not default) |
| Failed ALTER | Generally non-rollback-automatic; restore from backup |
| Never | Point local/Preview at production to “fix” |

Legacy tables remain as rollback surface for old RPCs.

---

## 13. Production promotion strategy

```text
Staging wave validated
  → Document MIGRATION note (staging ref + file list)
  → Founder approval
  → Apply SAME canonical files to production (already applied historically for many)
  → For Gate 0 NEW foundation files: apply to staging first always; prod only if prod missing (should be rare)
```

Do **not** invent staging-only forks.  
Do **not** promote `clean_offers_*` or PLAN_ONLY.

---

## 14. Risks

1. **Missing CREATE scripts** — highest risk; ALTER-only apply will fail or leave staging unusable.  
2. **Column CONFLICT** on existing `offers`/`profiles` — unknown until catalog compare.  
3. **Legacy policy vs lockdown** — security migrations may break staging OpenAPI.  
4. **Dual offers/ofertas** — confusion / wrong writes if any script targets Spanish names.  
5. **CLI linked to production** — human error if using `--linked` without re-link.  
6. **False sense of “MATCH”** — name-only match ≠ compatible schema.

---

## 15. Unknowns

- Exact column lists/types/constraints on staging vs prod  
- RLS/policy matrix  
- Whether staging `offers` id type matches uuid FKs in modern migrations  
- Full RPC dependency graph on legacy objects  
- Whether `ofertas_ranked_general` / `public_profiles_view` exist under other names  
- Storage bucket naming vs `storage_offer_images_public.sql` expectations  
- Presence of `daily_system_metrics`, `community_offers`, `offer_favorites`, `offer_reports` (not all probed)

---

## 16. Exact next action

1. **Gate 0 work (docs/SQL authoring only, still no apply until approved):**  
   - READ-ONLY schema dump or SQL Editor introspection on **production** for foundational tables missing CREATE in repo.  
   - Author `docs/supabase-migrations/YYYYMMDD_foundation_baseline_*.sql` (schema-only, IF NOT EXISTS) and PR review.  
2. READ-ONLY catalog audit on **staging** (columns + RLS) → update drift doc.  
3. Founder approves Wave 1+ apply session (separate task).  
4. Distribution D2 / Telegram remain **BLOCKED** until Wave 8 validated.

---

## Explicit non-goals (this document)

No remote SQL execution, no migrations applied, no DROP/DELETE/TRUNCATE, no production changes, no money/Supply/attribution/moderation code changes, no Distribution D2 implementation, no Telegram/WhatsApp.
