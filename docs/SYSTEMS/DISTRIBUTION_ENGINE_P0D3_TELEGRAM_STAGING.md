# DISTRIBUTION ENGINE P0-D3 — TELEGRAM STAGING PIPELINE

**Date:** 2026-09-17  
**Staging:** `oojshofrpbfwsiypcecr`  
**Production:** untouched (`mkgsrpsuvedwwlzmzmzh`)  
**Flag:** `DISTRIBUTION_ENGINE_ENABLED` = **OFF** (fail-closed)

---

## 1. Architecture

```text
approve (moderate-offer)
  → enqueueDistributionForApprovedOfferFireAndForget  [flag OFF → no-op]
  → distribution_publications (pending)

cron GET /api/cron/distribution-drain   [prepared; NOT in vercel.json]
  → drainDistributionPublications       [flag OFF → no-op]
  → atomic CAS claim (pending|retryable → publishing)
  → renderer → Telegram adapter (Bot API)
  → published | retryable | failed | cancelled
  → distribution_events (append-only)

CTA in message: https://{app}/r/d/{publicationId}
  → resolveDistributionHop
  → recordAttributedClick (existing) channel=telegram
  → 302 Location: offers.offer_url (DB only)
```

Core never imports Telegram HTTP. Adapter is resolved via `getDistributionProviderAdapter(provider)`.

---

## 2. Provider interface

`lib/distribution/providers/types.ts`

- `publish(input)` → success `{ externalMessageId }` or failure `{ retryable, code }`
- optional `health(credentialRef)`
- Providers: telegram | whatsapp | web (only telegram implemented)

---

## 3. Telegram adapter

`lib/distribution/providers/telegram/adapter.ts`

- Official `api.telegram.org` Bot API only (`sendMessage` / `sendPhoto`)
- Token from env named by `credential_ref` (UPPER_SNAKE) — **never** stored in DB
- Rejects credential_ref that looks like a raw token
- Classifies 429/5xx as retryable; 400 chat-not-found / 401/403 as permanent
- Injectable `fetchImpl` for tests
- Redacts tokens in error strings

---

## 4. Renderer

`lib/distribution/render/telegramMessage.ts` + `escape.ts`

- HTML parse mode with escaping
- Title, store, price/discount, CTA hop link
- Image only if `assertSafeHttpsUrl` passes; else text-only

---

## 5. CTA hop

`GET /r/d/[publicationId]` → `lib/distribution/hop.ts`

1. Rate limit  
2. Load publication  
3. Load offer  
4. Check live + not expired  
5. `assertSafeRedirectUrl(offer.offer_url)`  
6. `recordAttributedClick` with hints `{ channel:'telegram', campaign, utmSource:'telegram' }`  
7. 302 to DB `offer_url`  

**Not** an open redirect: client cannot supply destination URL.

---

## 6. Attribution

Reuses **only** `recordAttributedClick`. No parallel click tables. No second SoT.

---

## 7. Lifecycle

| From | To | When |
|------|----|------|
| pending | publishing | atomic claim |
| retryable | publishing | atomic claim |
| publishing | published | adapter success (+ message_id) |
| publishing | retryable | retryable error / missing creds |
| publishing | failed | permanent error or max attempts |
| publishing | cancelled | destination disabled / offer not live |

Never marks `published` without provider message_id (or prior stored `external_message_id` reuse).

---

## 8. Atomic claim

CAS update: `WHERE id=? AND status IN ('pending','retryable')` → `publishing`.  
Losing concurrent workers get null row. No SELECT-then-UPDATE without predicate.

---

## 9. Retry / backoff

Max attempts: **5**. Backoff minutes: 1, 5, 15, 60, 360.  
Timeout after Telegram success is mitigated by storing `external_message_id` before/at success and short-circuiting retries if already present.

**Provider limitation:** if Telegram accepts but HTTP times out before message_id is observed, a duplicate send is still possible on retry — document as inherent Bot API limitation; UNIQUE publication row prevents duplicate *logical* publications.

---

## 10. Idempotency

DB constraints unchanged:

- `UNIQUE(offer_id, destination_id, distribution_version)`
- `UNIQUE(idempotency_key)`

---

## 11. Events

Uses existing event_type CHECK values with `meta.phase`:

| Conceptual | DB event_type | meta |
|------------|---------------|------|
| enqueue | publication_created | (enqueue) |
| claim | publication_attempted | phase=claim |
| publish_attempt | publication_attempted | phase=publish_attempt |
| success | publication_published | |
| retry | publication_retryable | |
| failure / cancel | publication_failed | phase=cancel when cancelled |

---

## 12. Verified Telegram identity (staging)

