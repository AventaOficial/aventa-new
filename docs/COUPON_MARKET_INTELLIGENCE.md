# Coupon Market Intelligence

The public card is a view. The record is `coupons` + `coupon_events` + `coupon_links` + `coupon_interactions`.

## Lifecycle

Identity is `store|code`. A change of percent, amount, minimum, expiry, scope or restriction writes `field_changed` with `before` and `after`. It does not create another coupon. Two different values on the same day keep two events.

States: `discovered`, `reseen`, `field_changed`, `verified`, `invalidated`, `expired`.

A link is `exists`, `eligible`, or `verified_for_offer`. A paste can reach `eligible`. Only a moderator action, with the moderator user id taken from the server session, may set `verified_for_offer`. The public card requires that state plus a fresh verification.

## Evidence

`coupon_events.diff` stores the field change. `actor_id` and `actor_role` are internal audit. Public reads do not return them.

Copy, view and outbound are different rows. The same correlation id within 30 minutes on the same offer is `correlated`. Anything else is `ambiguous` or `unknown`. A click does not become a conversion.

## Effective price

Computed only when mechanic, currency, minimum and scope are known. Otherwise `effectivePrice` is null and `reason` says why. Price signals (`couponBelowMedian`, `couponNearHistoricalLow`) stay `publishes: false` and `appliedToFeed: false`.

## Security

RLS is enabled. `anon` and `authenticated` have no grants. The service role writes. A public client cannot set `verified` or `verified_for_offer`.

## Limitations

Redirects are not fetched. An unparseable URL stays original and `urlUncertain`. Network conversion is `not_connected`. Ranking does not sort the live feed. Money, rewards, commissions, settlement, mint and distribution stay off.

## Staging

Apply, in order, on staging (`oojshofrpbfwsiypcecr`), then production (`mkgsrpsuvedwwlzmzmzh`):

1. `docs/supabase-migrations/20260923_coupon_intelligence.sql`
2. `docs/supabase-migrations/20260924_coupon_evidence.sql`
3. `docs/supabase-migrations/20260925_coupon_audit.sql`

None of these files delete rows. This worktree has no staging credentials, so these files are not applied here.

Partition `coupon_events` when that table passes 1,000,000 rows. Do not partition before that.

Operational steps: `docs/COUPON_INTELLIGENCE_RUNBOOK.md`.
