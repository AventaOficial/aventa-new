-- Limpieza de datos de prueba: ofertas y métricas relacionadas.
-- NO borra: profiles, user_roles, reputación, triggers, vistas, RLS.
-- Ejecutar en Supabase SQL Editor (Dashboard → SQL Editor).
--
-- IMPORTANTE: Haz backup antes (export CSV de offers y offer_events desde Dashboard,
-- o pg_dump de las tablas afectadas). Después de esto los datos no se recuperan.
--
-- Orden: borrar en tablas hijas primero para evitar violaciones de FK.

-- 1) Likes en comentarios (referencian comments)
DELETE FROM public.comment_likes;

-- 2) Comentarios (referencian offers)
DELETE FROM public.comments;

-- 3) Votos por oferta
DELETE FROM public.offer_votes;

-- 4) Favoritos por oferta
DELETE FROM public.offer_favorites;

-- 5) Eventos (vistas, outbound, share) — métricas por oferta
DELETE FROM public.offer_events;

-- 6) Reportes de ofertas
DELETE FROM public.offer_reports;

-- 7) Logs de moderación (referencian offer_id)
DELETE FROM public.moderation_logs;

-- 8) Ofertas (tabla principal)
DELETE FROM public.offers;

-- Opcional: reiniciar secuencias si usas serial/id autoincrement en alguna tabla.
-- (offers y el resto usan uuid, no hace falta.)

-- Comprobación rápida (debe devolver 0 en todas):
-- SELECT (SELECT COUNT(*) FROM public.offers) AS offers,
--        (SELECT COUNT(*) FROM public.offer_votes) AS votes,
--        (SELECT COUNT(*) FROM public.offer_events) AS events,
--        (SELECT COUNT(*) FROM public.comments) AS comments;
