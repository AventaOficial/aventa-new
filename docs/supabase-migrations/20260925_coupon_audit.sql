-- Audit columns for coupon history. Additive. Apply after 20260924_coupon_evidence.sql.
-- actor_id is an internal user uuid. Do not expose it on public reads.
-- MANUAL VERIFICATION. Staging, then production. Does not delete rows.

ALTER TABLE public.coupon_events
  ADD COLUMN IF NOT EXISTS actor_id uuid;

ALTER TABLE public.coupon_events
  ADD COLUMN IF NOT EXISTS diff jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.coupon_events.actor_id IS
  'Moderator user id for internal audit. Not a public profile and not an email.';
