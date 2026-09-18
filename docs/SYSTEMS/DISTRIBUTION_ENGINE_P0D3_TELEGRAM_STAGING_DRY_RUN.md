# DISTRIBUTION ENGINE P0-D3 — TELEGRAM STAGING DRY RUN

**Date:** 2026-09-17  
**Status:** **COMPLETE (with one staging attribution-table gap)**  
**Staging:** `oojshofrpbfwsiypcecr`  
**Production writes:** **0**

---

## 1. Environment — PASS

| Check | Result |
|-------|--------|
| TARGET | STAGING |
| PROJECT_REF | `oojshofrpbfwsiypcecr` |
| PRODUCTION_REF | `mkgsrpsuvedwwlzmzmzh` |
| `AVENTA_SUPABASE_TARGET` | `staging` |
| `DISTRIBUTION_ENGINE_ENABLED` (.env.local) | unset / **false** |
| Dry-run flag | temporary **in-process** `true` only |

---

## 2. Supabase target — PASS

All remote writes via staging project only. MCP/SQL and service client URL ref = staging.

---

## 3. Bot verification — PASS

| Field | Value |
|-------|-------|
| getMe | PASS |
| bot_id | `8719812962` |
| username | `aventa_staging_bot` |
| Token logged | **never** |

---

## 4. Channel verification — PASS

| Field | Value |
|-------|-------|
| Discovery | `getUpdates` → `my_chat_member` |
| Title | `Aventa Staging` |
| Type | `channel` |
| chat_id (redacted) | `-100…2597` |
| Bot role | `administrator` |

---

## 5. Destination configuration — PASS

| Field | Value |
|-------|-------|
| slug | `telegram-staging-test` |
| status | **active** |
| kind | `general` |
| credential_ref | `TELEGRAM_BOT_TOKEN_STAGING` (name only) |
| external_destination_key | staging chat (redacted) |
| Production destinations | **absent** |

---

## 6. Feature flag — PASS

- Flag OFF: enqueue/drain skip — PASS  
- Temporary in-memory ON for dry-run — PASS  
- `.env.local` left OFF — PASS  
- Vercel Production untouched — PASS  

---

## 7. Synthetic offer — PASS

Offers titled `[STAGING_DISTRIBUTION_TEST]…` created only on staging.

Primary: `d3333333-3333-4333-8333-333333333301` → publication `4ac0e7f7-59a5-4d50-acd2-bbd63b179f0a`

---

## 8. Publication lifecycle — PASS

`pending` → claim → `publishing` → Telegram → `published`

---

## 9. Telegram delivery — PASS

| Field | Value |
|-------|-------|
| First dry-run message_id | **3** |
| Retry-path message_id | **4** |
| Channel | Aventa Staging |
| CTA | `/r/d/{publicationId}` |

---

## 10. Idempotency — PASS

Unit: `(offer_id, destination_id, distribution_version)` + `idempotency_key`  
Second enqueue: **reused=1**  
Second drain: **claimed=0**, same `external_message_id`

---

## 11. Concurrency — PASS

Dual `claimNextDistributionPublications`: **exactly 1** CAS win for target pub.

---

## 12. Retry — PASS

Simulated 429 adapter → `retryable` + `next_attempt_at` + `telegram_rate_limited`  
Then real Telegram → `published` (message_id 4)

---

## 13. Expiration — PASS

Expired approved offer → enqueue `skipped: not_distributable`

---

## 14. CTA /r/d — PASS (redirect + persistence after P0-D3.1)

| Check | Result |
|-------|--------|
| Hop resolves | PASS |
| Redirect host | `www.amazon.com.mx` (from DB `offer_url`) |
| Invalid UUID rejected | PASS |
| Open redirect | blocked by URL guards |
| `recordAttributedClick` contract called | YES |
| Persisted `click_id` | **PASS** after P0-D3.1 — `reward_outbound_clicks` on staging |

See `P0D3_1_REWARD_OUTBOUND_CLICK_*.md` + `scripts/staging-p0d3-1-attribution-smoke.ts`.

---

## 15. Security — PASS

SSRF/open-redirect samples rejected (javascript, loopback, metadata IP).  
Anon insert into `distribution_publications` rejected.  
Token not in DB (`credential_ref` name only).

---

## 16. Cron — PASS (handler) / NOT RUN (remote schedule)

`GET /api/cron/distribution-drain` exists + `requireCronSecret`.  
**Not** in `vercel.json`. Staging CRON_SECRET / schedule: future.

---

## 17. Observability — PASS (minimal)

Events: `publication_created`, `publication_attempted` (claim + publish), `publication_published`.  
Errors sanitized codes; no token in events.

---

## 18. DB verification — PASS

| Publication | Status | message_id |
|-------------|--------|------------|
| dry-run primary | published | 3 |
| concurrency test | cancelled | — |
| retry test | published | 4 |

---

## 19. Tests — PASS

| Suite | Result |
|-------|--------|
| `tsc --noEmit` | PASS |
| distribution + projectRefs | **58 PASS** |
| `ci:verify` | PASS (~1663+) |
| staging smoke | PASS |

---

## 20. Production safety — PASS

| Check | Result |
|-------|--------|
| Production writes | **0** |
| Production `distribution_*` | **null / absent** |
| Production offers_n (read) | 826 |

---

## 21. Cleanup — NOT RUN (intentional)

Synthetic `[STAGING_DISTRIBUTION_TEST]` rows left for audit evidence. Safe to delete later by title/id prefix.

---

## 22. Remaining blockers

1. **`reward_outbound_clicks` missing on staging** → hop redirect works; click_id not persisted  
2. Staging CRON_SECRET / vercel staging schedule for drain — not provisioned  
3. Flag remains OFF (correct)

---

## 23. Exact next step

**P0-D3.1 (staging):** migrate/create `reward_outbound_clicks` (or confirmed staging rewards schema) so `/r/d` can persist via existing `recordAttributedClick` — still no second attribution system.  
Then optional: schedule `distribution-drain` on **staging** only with distinct `CRON_SECRET`.  
**Do not** enable production Distribution / WhatsApp / money.

---

## Script

`npx tsx scripts/staging-p0d3-dry-run.ts` — local staging dry-run (never prints token).
