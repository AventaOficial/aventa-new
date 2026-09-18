# FOUNDATION DDL IMPLEMENTATION PLAN

**Status:** PLAN ONLY — no SQL authored/applied in this gate  
**Date:** 2026-09-17  
**Depends on:** `FOUNDATION_DDL_SPEC.md`, `STAGING_SCHEMA_BOOTSTRAP_PLAN.md`, Gate0 prod catalog  

---

## 1. What foundation we must create

**FOUNDATION REQUIRED** (empty install / staging modernity):

1. `profiles` + `user_roles` (auth-facing)  
2. `offers` (with prod column set from Gate0)  
3. Resolve circular FK `profiles.welcome_offer_id` ↔ `offers` (defer FK or two-phase)  
4. `offer_votes`, `offer_events`, `offer_favorites`  
5. `comments`, `comment_likes`  
6. `moderation_logs`, `user_bans`, `offer_reports`  
7. `notifications`, `user_email_preferences`  
8. `write_jobs_queue`, `app_config`  
9. Views: `public_profiles_view`, `ofertas_ranked_general`  

**FOUNDATION OPTIONAL (soon after):**  
`announcements`, `plaza_*`, `communities`, `community_offers`, `user_activity`, view `daily_system_metrics`

**NOT foundation (domain waves later):**  
Rewards/economy/supply tables (exist on prod; have CREATE in dated migrations)  
`distribution_*` (repo migration only; **absent on prod**)

**Do not DROP** staging legacy (`ofertas`, `votos`, `moderation_log`, `payouts`, …).

---

## 2. Order

```text
A. profiles (without welcome_offer FK) + user_roles
B. offers (+ created_by → profiles)
C. Add profiles.welcome_offer_id FK → offers (if required)
D. offer_votes, offer_events, offer_favorites
E. comments → comment_likes
F. moderation_logs, user_bans, offer_reports
G. notifications, user_email_preferences
H. write_jobs_queue, app_config
I. Views public_profiles_view, ofertas_ranked_general
J. Optional: plaza, communities, community_offers, announcements, user_activity, daily_system_metrics view
K. Domain migrations from docs/supabase-migrations (rewards → attribution cols → economy → supply)
L. distribution foundation SQL (staging first; prod still lacks tables)
```

---

## 3. Dependencies

| Object | Requires |
|--------|----------|
| `offers.created_by` | `profiles.id` |
| `profiles.welcome_offer_id` | `offers.id` |
| votes/events/favorites/comments/reports/logs | `offers.id` |
| comment_likes | `comments.id` |
| ranked view | `offers` columns used in definition |
| public_profiles_view | `profiles` columns listed in Gate0 view DDL |
| rewards_v1 | `offers`, `profiles` |
| distribution_* | `offers` |
| Most 2026 ALTER files | foundation columns already present |

**Migrations that cannot run on empty DB:** any ALTER-only file in `docs/supabase-migrations/` that assumes `offers`/`profiles`/`offer_events`/`offer_votes`/`comments` exist — i.e. **almost all dated ALTER scripts**.

---

## 4. RLS that must exist

From production Gate0:

- Every foundation base table: **RLS enabled**  
- `user_roles`: RLS **forced**  
- Recreate policies from Gate0 `pg_policies` dump for `offers`, `profiles`, etc. (exact `USING`/`WITH CHECK` in catalog artifact)  
- Tables with RLS on but **0 policies** (`offer_events`, `write_jobs_queue`, `reward_outbound_clicks`, …): match prod (service_role access pattern) — **do not invent** policies  

**Verification:** SQL Editor READ-ONLY compare `pg_policies` staging vs prod after apply.

---

## 5. Objects before 2026 dated migrations

Must exist **before** applying typical 20260830+ / 202609* ALTER/CREATE domain files:

`profiles`, `offers`, `offer_votes`, `offer_events`, `comments` (for comments_* migration), `user_roles`, and any FK targets referenced.

Then safe to apply additive domain packs per `STAGING_SCHEMA_BOOTSTRAP_PLAN.md` waves 5–8.

---

## 6. Legacy that may remain

On staging, keep indefinitely until explicit deprecate plan:

`ofertas`, `votos`, `moderation_log`, `payouts`, score MVs, unused RPCs  

They do not block creating modern parallel names.

---

## 7. Manual verification checklist

1. Re-run Gate0 READ-ONLY queries on prod if schema drifts.  
2. Staging SQL Editor: columns/RLS for `offers`/`profiles` vs Gate0 (CONFLICT detection).  
3. Confirm `offer_quality_checks` purpose (UNKNOWN).  
4. Confirm storage bucket strategy (`ofertas` vs prod bucket names).  
5. Relink awareness: CLI `--linked` = **production** today — never apply DDL via linked without explicit staging link.  
6. Founder approval before any staging DDL session.

---

## 8. Tests that must pass (after future apply — not now)

| Gate | Check |
|------|--------|
| Env | Staging ref guards |
| Inventory | REST: foundation tables no longer PGRST205 |
| CI | `npm run ci:verify` with staging env |
| Smoke | Read feed/moderation paths against staging |
| Money | Flags still OFF; no settlement |
| Distribution | Only after domain+distribution SQL; flag OFF |

---

## 9. How to apply first on staging (future session)

1. Author **executable** foundation SQL from this SPEC + Gate0 dump (new files under `docs/supabase-migrations/`, `IF NOT EXISTS`, no DROP).  
2. Link CLI / SQL Editor to **`oojshofrpbfwsiypcecr` only**.  
3. Apply foundation pack.  
4. Validate.  
5. Apply domain waves.  
6. Record `MIGRATION_*_STAGING.md`.

**Forbidden:** `--linked` while linked to prod; `clean_offers_and_metrics_data.sql`; data clone from prod.

---

## 10. How to promote to production later

Production **already has** foundation tables. Promotion path for Gate0 work is:

- **Do not** re-CREATE foundations on prod.  
- Only promote **new** canonical files that prod lacks (e.g. `distribution_*` when approved).  
- Any foundation SQL must be written idempotently (`IF NOT EXISTS`) so accidental prod run is no-op.

---

## Exact next action

1. Human review `FOUNDATION_DDL_SPEC.md` + Gate0 artifacts.  
2. Separate task: **author** foundation SQL (still no apply until approved).  
3. Staging column/RLS READ-ONLY compare for CONFLICT on existing `offers`/`profiles`.  
4. Distribution / Telegram remain blocked until staging foundation + distribution migration applied and validated.

---

## Safety (this gate)

| Axis | Status |
|------|--------|
| production writes | 0 |
| staging writes | 0 |
| money / Supply / attribution / Distribution code | unchanged |
| Executable foundation SQL | not created |
