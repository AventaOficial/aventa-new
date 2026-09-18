# FOUNDATION BASELINE REVIEW

**Date:** 2026-09-17  
**File reviewed:** `docs/supabase-migrations/FOUNDATION_BASELINE_20260917.sql`  
**Against:** Gate 0.5 staging reconciliation evidence  
**SQL modified this gate:** **NO**

---

## Can it execute on staging as-is?

**No.**

The embedded preflight **correctly aborts** when:

1. `public.offers` is a VIEW  
2. `public.user_roles` is a VIEW  
3. `public.profiles` exists without `display_name`

All three conditions are **true on staging today**.

---

## Classification

| Option | Result |
|--------|--------|
| A. Execute as-is | **FAIL** (by design) |
| B. Requires preflight | **YES** — already present; still insufficient alone |
| C. Requires legacy reconciliation first | **YES** — rename views; profiles strategy |
| D. Split into waves | **YES** — recommended (see reconciliation forensics §9) |

---

## Strengths (keep)

- Production-derived column lists for foundation tables  
- Conflict guards (no silent IF NOT EXISTS over wrong shapes)  
- Excludes communities (bigint/uuid conflict)  
- Excludes money/supply/distribution  
- Idempotent policy DROP/CREATE pattern  
- Documented TODOs for triggers/grants  

---

## Gaps / required changes (document only — not applied)

1. **Profiles:** CREATE IF NOT EXISTS never fixes legacy shape; need separate reconcile SQL (future gate).  
2. **View rename steps** should be a **Wave 0.5/1 companion script**, not inside baseline silently.  
3. **`user_roles_effective`** depends on view `user_roles` — must be updated when view renamed.  
4. **Triggers/functions** incomplete vs prod (vote counters, `handle_new_user`).  
5. **Grants** for `offer_events` / `write_jobs_queue` service_role-only — TODO.  
6. After views renamed, baseline can create `offers`/`user_roles` tables; profiles still blocked until reconcile.

---

## Recommended apply order (future)

```text
0. Fix env → staging
1. Save DDL of offers + user_roles views + user_roles_effective
2. Rename views (no DROP of ofertas/profiles)
3. Profiles reconcile plan approved + applied
4. Run FOUNDATION_BASELINE (or wave-split equivalent)
5. Validate; then domain waves
```

**Do not apply until founder approval after env fix.**
