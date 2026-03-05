-- Permitir value = 2 en offer_votes (like). La API envía 2 para like y -1 para dislike.
-- El CHECK actual solo permite 1 y -1; por eso los INSERT con value = 2 fallaban y los votos no se guardaban.
-- Ejecutar en Supabase SQL Editor.

-- 1) Buscar el nombre del constraint CHECK actual (opcional; si ya lo sabes, usa DROP CONSTRAINT nombre).
-- SELECT conname FROM pg_constraint WHERE conrelid = 'public.offer_votes'::regclass AND contype = 'c';

-- 2) Quitar el CHECK que solo permitía (1, -1). Nombres típicos: offer_votes_value_check o similar.
ALTER TABLE public.offer_votes
  DROP CONSTRAINT IF EXISTS offer_votes_value_check;

-- Si el nombre es otro, ejecuta primero la SELECT de arriba y reemplaza en:
-- ALTER TABLE public.offer_votes DROP CONSTRAINT <nombre_que_salga>;

-- 3) Añadir CHECK que acepte 1 (legacy), 2 (like) y -1 (dislike).
ALTER TABLE public.offer_votes
  ADD CONSTRAINT offer_votes_value_check
  CHECK (value = ANY (ARRAY[1, 2, -1]));

-- Después de esto, la API podrá insertar value = 2. El trigger recalculate_offer_metrics
-- ya cuenta value IN (1, 2) como upvote (ver offer_votes_trigger_upvotes_value_2.sql).
