# STAGING PROFILES RECONCILIATION

**Date:** 2026-09-17  
**Staging:** `oojshofrpbfwsiypcecr`  
**Canonical source:** production `mkgsrpsuvedwwlzmzmzh` + app code  
**Rows:** 1 profile (preserve `id` → `auth.users`)

---

## 1. Column inventory

### Staging (legacy)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | — |
| created_at | timestamptz | YES | now() |
| full_name | text | YES | — |
| avatar_url | text | YES | — |
| phone, telefono, direccion, address | text | YES | — |
| join_number, user_number | int4 | YES | sequences |
| country, currency | text | YES | currency MXN |
| role | text | NO | 'user' CHECK user/moderator/admin |
| rank_tier, rank_points, karma | … | YES | — |
| muted_until | timestamptz | YES | — |
| trusted | bool | YES | false |
| level | int4 | NO | 1 |
| is_unlocked, unlocked_at, unlock_basis_count | … | YES | — |
| approved_offers_count, total_votes_cast | int4 | YES | 0 |

### Production (canonical)

| Column | Type | Notes |
|--------|------|--------|
| id, username, avatar_url, created_at | … | |
| **display_name** | text | UI SoT (`app/me`, moderation, …) |
| onboarding_completed, offers_*_count | … | |
| reputation_score, **reputation_level**, **is_trusted** | … | |
| slug, leader_badge, ml_tracking_tag, preferred_categories | … | |
| vote_weight_multiplier | int4 NOT NULL default 1 | |
| commissions/fiscal/tracking/legal/rewards/welcome_* | … | |
| owner_auto_approve_offers* | … | |

---

## 2. Deterministic mappings (W1)

| Staging → Canonical | Evidence | Action |
|---------------------|----------|--------|
| `full_name` → `display_name` | App selects `display_name` everywhere for person name; staging has no `display_name` | ADD `display_name`; `UPDATE SET display_name = full_name WHERE display_name IS NULL` |
| `trusted` → `is_trusted` | Prod column `is_trusted`; staging `trusted` | ADD `is_trusted NOT NULL DEFAULT false`; `UPDATE SET is_trusted = COALESCE(trusted, false)` |
| `approved_offers_count` → `offers_approved_count` | Prod naming in schema + counters | ADD + copy COALESCE |

**Not mapped in W1 (UNKNOWN / keep legacy columns):**

| Staging | Why |
|---------|-----|
| `role` | Staff roles move to `user_roles` table; keep column for legacy RLS helpers |
| `level` → `reputation_level` | Semantic overlap unproven; ADD `reputation_level DEFAULT 1` without copy |
| phone/address/karma/rank_*/unlock_* | Legacy-only; retain; no prod equivalent required for W1 |

---

## 3. Constraints / FK / RLS

| | Staging | W1 approach |
|--|---------|-------------|
| PK | id | keep |
| FK | id → auth.users ON DELETE CASCADE | keep |
| UNIQUE | user_number | keep |
| CHECK | role IN (user,moderator,admin) | keep (legacy) |
| RLS | many duplicate SELECT policies | keep; do not disable; add modern policies only if missing and safe |

Prod policies (`profiles_public_read`, `profiles_select_own`, `profiles_update_own`, `profiles_delete_own`): add with `DROP POLICY IF EXISTS` / `CREATE` — may coexist with legacy policies (broader OR).

---

## 4. Auth relationship

`profiles.id` = `auth.users.id` (1 user). **Never recreate profiles row.** Additive columns only.

---

## 5. W1 implementation status

Implemented in `docs/supabase-migrations/STAGING_W1_RECONCILIATION_20260917.sql` (profiles section).
