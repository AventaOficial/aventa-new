# STAGING W1.5 — RLS RECONCILIATION

**Date:** 2026-09-17  
**Staging target:** `oojshofrpbfwsiypcecr`  
**Production reference (READ-ONLY):** `mkgsrpsuvedwwlzmzmzh`  
**SQL applied:** `docs/supabase-migrations/STAGING_W15_RLS_GRANTS_LOCKDOWN_20260917.sql`

---

## Scope

Tables previously marked UNKNOWN after W1:

1. `offer_events`
2. `write_jobs_queue`
3. `app_config`

---

## offer_events

### PRODUCTION

| Item | Value |
|------|-------|
| RLS | enabled |
| Policies | **0** |
| Grants | `postgres`, `service_role` (ALL); **no** `anon` / `authenticated` |
| Triggers | `trg_after_event_insert` → `trigger_recalculate_after_event()` |
| Client access | Denied by design (lockdown) |

**Evidence:** live inventory + `docs/supabase-migrations/20260830_beta_security_lockdown.sql` + `20260830_cleanup_legacy_policies.sql` (“ninguna — deny-by-default”).

**Code paths:** `app/api/track-outbound/route.ts`, `lib/server/writeQueue.ts`, owner/staff dashboards — all via **service_role** (`createServerClient`).

### STAGING (before W1.5)

| Item | Value |
|------|-------|
| RLS | enabled |
| Policies | 0 |
| Grants | **GAP:** `anon` + `authenticated` had ALL (default CREATE TABLE) |

### GAP

| Type | Detail |
|------|--------|
| missing policies | none (0 is correct) |
| extra grants | anon/authenticated ALL |
| conflict | none on policy expressions |

### RECOMMENDATION (applied)

- **Do not invent policies.**
- Keep RLS on + 0 policies.
- `REVOKE ALL` from `PUBLIC` / `anon` / `authenticated`.
- `GRANT ALL` to `service_role`.

**Reason:** Exact prod lockdown pattern; APIs use service_role BYPASSRLS.

**Status after W1.5:** **RESOLVED** (grants aligned; policies remain intentionally empty).

---

## write_jobs_queue

### PRODUCTION

| Item | Value |
|------|-------|
| RLS | enabled |
| Policies | **0** |
| Grants | `postgres`, `service_role` only |

**Evidence:** `docs/supabase-migrations/security_advisor_phase1_lockdown.sql`, `rls_disabled_in_public_lockdown.sql`.

**Code paths:** `lib/server/writeQueue.ts`, cron `process-write-queue` — service_role only.

### STAGING (before)

RLS on, 0 policies, excess anon/authenticated grants.

### RECOMMENDATION (applied)

Same REVOKE/GRANT pattern as prod (+ sequence revoke if present).

**Status after W1.5:** **RESOLVED**.

---

## app_config

### PRODUCTION

| Item | Value |
|------|-------|
| RLS | enabled |
| Policies | **0** |
| Grants | `postgres`, `service_role` only |

**Evidence:** `docs/supabase-migrations/security_audit_lockdown_2026_08_18.sql` (DROP public policies + REVOKE + GRANT service_role).

**Code paths:** staff/owner/bot ingest toggles via service_role; `app/api/admin/social/route.ts`, `lib/bots/ingest/botIngestPaused.ts`, etc.

### STAGING (before)

RLS on, 0 policies, excess anon/authenticated grants.

### RECOMMENDATION (applied)

Same REVOKE/GRANT; **no** client SELECT policy invented.

**Status after W1.5:** **RESOLVED**.

---

## Policies added

**None.** Adding client policies would diverge from production.

## Policies UNKNOWN (post-W1.5)

**None for these three tables.** “0 policies” is the evidenced production state, not an unknown gap.

## Remaining related gaps (non-blocking for W1.5 RLS)

| Gap | Notes |
|-----|-------|
| `offer_events` trigger on prod | Staging may lack `trg_after_event_insert` / metric function — document for later metrics parity; not RLS |
| Distribution tables | Out of scope |

## Production writes

**0** (inventory only).

## Staging writes (this phase)

Privilege REVOKE/GRANT on 3 tables (+ optional sequence) — no row DML.
