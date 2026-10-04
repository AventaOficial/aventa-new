# Recovery plan — offers auto-expired by the legacy health scanner

Status: **PLAN ONLY. Nothing has been restored or modified.** Production data was read with
read-only queries on 2026-10-04.

## What happened

The legacy health scanner treated parser failures (`missing_discount_price`, `missing_title`) as
`out_of_stock`. After two consecutive "out of stock" readings it set `offers.expires_at = now()`.
The fixed classifier (commit `4b1365d`) only treats a confirmed 404/410 as gone, so none of these
offers would be expired today.

## Population (production, read-only)

| Fact | Value |
|---|---|
| Offers with `auto_expire_streak` diagnostic, `status = approved`, not deleted | **69** |
| Diagnostic `missing_discount_price` / `missing_title` | 58 / 11 |
| Confirmed 404/410 among them | 0 |
| Store | Mercado Libre (69) |
| Created | 2026-09-08 … 2026-09-20 (14–26 days old) |
| Expired | 2026-09-10 … 2026-09-27 |
| Deleted / without image / reported | 0 / 0 / 0 |
| Newer offer with the same `offer_url` | 4 |
| Live duplicate with the same `offer_url` | 0 |

## Classification (precedence top to bottom)

| Bucket | Rule | Count |
|---|---|---|
| DO_NOT_RESTORE | confirmed 404/410, or a newer offer with the same URL exists, or any report | **4** |
| STALE | older than 21 days | 0 |
| UNKNOWN | no usable URL | 0 |
| SAFE_TO_REVIEW | everything else | **65** |
| RESTORABLE | SAFE_TO_REVIEW **and** a fresh scan with the fixed classifier returns `available` with price within tolerance | 0 (no fresh scan yet) |

The 4 DO_NOT_RESTORE offers stay expired: restoring them would duplicate a newer publication.

## Proposed recovery (requires explicit owner approval; not part of launch)

1. After code deploy, re-scan the 65 SAFE_TO_REVIEW offers with the fixed classifier
   (read-only against the store; no offer writes).
2. Offers that come back `available` with the price within tolerance move to RESTORABLE.
   Everything else stays expired.
3. Restoration never publishes directly. RESTORABLE offers go back through moderation as
   `pending` with an audit row (`moderation_logs`, `reason = recovery_false_expiry`), so a human
   approves the current price.
4. Every change is a versioned, idempotent migration or an audited admin action listing the exact
   offer ids. No bulk UPDATE without an id list.

## Interaction with lifecycle v2

Lifecycle v2 archives expired offers 30 days after `expires_at` (`expired_retention`). These offers
would start being archived around 2026-10-10 and finish around 2026-10-27. Archival is
non-destructive and reversible (any `status`/`expires_at` change clears it through
`trg_offers_archive_guard`), so it does not block recovery. Do not pause the lifecycle for this.

## Not done, on purpose

- No offer was restored, re-dated, re-published or edited.
- Historical health diagnostics were not rewritten.
