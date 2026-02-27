# SQL Opción A — Renombrar vistas existentes y crear nuevas

Copia y pega esto a la IA de Supabase:

---

```
Procedo con Opción A. Ejecuta este SQL:

BEGIN;

-- 1) public_profiles_view: renombrar si existe, luego crear nueva
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'public_profiles_view') THEN
    ALTER VIEW public.public_profiles_view RENAME TO public_profiles_view_backup;
  END IF;
END $$;

CREATE VIEW public.public_profiles_view AS
SELECT id, COALESCE(display_name, username) AS display_name, avatar_url
FROM public.profiles;

GRANT SELECT ON public.public_profiles_view TO anon, authenticated;

-- 2) ofertas_ranked_general: renombrar si existe, luego crear nueva
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'ofertas_ranked_general') THEN
    ALTER VIEW public.ofertas_ranked_general RENAME TO ofertas_ranked_general_backup;
  END IF;
END $$;

CREATE VIEW public.ofertas_ranked_general AS
SELECT
  o.id,
  o.title,
  o.price,
  o.original_price,
  o.image_url,
  o.store,
  o.offer_url,
  o.description,
  o.created_at,
  o.created_by,
  o.status,
  o.expires_at,
  COALESCE(o.upvotes_count, 0)::int AS up_votes,
  COALESCE(o.downvotes_count, 0)::int AS down_votes,
  (COALESCE(o.upvotes_count, 0) - COALESCE(o.downvotes_count, 0))::int AS score,
  ((COALESCE(o.upvotes_count, 0) - COALESCE(o.downvotes_count, 0))::float / POWER(GREATEST(COALESCE(EXTRACT(EPOCH FROM (now() - o.created_at)), 0) / 3600 + 2, 2), 1.5)) AS score_final,
  COALESCE(o.ranking_momentum, 0) AS ranking_momentum
FROM public.offers o;

GRANT SELECT ON public.ofertas_ranked_general TO anon, authenticated;

COMMIT;
```

**Si profiles NO tiene columna username, usa en su lugar:**
```sql
CREATE VIEW public.public_profiles_view AS
SELECT id, display_name, avatar_url FROM public.profiles;
```
