-- 0009 — Logros.
-- Capa de progresión sobre ofertas, votos, comentarios y reputación.
-- No crea dinero ni otro sistema de niveles.
-- El XP de un logro entra una sola vez en profiles.achievement_xp.
-- No se suma a reputation_score ni cambia is_trusted.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_trusted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS achievement_xp integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS featured_achievement_codes text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_achievement_xp_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_achievement_xp_check CHECK (achievement_xp >= 0);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_featured_achievements_len;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_featured_achievements_len
  CHECK (cardinality(featured_achievement_codes) <= 5);

ALTER TABLE public.offer_votes
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

CREATE OR REPLACE FUNCTION public.offer_votes_set_created_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.created_at IS NULL THEN
    NEW.created_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS offer_votes_set_created_at ON public.offer_votes;
CREATE TRIGGER offer_votes_set_created_at
  BEFORE INSERT ON public.offer_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.offer_votes_set_created_at();

CREATE TABLE IF NOT EXISTS public.achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL,
  category text NOT NULL,
  rarity text NOT NULL,
  xp_reward integer NOT NULL DEFAULT 0,
  is_hidden boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  is_repeatable boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT achievements_code_key UNIQUE (code),
  CONSTRAINT achievements_xp_reward_check CHECK (xp_reward >= 0),
  CONSTRAINT achievements_category_check CHECK (
    category = ANY (ARRAY[
      'caceria'::text,
      'precision'::text,
      'comunidad'::text,
      'constancia'::text,
      'impacto'::text,
      'experiencia'::text,
      'especiales'::text
    ])
  ),
  CONSTRAINT achievements_rarity_check CHECK (
    rarity = ANY (ARRAY[
      'common'::text,
      'uncommon'::text,
      'rare'::text,
      'epic'::text,
      'legendary'::text,
      'mythic'::text
    ])
  )
);

CREATE TABLE IF NOT EXISTS public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  achievement_id uuid NOT NULL,
  progress integer NOT NULL DEFAULT 0,
  target integer NOT NULL DEFAULT 1,
  unlocked_at timestamptz,
  celebrated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_achievements_user_achievement_key UNIQUE (user_id, achievement_id),
  CONSTRAINT user_achievements_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE,
  CONSTRAINT user_achievements_achievement_id_fkey
    FOREIGN KEY (achievement_id) REFERENCES public.achievements (id) ON DELETE CASCADE,
  CONSTRAINT user_achievements_progress_check CHECK (progress >= 0),
  CONSTRAINT user_achievements_target_check CHECK (target >= 1)
);

