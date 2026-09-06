-- AVENTA FASE 0.7 — P1-12 + P1-5 integridad de datos
-- LOCAL / documentada. NO aplicar en Production sin revisión del owner.
-- Idempotente donde es posible. No toca dinero, RLS grants, ni datos históricos.

-- ═══════════════════════════════════════════════════════════════════════════
-- P1-12: offers.status DEFAULT seguro = pending
-- Antes (prod verificado 2026-09-05): DEFAULT 'approved'::text
-- Writers actuales suelen enviar status explícito; el DEFAULT es última barrera.
-- No backfill: filas approved/rejected/pending existentes se conservan.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.offers
  ALTER COLUMN status SET DEFAULT 'pending';

COMMENT ON COLUMN public.offers.status IS
  'Moderation status. DEFAULT pending (P1-12). approved solo vía writer autorizado o moderación.';

-- ═══════════════════════════════════════════════════════════════════════════
-- P1-5: welcome claim inmutable aunque se borre la oferta (ON DELETE SET NULL)
--
-- FK profiles.welcome_offer_id → offers(id) ON DELETE SET NULL se CONSERVA
-- (permite borrar ofertas sin bloquear FK). El hecho histórico de claim vive en
-- welcome_offer_selected_at, que NO se limpia al borrar la oferta.
--
-- App: selectWelcomeOffer rechaza si selected_at IS NOT NULL y hace CAS
--   .is('welcome_offer_selected_at', null).
--
-- DB: trigger impide borrar/limpiar welcome_offer_selected_at una vez seteado.
-- No backfill: en prod (2026-09-05) 0 usuarios con welcome claim.
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN public.profiles.welcome_offer_selected_at IS
  'Timestamp de claim de Oferta de Bienvenida (P1-5). Inmutable. Persistente aunque welcome_offer_id quede NULL por ON DELETE SET NULL.';

COMMENT ON COLUMN public.profiles.welcome_offer_id IS
  'Oferta de Bienvenida elegida. Puede quedar NULL si la oferta se elimina (ON DELETE SET NULL); el claim histórico permanece en welcome_offer_selected_at.';

CREATE OR REPLACE FUNCTION public.profiles_protect_welcome_claim()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.welcome_offer_selected_at IS NOT NULL
     AND NEW.welcome_offer_selected_at IS DISTINCT FROM OLD.welcome_offer_selected_at THEN
    RAISE EXCEPTION
      'welcome_offer_selected_at is immutable once set (P1-5 welcome claim)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_protect_welcome_claim ON public.profiles;
CREATE TRIGGER trg_profiles_protect_welcome_claim
  BEFORE UPDATE OF welcome_offer_selected_at ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_protect_welcome_claim();
