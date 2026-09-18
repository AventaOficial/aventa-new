# STAGING W0 — BACKUP / SAFETY PLAN

**Date:** 2026-09-17  
**Target (ONLY):** `oojshofrpbfwsiypcecr` (Aventa Staging)  
**Forbidden:** `mkgsrpsuvedwwlzmzmzh` (production)  
**Local preflight:** PASS (URL/ref/target = staging)  

---

## 1. Verified target

| Check | Result |
|-------|--------|
| `.env.local` URL ref | `oojshofrpbfwsiypcecr` |
| `AVENTA_EXPECTED_SUPABASE_REF` | `oojshofrpbfwsiypcecr` |
| `AVENTA_SUPABASE_TARGET` | `staging` |
| Guard tests | 7/7 |
| MCP DDL target | `project_id=oojshofrpbfwsiypcecr` exclusively |

**Abort if any command would use production ref.**

---

## 2. Objects that will be modified (W1)

| Object | Operation | Destructive? |
|--------|-----------|--------------|
| VIEW `public.offers` | `ALTER VIEW … RENAME TO offers_legacy_compat_v` | No (rename) |
| VIEW `public.user_roles` | `ALTER VIEW … RENAME TO user_roles_from_profiles_v` | No (rename) |
| VIEW `user_roles_effective` | `CREATE OR REPLACE` to point at renamed sources / new table | No |
| TABLE `profiles` | `ADD COLUMN IF NOT EXISTS` canonical cols; deterministic UPDATEs | Additive |
| NEW TABLE `user_roles` | CREATE + seed from `profiles.role` where staff | Additive |
| NEW TABLE `offers` | CREATE empty canonical uuid table | Additive |
| NEW tables | `offer_votes`, `offer_events`, `offer_favorites`, `comments`, `comment_likes`, `offer_reports`, `moderation_logs`, `moderation_outcomes`, `user_bans`, `notifications`, `user_email_preferences`, `write_jobs_queue`, `app_config` (+ optional announcements/plaza/user_activity) | Additive |
| Views | `public_profiles_view`, `ofertas_ranked_general`, `daily_system_metrics` | Create new names (no clash) |
| RLS/policies | Enable + create prod-backed policies on new/altered objects | Additive |

**Out of W1:** `communities` / `community_offers` (bigint vs uuid) — see `STAGING_COMMUNITIES_RECONCILIATION.md`.

---

## 3. Legacy objects that remain (NO DROP)

`ofertas`, `votos`, `moderation_log`, `user_roles_tbl`, `payouts`, `profiles.role`, `community_members`, affiliate legacy tables, score views/MVs, backup schemas `aventa_backup_*`, renamed views `offers_legacy_compat_v`, `user_roles_from_profiles_v`.

---

## 4. Existing data (pre-W1 snapshot)

| Relation | Rows | Notes |
|----------|-----:|-------|
| auth.users | 1 | Preserve |
| profiles | 1 | role=`admin`; preserve id |
| ofertas | 5 | demo; **not** migrated to uuid offers |
| offers (view) | 5 | mirrors ofertas |
| votos | 0 | |
| moderation_log | 0 | |
| user_roles_tbl | 0 | |
| communities | 0 | deferred |
| payouts | 1 | untouched (money-adjacent) |

---

## 5. Rollback strategy

1. **Views renamed:** `ALTER VIEW offers_legacy_compat_v RENAME TO offers;` (only if table `offers` dropped/renamed first — requires careful reverse order).  
2. **Safer rollback:** keep both; rename canonical table aside (`offers` → `offers_canonical_w1`) then restore view name — **only if W1 fails mid-flight**.  
3. **profiles columns:** additive — leave in place (nullable/defaulted); no need to remove for rollback.  
4. **user_roles rows:** DELETE seeded rows by known user_id if needed (not DROP table unless approved later).  
5. **No TRUNCATE/DROP of legacy** in W1; rollback never deletes `ofertas` data.  
6. Supabase PITR / dashboard backup: founder confirms project backup available (dashboard) — **UNKNOWN in-repo**.

Saved DDL snapshots: Gate 0.5 forensics + this plan + `STAGING_W1_RECONCILIATION_*.sql` comments.

---

## 6. Operation order

```text
W0  Verify staging-only + this document
W1a Rename conflicting views
W1b Recreate user_roles_effective
W1c profiles ADD COLUMN + deterministic UPDATEs
W1d CREATE user_roles + seed from profiles.role (staff only)
W1e CREATE offers (empty) + child foundation tables + FKs/indexes/RLS/policies
W1f CREATE canonical views (public_profiles_view, ofertas_ranked_general, …)
W1g Validate catalog + tsc + guards + ci:verify
STOP (no W2)
```

---

## 7. Risks

| Risk | Mitigation |
|------|------------|
| Accidental prod DDL | Hard-code staging project_id; abort on prod ref |
| App breaks if views renamed before tables exist | Same transaction / sequential create immediately after rename |
| Legacy RPCs expect `user_roles` view shape | `user_roles_effective` + renamed view preserved |
| profiles RLS duplicates | Keep existing; add missing modern policies only if safe |
| Invented data for ofertas→offers | **Do not migrate** 5 rows (documented gap) |

---

## 8. Forbidden in W0/W1

DROP TABLE/SCHEMA, TRUNCATE, CASCADE destructive, production writes, money/Supply/attribution/Distribution D2, Telegram/WhatsApp.
