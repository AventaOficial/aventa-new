# Coupon intelligence runbook

## Deploy

1. Confirm the database host is staging `oojshofrpbfwsiypcecr` before production `mkgsrpsuvedwwlzmzmzh`.
2. Run `20260923_coupon_intelligence.sql`.
3. Confirm `coupons`, `coupon_events`, `coupon_links` exist and RLS is on.
4. Run `20260924_coupon_evidence.sql`.
5. Confirm `coupon_links.eligibility` and `coupon_interactions`.
6. Run `20260925_coupon_audit.sql`.
7. Confirm `coupon_events.actor_id` and `coupon_events.diff`.

Stop if a step fails. Do not run the next file.

## Validate

Paste a block with store, code and discount in the moderation batch and press **Revisar pegado**. Save does not verify. Repeat the same paste: one coupon, a `reseen` event.

Change the percent and save again. The canonical key stays `store|code`. A `field_changed` row shows `discountValue:20→15`.

## Verify

`POST /api/admin/coupons` with `{ action: "verify", canonicalKey, offerId }` as a moderator. The server stores `auth.user.id`. The body cannot set the actor. The offer link becomes `verified_for_offer`. The public card shows the coupon only while that verification is fresh.

## Invalidate

`{ action: "invalidate", canonicalKey }`. The card disappears. Events stay.

## Investigate

`GET /api/admin/coupons?canonicalKey=` returns the coupon, the last 80 events and up to 40 links. Click the code on `/admin/coupons` for the same view.

## Rollback

Do not drop the tables if they hold observations. To stop the feature, leave the tables and do not call verify. The public route already returns an empty list when the schema is missing. There is no money row to reverse.
