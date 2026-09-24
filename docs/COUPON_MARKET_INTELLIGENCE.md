# Coupon Market Intelligence

The public card is a view. The record is `coupons` + `coupon_events` + `coupon_links` + `coupon_interactions`.

Identity is `store|code`. A change of percent, amount, minimum, expiry, scope or restriction writes `field_changed`. It does not create another coupon.

A link is `exists`, `eligible`, or `verified_for_offer`. A paste can reach `eligible`. Only a moderator action may set `verified_for_offer`. The public card requires that state plus a fresh verification.

Copy, view and outbound are different rows. The same correlation id within 30 minutes on the same offer is `correlated`. Anything else is `ambiguous` or `unknown`. A click does not become a conversion.

Price memory stays in its own tables. `couponPriceContext` only reads a summary. A signal does not publish, mint, or pay.

`COUPON_INTELLIGENCE_MODE` stays `shadow`. `appliedToFeed` stays false.

Apply `20260923_coupon_intelligence.sql`, then `20260924_coupon_evidence.sql`, on staging before production. Neither file deletes rows.

Partition `coupon_events` when that table passes 1,000,000 rows. Do not partition before that.
