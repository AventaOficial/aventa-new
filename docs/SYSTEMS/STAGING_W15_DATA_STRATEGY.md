# STAGING W1.5 — DATA STRATEGY

**Date:** 2026-09-17  
**Target:** `oojshofrpbfwsiypcecr` only  
**Forbidden:** copy production rows, copy PII, invent metrics from prod

---

## What exists today

| Relation | Rows | Notes |
|----------|-----:|-------|
| `auth.users` / `profiles` | 1 | staging admin (`display_name` mapped) |
| `user_roles` | 1 | admin seed from W1 |
| `offers` (canonical) | 0 | empty by design (W1) |
| `ofertas` (legacy) | 5 | demo; **not** used by app |
| `offer_votes` / `offer_events` / `comments` | 0 | empty |
| `communities` | 0 | bigint PK; deferred |

---

## What is missing for product smoke

| Surface | Needs |
|---------|-------|
| Feed / ranking | ≥1 `offers` with `status='approved'`, required cols |
| Detail | same UUID |
| Voting | approved offer + authenticated/service path |
| Moderation | optional `status='pending'` offer |
| Comments | approved offer |
| CTA / track | offer with `offer_url` = staging-safe mock URL |
| Admin | existing admin profile sufficient |

---

## What may be generated (synthetic)

- 1–3 rows in `public.offers` with:
  - fixed UUIDs prefixed / tagged in title `[STAGING_W15_SEED]`
  - placeholder image URL (non-retailer CDN placeholder)
  - `offer_url` = `https://example.com/aventa-staging-safe` (no real retailer traffic)
  - `created_by` = existing staging profile id
  - no real emails, phones, addresses
- Optional: 1 pending offer for moderation queue
- Optional: 1 vote / 1 comment / 1 view event for path coverage

## What must NOT be copied

- Production `offers` / `offer_events` / profiles / commissions / payouts
- Any PII beyond the single existing staging user already present
- Attribution / settlement / rewards ledgers

---

## Seed artifact

`docs/supabase-migrations/STAGING_W15_SYNTHETIC_SEED_20260917.sql`

Marked **STAGING ONLY**. Idempotent via fixed UUIDs + `ON CONFLICT DO NOTHING` / delete-by-tag rollback.

### Rollback

```sql
DELETE FROM public.offer_events WHERE offer_id IN (
  SELECT id FROM public.offers WHERE title LIKE '[STAGING_W15_SEED]%'
);
DELETE FROM public.offer_votes WHERE offer_id IN (
  SELECT id FROM public.offers WHERE title LIKE '[STAGING_W15_SEED]%'
);
DELETE FROM public.comments WHERE offer_id IN (
  SELECT id FROM public.offers WHERE title LIKE '[STAGING_W15_SEED]%'
);
DELETE FROM public.offers WHERE title LIKE '[STAGING_W15_SEED]%';
```

Legacy `ofertas` rows are **not** touched.

---

## Decision

| Question | Answer |
|----------|--------|
| Need synthetic seed for useful smoke? | **Yes** |
| Ambiguity blocking seed? | **No** — schema columns known; no prod mapping |
| Execute in W1.5? | **Yes** — minimal 2 offers (1 approved, 1 pending) + optional comment |

---

## communities

Out of W1.5 migration. No runtime `.from('communities')` in `app/`/`lib/` — does **not** block login, feed, offers, moderation, or distribution foundation readiness docs.
