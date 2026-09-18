# Distribution Engine — Architecture (P0-D1 Foundation)

**Status:** Implemented foundation (flag **OFF** by default).  
**Providers:** none active (Telegram/WhatsApp deferred).  
**Related audit:** `docs/SYSTEMS/AUDIT_distribution_engine_p0_forensic.md`

---

## Purpose

Post-approval fan-out layer so **one** Aventa offer can have **many** external publications (channels/brands) without cloning offers or bypassing moderation.

```
approved + live offer
  → routing (config)
  → distribution_publications (pending)
  → (future) provider adapter
  → external channel
```

---

## Domain boundary

| May | Must not |
|-----|----------|
| Create `distribution_*` rows when flag ON | Approve / reject offers |
| Route to destination candidates | Call Telegram/WhatsApp APIs (P0-D1) |
| Observe publication state | Write ledger / rewards / payouts / conversions |
| | Modify Supply WRITE / DQE / Verifier |
| | Modify `recordAttributedClick` / click semantics |
| | Reuse DI `publicationAllowed` / `autoPublish` / `autoApprove` |

**Invariant:** `pending ≠ approved ≠ distributed`.

Distribution **consumes** server-authoritative live offers via `isOfferTrackable` (`approved|published` ∧ not expired). It never sets `offers.status`.

---

## Feature flag

```
DISTRIBUTION_ENGINE_ENABLED=false   # default when unset
```

Helper: `isDistributionEngineEnabled()` in `lib/distribution/constants.ts`.

**Meaning:** engine may create/process distribution publications for already-approved live offers.

**Production:** remain disabled until explicitly enabled after destinations are seeded and a provider adapter exists.

Independent from Deal Intelligence `publicationAllowed` / `autoPublish`.

---

## Entities

### `distribution_brands`
Multi-brand umbrella. `Brand → N destinations`.

### `distribution_destinations`
External surface: `provider` (`telegram|whatsapp|web`), `external_destination_key` (opaque chat/channel id), `credential_ref` (secret **name** only), `kind` (`general|category|coupons`), `category_ids`, `status`.

Telegram-specific tokens **never** stored in DB.

### `distribution_publications`
Work item: `offer_id` + `destination_id` + `distribution_version`.  
One offer → many publications. **Never** clones `offers`.

### `distribution_events`
Append-only lifecycle observability (`publication_created`, …).  
**Not** `offer_events`. **Not** attribution. No fake views/clicks/conversions.

---

## State machine

```
pending → publishing → published
pending → publishing → retryable → publishing → …
                  ↘ failed
any non-terminal → cancelled (ops)
```

P0-D1 only **creates** `pending` (+ `publication_created` event). No drain/adapter yet.

---

## Routing

`resolveEligibleDestinations({ offer, destinations })`:

- `kind=general` → all distributable offers  
- `kind=category` → when normalized `offer.category` ∈ `category_ids`  
- `kind=coupons` → when `coupons` or `bank_coupon` present  

Only `status=active` destinations. **Does not publish.**

Destinations are **not** auto-seeded in migration (safe empty until ops inserts rows).

Conceptual once seeded: technology → general+tech; home → general+home; coupons → general+coupons.

---

## Idempotency

DB authoritative:

```
UNIQUE (offer_id, destination_id, distribution_version)
UNIQUE (idempotency_key)  -- offer_id:destination_id:v{N}
```

App treats `23505` as reuse (safe under cron/serverless/concurrent approve).

---

## Enqueue model

**Not** `write_jobs_queue`: that queue only processes `offer_event` and would mark unknown job types failed.

**SoT outbox:** `distribution_publications` rows with `status=pending`.

Hook: after successful `pending→approved` in `moderate-offer`, fire-and-forget  
`enqueueDistributionForApprovedOfferFireAndForget` (no provider I/O; fail-soft).

---

## Approval / expiration boundaries

- Approval remains solely in moderation CAS.  
- Expiration: existing `expires_at` via `isOfferTrackable` / snapshot check — **no second clock**.

---

## Security

- RLS enabled; writes **service_role** only.  
- Staff SELECT via role policy; no authenticated INSERT/UPDATE/DELETE.  
- No public API to create publications.  
- No client-controlled destination/offer for privileged create.  
- Destination config is trusted server data.  
- `credential_ref` = env name only.

---

## Attribution boundary

P0-D1 stores `tracking_campaign_key` + publication ids for a **future** hop.  
Does **not** modify `recordAttributedClick`, `reward_outbound_clicks`, or click_id semantics.  
Helper `buildDistributionTrackingContext` is metadata only.  
**No second click path.**

---

## Economy boundary

```
publication ≠ conversion
(future) distribution click ≠ conversion
(future) distribution click ≠ commission
settlement / rewards / payouts / ledger = untouched
```

---

## Supply boundary

No Supply WRITE, DQE, or Verifier changes. Distribution does not read/write Supply run tables.

---

## Future provider abstraction

`provider` column + destination row → adapter interface (next phase).  
Core domain has zero Telegram Bot API calls.

---

## Current non-goals

- Telegram bot / API / tokens / webhooks / renderer  
- WhatsApp  
- Drain cron / claim `publishing`  
- Tracking hop `/r/d/...`  
- Enabling flag in production  
- Money / Supply / attribution changes  
- Auto-seed destinations  

---

## Key paths

| Piece | Path |
|-------|------|
| Migration | `docs/supabase-migrations/20260917_distribution_engine_foundation.sql` |
| Lib | `lib/distribution/*` |
| Approve hook | `app/api/admin/moderate-offer/route.ts` |
| Tests | `tests/distribution/foundation.contract.test.ts` |
