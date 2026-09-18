# P0-D3.1 — REWARD OUTBOUND CLICK FORENSICS (READ-ONLY)

**Date:** 2026-09-17  
**Staging:** `oojshofrpbfwsiypcecr`  
**Production:** `mkgsrpsuvedwwlzmzmzh` (READ-ONLY probes only)  
**Writes this phase:** **0**

---

## 1. Canonical function

| Item | Evidence |
|------|----------|
| Path | `lib/attribution/recordAttributedClick.ts` |
| Export | `recordAttributedClick(supabase, input) → Promise<AttributedClickRecord \| null>` |
| Re-export | `lib/attribution/index.ts` |
| Money writes | **none** |
| Fail-soft if table missing | `isMissingClickTable` → returns `null` (explains P0-D3 hop `clickId=null`) |

### Signature (input)

```ts
{
  offerId: string;
  clickerUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  hints?: ClientAttributionHints; // channel/campaign/utm/referer — allowlisted only
  nowMs?: number;
}
```

### Behavior

1. Load `offers.offer_url` / `original_offer_url` / `store` by `offerId` (DB SoT; never client URL).
2. Build destination pair via `buildDestinationPair`.
3. Resolve server attribution context from hints (`resolveServerAttributionContext`).
4. Build `idempotency_key` = SHA256 slice of `outbound:{offerId}:{actorKey}:{10minBucket}` (`ATTRIBUTION_CLICK_IDEMPOTENCY_WINDOW_MS = 10 * 60 * 1000`).
5. Lookup existing row by `idempotency_key` → reuse (hints ignored on reuse).
6. Insert full row into `reward_outbound_clicks`; legacy fallback if attribution columns missing.
7. On UNIQUE race → re-read by `idempotency_key`.

**No `publication_id` column** in the model. Distribution hop stores `click_id` only in `distribution_events.meta`.

---

## 2. Callers

| Caller | Role |
|--------|------|
| `app/api/track-outbound/route.ts` | Product outbound CTA dual-write path |
| `lib/distribution/hop.ts` → `app/r/d/[publicationId]/route.ts` | Distribution Telegram CTA hop |
| Tests / mocks | `tests/attribution/*`, `tests/distribution/p0d3.*`, economy tests |

---

## 3. Canonical table

**`public.reward_outbound_clicks`**

Declared SoT in: `docs/SYSTEMS/SYSTEM_attribution.md`, economy audits, CEO Attribution Truth (`OUTBOUND_ATTRIBUTION_SOT`).

### Repo migrations (canonical)

| File | Role |
|------|------|
| `docs/supabase-migrations/20260830_rewards_v1.sql` | CREATE TABLE base + RLS + indexes |
| `docs/supabase-migrations/20260916_attribution_foundation_clicks.sql` | Additive attribution columns + idempotency UNIQUE partial |

**Out of scope for P0-D3.1** (same rewards_v1 file but money/settlement): `creator_rewards`, `reward_payouts`, `affiliate_ledger_entries` click FK, profile reward columns.

---

## 4. Production schema (READ-ONLY 2026-09-17)

Table **exists**. Row count observed: **11** (not copied).

### Columns (exact)

| column | type | null | default |
|--------|------|------|---------|
| id | uuid | NO | gen_random_uuid() |
| offer_id | uuid | NO | — |
| network | text | NO | — |
| product_fingerprint | text | YES | — |
| clicker_user_id | uuid | YES | — |
| ip_hash | text | YES | — |
| user_agent_hash | text | YES | — |
| created_at | timestamptz | NO | now() |
| channel | text | YES | — |
| campaign_key | text | YES | — |
| destination_url | text | YES | — |
| original_destination_url | text | YES | — |
| idempotency_key | text | YES | — |
| attribution_meta | jsonb | YES | — |

### Constraints

- PK: `reward_outbound_clicks_pkey (id)`
- FK: `offer_id → offers(id) ON DELETE CASCADE`
- CHECK: `network IN ('amazon','mercadolibre','aliexpress','temu','walmart','shein','other')`
- **No FK** on `clicker_user_id` (uuid nullable only)
- **No `publication_id`**

### Indexes

- `reward_outbound_clicks_pkey`
- `idx_reward_outbound_clicks_offer_created (offer_id, created_at DESC)`
- `idx_reward_outbound_clicks_product_created` (partial)
- `idx_reward_outbound_clicks_idempotency` **UNIQUE partial** on `idempotency_key`
- `idx_reward_outbound_clicks_channel_created` (partial)
- `idx_reward_outbound_clicks_campaign_created` (partial)

### RLS / grants

- RLS **enabled**, `force_rls=false`
- **0 policies** (intentional — service_role path)
- Grants: `service_role` ALL; `postgres` ALL; **no** `anon` / `authenticated` grants

### Triggers / functions

None attached to this table in the canonical migrations.

---

## 5. Staging state

| Object | Staging (pre P0-D3.1) | Staging (post apply) |
|--------|----------------------|----------------------|
| `reward_outbound_clicks` | **MISSING** | **PRESENT** — mirrored from prod |
| columns | — | 14 cols match prod |
| RLS / 0 policies / service_role grants | — | match prod |
| `offers` | present | present |
| `profiles` | present | present |
| `affiliate_ledger_entries` | missing | missing (intentional — out of scope) |
| `creator_rewards` | missing | missing (intentional) |
| legacy `ofertas` | present (staging marker) | present |

Apply method: `supabase db query --linked --project-ref oojshofrpbfwsiypcecr --file STAGING_P0D3_1_…sql`  
(explicit staging ref; never bare `--linked` alone which defaults to production link).

---

## 6. Relations

| Relation | How |
|----------|-----|
| offers | FK `offer_id` CASCADE; hop/track load URL from offers |
| profiles/users | `clicker_user_id` optional uuid — **no FK** |
| attribution context | `channel`, `campaign_key`, `destination_*`, `attribution_meta`, `idempotency_key` |
| distribution | hop calls `recordAttributedClick`; `click_id` in `distribution_events.meta` only — **not** a column on clicks |

---

## 7. Idempotency contract (important for tests)

- Unit: `(offerId, actorKey, 10-minute time bucket)` → `idempotency_key`
- Actor: `u:{userId}` else `ip:{ipHash}` else `anon`
- Same logical actor + offer within window → **one row** (reuse)
- Different IP/user or different window → **new row allowed**
- Do **not** assume two bare HTTP requests without stable IP always collapse to one row

---

## 8. Diff summary

| Layer | Status |
|-------|--------|
| Code + prod schema | Aligned (foundation columns live on prod) |
| Staging table | **Gap** — missing entirely |
| Speculative schema | **Not needed** — prod is source of truth |

---

## 9. Phase 1 conclusion

Enough evidence to proceed to **Decision A**: mirror production `reward_outbound_clicks` (+ foundation columns/indexes/RLS) onto staging only. No invented columns. No money tables.
