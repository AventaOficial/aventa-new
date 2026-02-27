# SQL para crear vistas — dar a la IA de Supabase

## Respuesta a tu pregunta: approved vs published

**Recomendación: usar `approved`**

- Encaja con el flujo de moderación: `pending` → `approved` o `rejected`.
- La BD ya está migrada a `approved`.
- No hace falta cambiar nada.

---

## Qué pedir a la IA de Supabase

Responde: **"Autorizo [A] y [B]. Ejecuta el SQL que te paso."**

Y pega este SQL:

---

### 1. public_profiles_view

```sql
-- Vista pública de perfiles para joins (autor de ofertas, comentarios).
-- Si profiles tiene columna username, usa: COALESCE(display_name, username) AS display_name
-- Si solo tiene display_name, usa: display_name
CREATE OR REPLACE VIEW public.public_profiles_view AS
SELECT id, display_name, avatar_url FROM public.profiles;

-- Política para que anon/authenticated puedan leer perfiles (necesario para el join en feed)
-- Si ya existe una política que permite SELECT público, omitir esto.
CREATE POLICY "Perfiles públicos visibles para todos" ON public.profiles FOR SELECT USING (true);

GRANT SELECT ON public.public_profiles_view TO anon, authenticated;
```

*(Si falla "policy already exists", la IA puede omitir el CREATE POLICY. Si `profiles` tiene `username`, usar `COALESCE(display_name, username) AS display_name`.)*

---

### 2. ofertas_ranked_general

```sql
-- Vista para el feed. Lee de offers (upvotes_count, downvotes_count, ranking_momentum).
-- La app usa: .from('ofertas_ranked_general').select(...).eq('status','approved').order('ranking_momentum', { ascending: false })
CREATE OR REPLACE VIEW public.ofertas_ranked_general AS
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
```

---

## Qué sigue después

1. Ejecutar el SQL anterior en Supabase.
2. Probar el feed en la app (home, búsqueda, favoritos).
3. Opcional: pedir a la IA que ejecute [D] pruebas RLS.
4. Opcional: pedir índices en `offers(created_by)`, `offers(status, expires_at, created_at)`, `offer_events(offer_id, created_at)`.

---

## Nota sobre el join con profiles

La app hace:

```
profiles:public_profiles_view!created_by(display_name, avatar_url)
```

Eso requiere que `public_profiles_view` exista y que PostgREST pueda resolver la FK `offers.created_by` → `profiles.id`. La vista debe exponer `id` para que el join funcione.
