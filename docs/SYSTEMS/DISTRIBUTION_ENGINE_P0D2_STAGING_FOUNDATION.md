# DISTRIBUTION ENGINE P0-D2 — STAGING FOUNDATION

**Date:** 2026-09-17  
**Gate:** P0-D2 Gate 2 — foundation tables only  
**Status:** COMPLETE · DETENTE (no Telegram / drain / cron / `/r/d` / flag ON)

---

## 1. Target

| Item | Value |
|------|-------|
| Staging | `oojshofrpbfwsiypcecr` |
| Production (forbidden) | `mkgsrpsuvedwwlzmzmzh` |
| SQL applied | `docs/supabase-migrations/20260917_distribution_engine_foundation.sql` |
| Apply method | MCP `apply_migration` with explicit `project_id=oojshofrpbfwsiypcecr` |

---

## 2. Preflight

| Check | Result |
|-------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` ref | `oojshofrpbfwsiypcecr` |
| `AVENTA_EXPECTED_SUPABASE_REF` | `oojshofrpbfwsiypcecr` |
| `AVENTA_SUPABASE_TARGET` | `staging` |
| Target ≠ production | PASS |
| `DISTRIBUTION_ENGINE_ENABLED` | unset / OFF |
| projectRefs guard | 7/7 PASS |

---

## 3. SQL audit

| Op type | Count | Notes |
|---------|------:|-------|
| CREATE TABLE | 4 | brands, destinations, publications, events |
| CREATE INDEX | 8 | IF NOT EXISTS |
| ALTER TABLE (RLS) | 4 | ENABLE ROW LEVEL SECURITY |
| DROP POLICY IF EXISTS | 4 | idempotent policy recreate |
| CREATE POLICY | 4 | staff SELECT only |
| GRANT | 8 | service_role ALL + authenticated SELECT |
| REVOKE | 12 | PUBLIC/anon/authenticated ALL then re-GRANT SELECT |
| DROP TABLE / TRUNCATE / DELETE / INSERT seed | **0** | |
| FUNCTION / TRIGGER | **0** | |
| Alters to offers / money / Supply / attribution / moderation | **0** | |

No extra tables beyond the four named above.

---

## 4. Migration result

| Item | Result |
|------|--------|
| Pre-apply `distribution_*` on staging | all null |
| Apply | **success** |
| Destructive conflict | none |

---

## 5. Tables created

| Table | RLS | Policies | Rows |
|-------|-----|----------|-----:|
| `distribution_brands` | on | 1 staff SELECT | 0 |
| `distribution_destinations` | on | 1 staff SELECT | 0 |
| `distribution_publications` | on | 1 staff SELECT | 0 |
| `distribution_events` | on | 1 staff SELECT | 0 |

No destination/chat seeds. No Telegram tokens.

---

## 6. Schema verification

### Key constraints

| Constraint | Present |
|------------|---------|
| `distribution_publications_offer_id_fkey` → `offers(id)` ON DELETE CASCADE | **YES** |
| `distribution_publications_destination_id_fkey` → destinations | **YES** |
| `distribution_destinations_brand_id_fkey` → brands | **YES** |
| `distribution_events_publication_id_fkey` → publications | **YES** |
| `UNIQUE (idempotency_key)` | **YES** |
| `UNIQUE (offer_id, destination_id, distribution_version)` | **YES** |
| Destination `UNIQUE (provider, external_destination_key)` | **YES** |

Publications reference existing `offers.id` only — **no offer cloning**.

### Indexes

Including `idx_distribution_publications_drain` (partial on pending/retryable), offer, destination, status_created, destination brand/kind, events by publication/type.

---

## 7. RLS / policies

| Policy | Action | Role |
|--------|--------|------|
| `distribution_*_select_staff` | SELECT | authenticated + staff roles via `user_roles` |

**No** INSERT/UPDATE/DELETE policies for clients → fail-closed for browser writes.

---

## 8. Grants

| Role | Privileges |
|------|------------|
| `service_role` | ALL (writes for server enqueue/future drain) |
| `authenticated` | SELECT only (gated by staff policy) |
| `anon` | **none** |

---

## 9. Idempotency

Verified both:

1. `UNIQUE (offer_id, destination_id, distribution_version)`
2. `UNIQUE (idempotency_key)`

---

## 10. State machine

`distribution_publications.status` CHECK allows:

`pending` | `publishing` | `published` | `retryable` | `failed` | `cancelled`

P0-D2 does **not** move rows to `published` (no worker). Default insert status = `pending`.

---

## 11. Routing readiness

Schema supports:

- brand (`distribution_brands`)
- destination + `provider` ∈ telegram|whatsapp|web
- `kind` ∈ general|category|coupons + `category_ids`
- `distribution_version`
- `tracking_campaign_key` / `credential_ref` (env name only)

**No** real destination seeds / chat IDs.

---

## 12. Feature flag

`DISTRIBUTION_ENGINE_ENABLED` remains **OFF** (local unset; not flipped).

---

## 13. Tests

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASS |
| projectRefs + distribution contracts | 31 PASS |
| `npm run ci:verify` | PASS (1636 + build) |
| staging W1.5 smoke | PASS (see terminal) |

---

## 14. Production safety

| Check | Result |
|-------|--------|
| Production writes | **0** |
| Production `distribution_brands` | still **null** |
| Production offers_n | 817 (unchanged read) |

---

## 15. Remaining blockers (next gates — NOT this wave)

1. Staging destination seeds (stub / non-prod chat ids)  
2. Telegram adapter (later)  
3. Drain worker + cron  
4. `/r/d` hop  
5. Upload INSERT policy for `offer-images` (UNKNOWN from Gate 1)  
6. Flip flag only after adapters + safety gates  

**Exact next step (when authorized):** Gate 3 — staging-only destination/brand seed stubs + enqueue dry-run with flag still OFF — **or** Telegram adapter design. No auto-continue.

---

## Definition of Done

- [x] STAGING confirmado  
- [x] migration auditada  
- [x] 4 tablas creadas/verificadas  
- [x] PK/FK/unique/indexes  
- [x] RLS + grants  
- [x] idempotency  
- [x] state machine  
- [x] routing model  
- [x] flag OFF  
- [x] tsc / ci:verify PASS  
- [x] production writes = 0  
- [x] docs  
- [x] NO Telegram / drain / cron / production  
