# Distribution C3 — UNKNOWN_OUTCOME + publishing lease

## Status

**IMPLEMENTED** (code + staging migration). Engine flag remains **OFF**. No Telegram live. No production apply.

## Problem

Between `claim → external publish → persist success`, crashes/timeouts can leave Aventa unable to know whether the provider accepted the message. Treating that as `failed`/`retryable` risks duplicates.

## State machine

```
pending|retryable → publishing → published
publishing → unknown_outcome   (ambiguous side effect)
unknown_outcome → retryable    (operator-only: releaseUnknownOutcomeToRetryable)
publishing → retryable         (reclaim: lease expired, no side-effect evidence)
publishing → published         (reclaim: external_message_id already present)
```

## Lease

While `status=publishing`, lease ownership version = `updated_at` at claim.
- owner / acquired / expires / attempt / idempotency_key recorded on `lease_acquired` event
- TTL: `DISTRIBUTION_PUBLISHING_LEASE_MS` (5m)
- expiry ≠ failed

## Reclaim

`reclaimStuckPublishingPublications` — CAS on `(status=publishing AND updated_at=leaseStamp)`.
Never calls providers. Not invoked from drain.

## Recovery

`releaseUnknownOutcomeToRetryable` — explicit ops only. Never from drain.

## Migration

`docs/supabase-migrations/20260918_distribution_c3_unknown_outcome.sql`
- Apply **staging only** (`oojshofrpbfwsiypcecr`)
- Adds `unknown_outcome` status + C3 event types + publishing lease index
