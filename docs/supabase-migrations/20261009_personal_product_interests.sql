-- Intereses personales y deduplicación de correos.
-- No aplica esta migración a producción ni a staging desde el repositorio.
-- Reversa al final del archivo.

CREATE TABLE IF NOT EXISTS public.user_product_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  label_norm text NOT NULL,
  brand text,
  brand_norm text,
  model text,
  model_norm text,
  category text,
  aliases text[] NOT NULL DEFAULT '{}',
  alias_norms text[] NOT NULL DEFAULT '{}',
  cadence text NOT NULL DEFAULT 'occasional',
  notify boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_product_interests_label_len CHECK (char_length(label) BETWEEN 2 AND 80),
  CONSTRAINT user_product_interests_label_norm_len CHECK (char_length(label_norm) BETWEEN 2 AND 80),
  CONSTRAINT user_product_interests_cadence_check CHECK (cadence IN ('daily', 'weekly', 'monthly', 'occasional'))
);

CREATE UNIQUE INDEX IF NOT EXISTS user_product_interests_identity_idx
  ON public.user_product_interests (user_id, label_norm, COALESCE(brand_norm, ''), COALESCE(model_norm, ''));

CREATE INDEX IF NOT EXISTS user_product_interests_user_updated_idx
  ON public.user_product_interests (user_id, updated_at DESC);

ALTER TABLE public.user_product_interests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_product_interests_own ON public.user_product_interests;
CREATE POLICY user_product_interests_own ON public.user_product_interests
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.user_product_interests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_product_interests TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_user_product_interest_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.user_product_interests
    WHERE user_id = NEW.user_id
  ) >= 30 THEN
    RAISE EXCEPTION 'interest_limit_reached' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_product_interests_limit ON public.user_product_interests;
CREATE TRIGGER user_product_interests_limit
  BEFORE INSERT ON public.user_product_interests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_user_product_interest_limit();

REVOKE ALL ON FUNCTION public.enforce_user_product_interest_limit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_user_product_interest_limit() TO service_role;

CREATE TABLE IF NOT EXISTS public.interest_mail_deliveries (
  dedupe_key text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offer_id uuid NOT NULL,
  kind text NOT NULL,
  window_key text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interest_mail_deliveries_kind_check CHECK (kind IN ('daily', 'weekly')),
  CONSTRAINT interest_mail_deliveries_status_check CHECK (status IN ('reserved', 'sent'))
);

CREATE INDEX IF NOT EXISTS interest_mail_deliveries_user_window_idx
  ON public.interest_mail_deliveries (user_id, kind, window_key);

ALTER TABLE public.interest_mail_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.interest_mail_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interest_mail_deliveries TO service_role;

ALTER TABLE public.product_events DROP CONSTRAINT IF EXISTS product_events_event_name_check;
ALTER TABLE public.product_events
  ADD CONSTRAINT product_events_event_name_check
  CHECK (event_name IN (
    'page_view',
    'feed_view',
    'search',
    'load_more',
    'offer_view',
    'offer_click',
    'outbound_click',
    'vote',
    'save',
    'comment',
    'submission',
    'signup',
    'login',
    'hunter_intent',
    'interest_saved',
    'interest_removed',
    'interest_section_opened',
    'interest_offer_shown',
    'interest_offer_clicked',
    'interest_discovery_clicked',
    'interest_mail_sent',
    'interest_mail_skipped',
    'interest_mail_failed'
  )) NOT VALID;

-- Reversa:
-- ALTER TABLE public.product_events DROP CONSTRAINT IF EXISTS product_events_event_name_check;
-- recrear el CHECK anterior, sin los eventos interest_*.
-- DROP TRIGGER IF EXISTS user_product_interests_limit ON public.user_product_interests;
-- DROP FUNCTION IF EXISTS public.enforce_user_product_interest_limit();
-- DROP TABLE IF EXISTS public.interest_mail_deliveries;
-- DROP TABLE IF EXISTS public.user_product_interests;
