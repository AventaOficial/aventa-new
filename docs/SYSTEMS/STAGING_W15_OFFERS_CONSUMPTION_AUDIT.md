# STAGING W1.5 — OFFERS CONSUMPTION AUDIT

**Date:** 2026-09-17  
**Staging:** `oojshofrpbfwsiypcecr` — `offers` table n=0; `ofertas` legacy n=5  
**Scope:** `app/`, `lib/`, `tests/`, `scripts/` (runtime `.from(...)` / SQL)

---

## Summary counts

| Classification | Relations | Runtime significance |
|----------------|-----------|----------------------|
| **CANONICAL** | `offers`, `offer_votes`, `offer_events`, `moderation_logs` | Primary app path (~70+ files) |
| **BRIDGE** | `ofertas_ranked_general` (view → `public.offers`) | Feed / browse / ranking (~12 call-sites) |
| **LEGACY** | `ofertas`, `votos`, `moderation_log`, `offers_legacy_compat_v` | **0** `.from(...)` in `app/` / `lib/` |
| **TEST** | mocks of canonical tables | contracts / vitest |
| **DEAD CODE** | realtime `offers` with flag off | `useOffersRealtime` |
| **UNKNOWN** | none for product paths | inventory scripts only |

---

## Verdict

The live application uses **canonical `offers` exclusively** for create, detail, moderation, votes, tracking, cron, and admin.

Feed/browse uses bridge view `ofertas_ranked_general`, defined as `SELECT … FROM public.offers` (not `ofertas`).

**The 5 legacy rows in `ofertas` are invisible to the product.**

---

## Key surfaces

| Surface | Relation | Class | Client |
|---------|----------|-------|--------|
| Home feed / ranking | `ofertas_ranked_general` | BRIDGE | mostly service_role; home search may use anon |
| Detail `/oferta/[id]` | `offers` | CANONICAL | service_role |
| Create `POST /api/offers` | `offers` insert | CANONICAL | service_role |
| Voting `/api/votes` | `offer_votes` + `offers` | CANONICAL | service_role |
| Tracking outbound | `offer_events` via write queue | CANONICAL | service_role |
| Moderation | `offers` + `moderation_logs` | CANONICAL | service_role |
| Comments | `comments` (+ offer guard on `offers`) | CANONICAL | service_role |
| Cron digests | `offers` | CANONICAL | service_role |
| Admin UI panels | `offers` | CANONICAL | browser anon/auth (RLS) |
| Legacy Spanish tables | `ofertas` / `votos` / `moderation_log` | LEGACY | unused by runtime |

---

## Smoke implications (offers = 0)

| Surface | Without synthetic seed |
|---------|------------------------|
| Feed | Empty list (healthy empty) |
| Detail | 404 |
| Create | Works → writes into `offers` |
| Moderation queue | 0 pending |
| Vote / comments / CTA | Need a UUID offer id |
| Legacy `ofertas` | Does not appear in product UI |

---

## Code change in W1.5

**None required** for smoke (canonical path already correct). No cutover of legacy.
