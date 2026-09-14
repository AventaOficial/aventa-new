-- P0 ML Canonical URL Integrity — DATA REPAIR PLAN (DO NOT APPLY YET)
-- Generated 2026-09-14. Repair only deterministically recoverable rows.
--
-- BEFORE APPLYING:
-- 1. Code fix for buildCanonicalUrl / resolveAndNormalize must be in production.
-- 2. Confirm no remaining writers invent bare-ID URLs.
-- 3. Review counts from classification query below.
--
-- CLASSIFICATION (run read-only):
--   VALID: offer_url with /p/ML… or articulo…/MLM-…
--   RECOVERABLE_FROM_ORIGINAL: bare offer_url + original_offer_url navigable
--   UNKNOWN: bare without recoverable original (needs API permalink later — NOT in this migration)
--
-- THIS MIGRATION WOULD:
--   UPDATE offers
--   SET offer_url = <apply affiliate tags to original_offer_url>
--   WHERE bare offer_url AND original navigable
--   WITHOUT changing: status, created_at, expires_at, votes, author, original_offer_url, money
--
-- DO NOT execute from agent until product owner approves.
-- Affiliate tag application must happen in app code (env-dependent), not pure SQL.
-- Preferred approach: admin script/RPC that calls resolveAndNormalizeAffiliateOfferUrl(original_offer_url)
-- only when isMercadoLibreNavigableProductUrl(original) && isMercadoLibreBareItemPathUrl(offer_url).

-- Read-only diagnostic (safe):
-- SELECT count(*) FILTER (...) ... (see mission report)

-- Example repair pattern (PSEUDO — not executable as-is without app layer):
-- UPDATE public.offers o
-- SET offer_url = repaired.tagged_url  -- from app
-- WHERE o.id = repaired.id
--   AND o.offer_url IS NOT DISTINCT FROM repaired.previous_offer_url; -- optimistic lock

SELECT 1 AS migration_plan_placeholder_do_not_apply;