| Field | Value |
|-------|-------|
| Bot | `@aventa_staging_bot` |
| Bot ID | `8719812962` |
| getMe | PASS |
| Channel title | `Aventa Staging` |
| chat_id | verified via `getUpdates` (redacted `-100…2597`) |
| Bot role | `administrator` (can post) |
| Token in logs/DB | **never** |

---

## 13. Destination (staging)

Seed: `STAGING_P0D3_DESTINATION_SEED_20260917.sql` → later updated with verified chat_id.

| Field | Value |
|-------|-------|
| brand | Aventa Staging (`aventa-staging`) |
| destination slug | `telegram-staging-test` |
| provider | telegram |
| kind | general |
| status | **active** (staging only) |
| credential_ref | `TELEGRAM_BOT_TOKEN_STAGING` (env **name**, not token) |
| external_destination_key | verified staging chat (redacted) |
| Production destinations | **absent** |

---

## 14. Cron

`app/api/cron/distribution-drain/route.ts`

- Auth: `requireCronSecret`
- Flag OFF → `{ skipped: 'flag_disabled' }`
- **Not** added to `vercel.json` (no Production schedule)

Staging CRON_SECRET / remote schedule: **not provisioned** — document only; do not invent.

---

## 15. Security

| Control | Status |
|---------|--------|
| SSRF (no server fetch of image for validation) | URL parse + private IP block |
| HTTPS for media | required |
| Open redirect | hop uses DB offer_url only + assertSafeRedirectUrl |
| Token not in DB | credential_ref = env name |
| Token not logged | redactTelegramSecrets |
| No public publish API | drain cron-secret only |
| Hop rate limit | enforceRateLimit |
| Disabled destination | enqueue ignores; drain cancels |
| Flag fail-closed | server-side enqueue + drain |

---

## 16. Tests

`tests/distribution/p0d3.telegramStaging.test.ts` + foundation contracts — **58** distribution+guard tests PASS (mocked Telegram; CI never hits real Bot API).

Coverage: chat verification helpers, destination safety, eligibility, enqueue, idempotency, CAS, retry, renderer, URL validation, `/r/d`, flag OFF, production guard.

Real Telegram: `scripts/staging-p0d3-dry-run.ts` only (manual staging).

---

## 17. Observability

`distribution_events` append-only with publication/offer/destination/attempt/status/timestamp + sanitized error codes. No token, service role, anon key, cookies, or unnecessary PII.

---

## 18. Production safety

| Item | Result |
|------|--------|
| Production writes | **0** |
| Production `distribution_*` | absent / null |
| Flag | OFF (`.env.local` + fail-closed) |
| vercel.json distribution cron | **not registered** |
| Money / Supply / Rewards / Moderation CAS | untouched |

---

## 19. Limitations

1. ~~Staging lacks `reward_outbound_clicks`~~ → **closed in P0-D3.1** (table mirrored; hop persists)  
2. WhatsApp adapter not implemented  
3. Drain not scheduled remotely on staging  
4. Ambiguous Telegram timeout may double-send at provider (row stays single)  
5. Event type CHECK has no dedicated `cancelled` — uses `publication_failed` + meta.phase  
6. Staging still lacks money/settlement tables (`creator_rewards`, ledger) — intentional  

---

## 20. Exact next step

**P0-D3.2 STOP on remote Vercel Cron:** current single project `aventa-new` only schedules Production (`aventaofertas.com`). Do **not** add `distribution-drain` to `vercel.json`.

**Recommended:** provision dedicated Vercel project `aventa-staging` with staging env + distinct `CRON_SECRET`, then register drain cron there.

Until then: automated soak = `npx tsx scripts/staging-p0d3-2-soak.ts` (in-process, staging-only). Handler aborts on production Supabase / `VERCEL_ENV=production`.

See `P0D3_2_VERCEL_CRON_FORENSICS.md`.

---

## Definition of Done

- [x] staging verified  
- [x] provider interface  
- [x] Telegram adapter  
- [x] renderer  
- [x] `/r/d/{publicationId}`  
- [x] atomic claim  
- [x] lifecycle / retry / idempotency / concurrency  
- [x] events / observability (minimal)  
- [x] staging destination **active** + verified chat  
- [x] real Telegram delivery (staging)  
- [x] cron handler prepared (not Production)  
- [x] flag returned OFF  
- [x] SSRF/open redirect protections  
- [x] attribution contract reused (persist gap on staging)  
- [x] money/Supply untouched  
- [x] production writes = 0  
- [x] tests / tsc / ci:verify  
- [x] documentation  
- [x] hop click persistence on staging (P0-D3.1)
