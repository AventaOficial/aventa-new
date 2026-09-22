-- FALSE_ZERO historical audit + reversible backfill (DO NOT run automatically).
-- Observation / ops only. Read-only SELECT first. UPDATE is optional and transactional.
--
-- Definition (strict):
--   discount_percentage = 0
--   sale_price > 0
--   original_price > sale_price
--   ROUND((1 - sale_price/original_price)*100) >= 25
--
-- Semantics after correction:
--   discount_percentage = computed
--   discount_class = DISCOUNT_REAL_GOOD (when computed >= 25)
--   discount_source = computed_from_prices
--   price_evidence += audit keys
--
-- NEVER invent original_price. NEVER touch rows without both prices.

-- ========== 1) AUDIT COUNTS ==========
SELECT
  count(*) AS false_zero_candidates,
  min(discovered_at) AS first_seen,
  max(discovered_at) AS last_seen,
  count(DISTINCT source) AS sources,
  count(DISTINCT run_id) AS runs
FROM public.hunter_offer_candidates
WHERE discount_percentage = 0
  AND sale_price IS NOT NULL
  AND original_price IS NOT NULL
  AND sale_price > 0
  AND original_price > sale_price
  AND ROUND((1 - sale_price / original_price) * 100) >= 25;

-- ========== 2) BY SOURCE / DAY ==========
SELECT
  source,
  date_trunc('day', discovered_at) AS day,
  count(*) AS n,
  ROUND(avg(ROUND((1 - sale_price / original_price) * 100))) AS avg_computed_pct
FROM public.hunter_offer_candidates
WHERE discount_percentage = 0
  AND sale_price IS NOT NULL
  AND original_price IS NOT NULL
  AND sale_price > 0
  AND original_price > sale_price
  AND ROUND((1 - sale_price / original_price) * 100) >= 25
GROUP BY 1, 2
ORDER BY n DESC
LIMIT 100;

-- ========== 3) SAMPLE ==========
SELECT
  id,
  run_id,
  source,
  canonical_url,
  sale_price,
  original_price,
  discount_percentage AS stored_pct,
  ROUND((1 - sale_price / original_price) * 100)::integer AS computed_pct,
  discovered_at
FROM public.hunter_offer_candidates
WHERE discount_percentage = 0
  AND sale_price IS NOT NULL
  AND original_price IS NOT NULL
  AND sale_price > 0
  AND original_price > sale_price
  AND ROUND((1 - sale_price / original_price) * 100) >= 25
ORDER BY discovered_at DESC
LIMIT 50;

-- ========== 4) OPTIONAL BACKFILL (review before run) ==========
-- BEGIN;
-- CREATE TEMP TABLE false_zero_backfill_20260921 AS
-- SELECT
--   id,
--   discount_percentage AS old_discount_percentage,
--   discount_class AS old_discount_class,
--   discount_source AS old_discount_source,
--   price_evidence AS old_price_evidence,
--   ROUND((1 - sale_price / original_price) * 100)::integer AS new_discount_percentage
-- FROM public.hunter_offer_candidates
-- WHERE discount_percentage = 0
--   AND sale_price IS NOT NULL
--   AND original_price IS NOT NULL
--   AND sale_price > 0
--   AND original_price > sale_price
--   AND ROUND((1 - sale_price / original_price) * 100) >= 25;
--
-- UPDATE public.hunter_offer_candidates c
-- SET
--   discount_percentage = b.new_discount_percentage,
--   discount_class = 'DISCOUNT_REAL_GOOD',
--   discount_source = 'computed_from_prices',
--   discount_confidence = 'high',
--   price_evidence = COALESCE(c.price_evidence, '{}'::jsonb) || jsonb_build_object(
--     'falseZeroBackfill', '20260921_v1',
--     'calculationStatus', 'conflict',
--     'suppliedDiscountPercentage', 0,
--     'computedDiscountPercentage', b.new_discount_percentage,
--     'oldDiscountPercentage', b.old_discount_percentage
--   )
-- FROM false_zero_backfill_20260921 b
-- WHERE c.id = b.id;
--
-- -- ROLLBACK helper: restore from temp table if still in session
-- -- UPDATE public.hunter_offer_candidates c
-- -- SET
-- --   discount_percentage = b.old_discount_percentage,
-- --   discount_class = b.old_discount_class,
-- --   discount_source = b.old_discount_source,
-- --   price_evidence = b.old_price_evidence
-- -- FROM false_zero_backfill_20260921 b
-- -- WHERE c.id = b.id;
--
-- COMMIT;

SELECT 1;
