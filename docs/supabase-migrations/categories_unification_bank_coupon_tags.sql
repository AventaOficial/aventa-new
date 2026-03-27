-- Unificación de categorías + nuevos metadatos de oferta.
-- Ejecutar en Supabase SQL Editor (staging y luego producción).
--
-- Objetivos:
-- 1) Normalizar offers.category al set macro canónico de la app.
-- 2) Añadir bank_coupon (cupón bancario) y tags (etiquetas libres) a offers.
-- 3) Recrear la vista ofertas_ranked_general con bank_coupon y tags.

BEGIN;

-- 1) Nuevas columnas (idempotente)
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS bank_coupon text,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

COMMENT ON COLUMN public.offers.category IS
  'Macro categoría canónica: tecnologia, gaming, hogar, supermercado, moda, belleza, viajes, servicios, other';
COMMENT ON COLUMN public.offers.bank_coupon IS
  'Banco del cupón bancario: bbva, banamex, santander, hsbc, banorte, scotiabank, inbursa, nu, rappi-card, otro';
COMMENT ON COLUMN public.offers.tags IS
  'Etiquetas libres (array): marcas, producto, tema. No reemplaza category.';

-- 2) Constraint de valores permitidos para bank_coupon (si viene valor, debe ser válido)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'offers_bank_coupon_check'
  ) THEN
    ALTER TABLE public.offers
      ADD CONSTRAINT offers_bank_coupon_check CHECK (
        bank_coupon IS NULL OR bank_coupon IN (
          'bbva', 'banamex', 'santander', 'hsbc', 'banorte',
          'scotiabank', 'inbursa', 'nu', 'rappi-card', 'otro'
        )
      );
  END IF;
END $$;

-- 3) Backfill de categorías legacy -> macro canónica
UPDATE public.offers
SET category = CASE lower(trim(category))
  WHEN 'tecnologia' THEN 'tecnologia'
  WHEN 'electronics' THEN 'tecnologia'
  WHEN 'electrones' THEN 'tecnologia'

  WHEN 'gaming' THEN 'gaming'

  WHEN 'hogar' THEN 'hogar'
  WHEN 'home' THEN 'hogar'

  WHEN 'supermercado' THEN 'supermercado'
  WHEN 'despensa' THEN 'supermercado'
  WHEN 'comida' THEN 'supermercado'
  WHEN 'bebidas' THEN 'supermercado'

  WHEN 'moda' THEN 'moda'
  WHEN 'fashion' THEN 'moda'
  WHEN 'ropa_mujer' THEN 'moda'
  WHEN 'ropa_hombre' THEN 'moda'

  WHEN 'belleza' THEN 'belleza'
  WHEN 'viajes' THEN 'viajes'
  WHEN 'servicios' THEN 'servicios'
  WHEN 'bancaria' THEN 'servicios'

  WHEN 'sports' THEN 'other'
  WHEN 'deportes' THEN 'other'
  WHEN 'books' THEN 'other'
  WHEN 'libros' THEN 'other'
  WHEN 'mascotas' THEN 'other'
  WHEN 'other' THEN 'other'
  ELSE COALESCE(NULLIF(lower(trim(category)), ''), 'other')
END;

-- Fallback por seguridad para valores fuera de catálogo.
UPDATE public.offers
SET category = 'other'
WHERE category NOT IN (
  'tecnologia', 'gaming', 'hogar', 'supermercado',
  'moda', 'belleza', 'viajes', 'servicios', 'other'
);

-- 4) Vista de feed (incluye nuevas columnas)
DROP VIEW IF EXISTS public.ofertas_ranked_general;

CREATE VIEW public.ofertas_ranked_general AS
SELECT
  o.id,
  o.title,
  o.price,
  o.original_price,
  o.image_url,
  o.image_urls,
  o.msi_months,
  o.bank_coupon,
  o.tags,
  o.store,
  o.category,
  o.offer_url,
  o.description,
  o.steps,
  o.conditions,
  o.coupons,
  o.created_at,
  o.created_by,
  o.status,
  o.expires_at,
  COALESCE(o.upvotes_count, 0)::int AS up_votes,
  COALESCE(o.downvotes_count, 0)::int AS down_votes,
  (COALESCE(o.upvotes_count, 0) * 2 - COALESCE(o.downvotes_count, 0))::int AS score,
  ((COALESCE(o.upvotes_count, 0) * 2 - COALESCE(o.downvotes_count, 0))::float /
    POWER(GREATEST(COALESCE(EXTRACT(EPOCH FROM (now() - o.created_at)), 0) / 3600 + 2, 2), 1.5)
  ) AS score_final,
  COALESCE(o.ranking_momentum, 0) AS ranking_momentum,
  COALESCE(o.reputation_weighted_score, 0)::numeric AS reputation_weighted_score,
  (COALESCE(o.ranking_momentum, 0) + COALESCE(o.reputation_weighted_score, 0)) AS ranking_blend
FROM public.offers o;

GRANT SELECT ON public.ofertas_ranked_general TO anon, authenticated;

COMMIT;
