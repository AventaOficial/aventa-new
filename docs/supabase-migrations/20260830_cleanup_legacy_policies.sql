-- =============================================================================
-- AVENTA — Limpieza de policies RLS legacy (2026-08-30)
-- =============================================================================
-- Complementa: docs/supabase-migrations/20260830_beta_security_lockdown.sql
--
-- OBJETIVO: eliminar policies redundantes, demasiado permisivas o duplicadas
-- detectadas en producción (mkgsrpsuvedwwlzmzmzh) tras el lockdown beta.
--
-- NO ejecuta: DROP TABLE, DELETE, cambios de roles/usuarios, comisiones.
-- Idempotente: DROP POLICY IF EXISTS.
-- Las APIs Next.js usan service_role (BYPASSRLS) → no dependen de estas policies.
--
-- ANTES DE APLICAR: revisar el reporte en el PR / chat de auditoría.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- user_roles — conservar solo user_roles_select_own (lockdown)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Usuarios ven su propio rol" ON public.user_roles;
DROP POLICY IF EXISTS users_can_select_own_roles ON public.user_roles;

-- -----------------------------------------------------------------------------
-- offers — conservar SELECT público / propio / staff; quitar writes legacy
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS offers_insert_owner_only ON public.offers;
DROP POLICY IF EXISTS offers_update_owner_or_moderator ON public.offers;
DROP POLICY IF EXISTS offers_delete_owner_or_moderator ON public.offers;

-- -----------------------------------------------------------------------------
-- offer_votes — conservar offer_votes_select_own; quitar ALL/SELECT admin legacy
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS offer_votes_owner_modify ON public.offer_votes;
DROP POLICY IF EXISTS offer_votes_select_own_or_admin ON public.offer_votes;

-- -----------------------------------------------------------------------------
-- offer_events — lockdown = sin acceso cliente (solo service_role)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS offer_events_insert_authenticated ON public.offer_events;
DROP POLICY IF EXISTS offer_events_select_own ON public.offer_events;

-- -----------------------------------------------------------------------------
-- comments — conservar comments_select_public (+ restrictiva visible_offer)
-- Escrituras/moderación vía API (service_role).
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Autenticados pueden insertar su comentario" ON public.comments;
DROP POLICY IF EXISTS comments_select_moderators ON public.comments;
DROP POLICY IF EXISTS comments_update_moderators ON public.comments;

-- -----------------------------------------------------------------------------
-- offer_reports — conservar offer_reports_select_own + offer_reports_select_staff
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Usuarios pueden reportar" ON public.offer_reports;
DROP POLICY IF EXISTS moderators_can_view_reports ON public.offer_reports;
DROP POLICY IF EXISTS offer_reports_select_moderators ON public.offer_reports;

-- -----------------------------------------------------------------------------
-- moderation_logs — conservar moderation_logs_select_staff (lockdown)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Moderadores pueden insertar logs" ON public.moderation_logs;
DROP POLICY IF EXISTS "Moderadores pueden leer logs" ON public.moderation_logs;
DROP POLICY IF EXISTS moderation_logs_insert_moderators ON public.moderation_logs;
DROP POLICY IF EXISTS moderation_logs_select_moderators ON public.moderation_logs;

COMMIT;

-- Policies que deben quedar (10):
--   user_roles: user_roles_select_own
--   offers: offers_select_public, offers_owner_read_own, offers_select_staff
--   offer_votes: offer_votes_select_own
--   offer_events: (ninguna — deny-by-default + REVOKE del lockdown)
--   comments: comments_select_public, comments_select_approved_on_visible_offer
--   offer_reports: offer_reports_select_own, offer_reports_select_staff
--   moderation_logs: moderation_logs_select_staff