CREATE TABLE IF NOT EXISTS public.achievement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  achievement_id uuid NOT NULL,
  event_type text NOT NULL,
  event_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT achievement_events_idempotency_key UNIQUE (user_id, achievement_id, event_type, event_id),
  CONSTRAINT achievement_events_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE,
  CONSTRAINT achievement_events_achievement_id_fkey
    FOREIGN KEY (achievement_id) REFERENCES public.achievements (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS achievement_events_user_created_idx
  ON public.achievement_events (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.achievement_xp_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  achievement_id uuid NOT NULL,
  amount integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT achievement_xp_grants_once UNIQUE (user_id, achievement_id),
  CONSTRAINT achievement_xp_grants_amount_check CHECK (amount > 0),
  CONSTRAINT achievement_xp_grants_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE,
  CONSTRAINT achievement_xp_grants_achievement_id_fkey
    FOREIGN KEY (achievement_id) REFERENCES public.achievements (id) ON DELETE CASCADE
);

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievement_xp_grants ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.achievements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.user_achievements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.achievement_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.achievement_xp_grants FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.achievements TO service_role;
GRANT ALL ON TABLE public.user_achievements TO service_role;
GRANT ALL ON TABLE public.achievement_events TO service_role;
GRANT ALL ON TABLE public.achievement_xp_grants TO service_role;

INSERT INTO public.achievements (code, name, description, icon, category, rarity, xp_reward, is_hidden, is_active, is_repeatable, display_order)
VALUES
  ('first_trail', 'Primer rastro', 'Publica tu primera oferta aprobada.', '🏹', 'caceria', 'common', 50, false, true, false, 10),
  ('hunter_moving_1', 'Cazador en marcha I', 'Publica 5 ofertas aprobadas.', '🏹', 'caceria', 'common', 50, false, true, false, 20),
  ('hunter_moving_2', 'Cazador en marcha II', 'Publica 25 ofertas aprobadas.', '🏹', 'caceria', 'uncommon', 100, false, true, false, 30),
  ('hunter_moving_3', 'Cazador en marcha III', 'Publica 100 ofertas aprobadas.', '🏹', 'caceria', 'rare', 250, false, true, false, 40),
  ('hunter_veteran', 'Cazador veterano', 'Publica 250 ofertas aprobadas.', '🏹', 'caceria', 'epic', 500, false, true, false, 50),
  ('good_eye', 'Buen ojo', 'Publica 5 ofertas que sean aprobadas sin necesidad de corrección.', '🎯', 'precision', 'uncommon', 50, false, true, false, 60),
  ('precise_hunter', 'Cazador preciso', 'Alcanza una tasa de aprobación del 80% después de al menos 20 ofertas.', '🎯', 'precision', 'rare', 100, false, true, false, 70),
  ('eagle_eye', 'Ojo de águila', 'Demuestra una precisión excepcional al encontrar ofertas.', '🎯', 'precision', 'rare', 250, false, true, false, 80),
  ('bargain_detector', 'Detector de gangas', 'Publica 10 ofertas que superen el umbral de calidad de Aventa.', '🎯', 'precision', 'epic', 150, false, true, false, 90),
  ('first_help', 'Primera ayuda', 'Tu primera oferta recibe un voto positivo.', '❤️', 'comunidad', 'common', 25, false, true, false, 100),
  ('good_contribution', 'Buena aportación', 'Acumula 25 votos positivos recibidos.', '❤️', 'comunidad', 'uncommon', 75, false, true, false, 110),
  ('community_favorite', 'Favorito de la comunidad', 'Acumula 100 votos positivos recibidos.', '❤️', 'comunidad', 'rare', 150, false, true, false, 120),
  ('community_reference', 'Referencia de la comunidad', 'Acumula 500 votos positivos recibidos.', '❤️', 'comunidad', 'epic', 500, false, true, false, 130),
  ('conversationalist', 'Conversador', 'Recibe 10 comentarios útiles en tus ofertas.', '💬', 'comunidad', 'uncommon', 75, false, true, false, 140),
  ('participant', 'Participante', 'Participa de manera válida en 25 conversaciones.', '🤝', 'comunidad', 'rare', 100, false, true, false, 150),
  ('first_fire', 'Primer fuego', 'Contribuye en 3 días diferentes.', '🔥', 'constancia', 'common', 25, false, true, false, 160),
  ('constant_hunter', 'Cazador constante', 'Contribuye durante 7 días diferentes.', '🔥', 'constancia', 'uncommon', 75, false, true, false, 170),
  ('perfect_week', 'Semana perfecta', 'Contribuye durante 7 días consecutivos.', '🔥', 'constancia', 'rare', 100, false, true, false, 180),
  ('disciplined_hunter', 'Cazador disciplinado', 'Contribuye durante 14 días consecutivos.', '🔥', 'constancia', 'epic', 150, false, true, false, 190),
  ('unstoppable', 'Imparable', 'Contribuye durante 30 días consecutivos.', '🔥', 'constancia', 'epic', 300, false, true, false, 200),
  ('legend', 'Leyenda', 'Contribuye durante 90 días consecutivos.', '🔥', 'constancia', 'legendary', 500, false, true, false, 210),
  ('first_mark', 'Primera huella', 'Una oferta alcanza 10 votos.', '📈', 'impacto', 'common', 50, false, true, false, 220),
  ('growing_impact', 'Impacto creciente', 'Una oferta alcanza 50 votos.', '📈', 'impacto', 'uncommon', 100, false, true, false, 230),
  ('featured_offer', 'Oferta destacada', 'Una oferta alcanza 100 votos.', '📈', 'impacto', 'rare', 200, false, true, false, 240),
  ('influential_hunter', 'Cazador influyente', 'Tus ofertas acumulan 500 votos.', '📈', 'impacto', 'epic', 250, false, true, false, 250),
  ('great_impact', 'Gran impacto', 'Tus ofertas acumulan 2,500 votos.', '📈', 'impacto', 'legendary', 400, false, true, false, 260),
  ('aventa_footprint', 'Huella Aventa', 'Tus ofertas acumulan 10,000 votos.', '👑', 'impacto', 'mythic', 500, false, true, false, 270),
  ('first_step', 'Primer paso', 'Alcanza Nivel 2.', '🧠', 'experiencia', 'common', 0, false, true, false, 280),
  ('contributor', 'Contribuidor', 'Alcanza Nivel 3.', '🧠', 'experiencia', 'uncommon', 0, false, true, false, 290),
  ('hunter_rank', 'Cazador', 'Alcanza Nivel 5.', '🧠', 'experiencia', 'rare', 0, false, true, false, 300),
  ('explorer', 'Explorador', 'Alcanza Nivel 10.', '🧠', 'experiencia', 'epic', 0, false, true, false, 310),
  ('early_bird', 'Madrugador', 'Publica una oferta excepcional durante la ventana de la mañana.', '💎', 'especiales', 'rare', 75, false, true, false, 320),
  ('night_hunter', 'Cazador nocturno', 'Encuentra una oferta excepcional durante la noche.', '💎', 'especiales', 'rare', 75, false, true, false, 330),
  ('flash_hunter', 'Flash Hunter', 'Encuentra una oferta excepcional con una ventana de disponibilidad muy corta.', '⚡', 'especiales', 'epic', 100, false, true, false, 340),
  ('black_friday_hunter', 'Black Friday Hunter', 'Publica una oferta excepcional durante Black Friday.', '🛒', 'especiales', 'legendary', 150, true, true, false, 350),
  ('season_hunter', 'Cazador de temporada', 'Publica una oferta excepcional durante una temporada de Aventa.', '🎄', 'especiales', 'epic', 100, true, true, false, 360),
  ('secret_offer', 'Oferta secreta', 'Encuentra una oferta excepcional, de las que casi no aparecen.', '🥷', 'especiales', 'mythic', 250, true, true, false, 370)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  category = EXCLUDED.category,
  rarity = EXCLUDED.rarity,
  xp_reward = EXCLUDED.xp_reward,
  is_hidden = EXCLUDED.is_hidden,
  is_active = EXCLUDED.is_active,
  is_repeatable = EXCLUDED.is_repeatable,
  display_order = EXCLUDED.display_order;

CREATE OR REPLACE FUNCTION public.reputation_level_from_score(score integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN score >= 1000 THEN 4
    WHEN score >= 400 THEN 3
    WHEN score >= 100 THEN 2
    ELSE 1
  END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_user_reputation(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score integer := 0;
  v_level integer := 1;
  v_approved_offers bigint;
  v_rejected_offers bigint;
  v_approved_comments bigint;
  v_rejected_comments bigint;
  v_likes_received bigint;
BEGIN
  SELECT COUNT(*) INTO v_approved_offers
    FROM public.offers
    WHERE created_by = p_user_id AND status = 'approved';
  SELECT COUNT(*) INTO v_rejected_offers
    FROM public.offers
    WHERE created_by = p_user_id AND status = 'rejected';
  SELECT COUNT(*) INTO v_approved_comments
    FROM public.comments
    WHERE user_id = p_user_id AND status = 'approved';
  SELECT COUNT(*) INTO v_rejected_comments
    FROM public.comments
    WHERE user_id = p_user_id AND status = 'rejected';
  BEGIN
    SELECT COUNT(*) INTO v_likes_received
      FROM public.comment_likes cl
      JOIN public.comments c ON c.id = cl.comment_id
      WHERE c.user_id = p_user_id;
  EXCEPTION WHEN undefined_table OR OTHERS THEN
    v_likes_received := 0;
  END;

  -- achievement_xp es métrica aparte. No entra en esta fórmula.
  v_score := (v_approved_offers * 10)
           - (v_rejected_offers * 15)
           + (v_approved_comments * 2)
           - (v_rejected_comments * 5)
           + COALESCE(v_likes_received, 0);

  IF v_score < 0 THEN
    v_score := 0;
  END IF;

  v_level := public.reputation_level_from_score(v_score);

  -- is_trusted pertenece a esta función de reputación (nivel >= 2).
  -- grant_achievement_xp no la llama.
  UPDATE public.profiles
  SET
    reputation_score = v_score,
    reputation_level = v_level,
    is_trusted = (v_level >= 2)
  WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_achievement_xp(
  p_user_id uuid,
  p_achievement_id uuid,
  p_amount integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer := 0;
BEGIN
  IF p_user_id IS NULL OR p_achievement_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN false;
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  INSERT INTO public.achievement_xp_grants (user_id, achievement_id, amount)
  VALUES (p_user_id, p_achievement_id, p_amount)
  ON CONFLICT (user_id, achievement_id) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN false;
  END IF;

  UPDATE public.profiles
  SET achievement_xp = achievement_xp + p_amount
  WHERE id = p_user_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_achievement_xp(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_achievement_xp(uuid, uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.recalculate_user_reputation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_user_reputation(uuid) TO service_role;
