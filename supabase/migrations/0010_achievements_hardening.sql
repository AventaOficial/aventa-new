-- 0010 — Endurecimiento de logros antes de producción.
-- No cambia el catálogo, los nombres ni el XP de los 37 logros.
-- Staging ya tenía la versión anterior de grant_achievement_xp, que sumaba
-- achievement_xp a reputation_score y por eso movía is_trusted.
-- Esta migración deja achievement_xp como métrica aparte.

REVOKE UPDATE ON TABLE public.profiles FROM PUBLIC, anon, authenticated;

GRANT UPDATE (
  display_name,
  avatar_url,
  slug,
  display_name_updated_at,
  name_saved_in_settings_at,
  onboarding_completed,
  preferred_categories,
  account_deletion_requested_at
) ON TABLE public.profiles TO authenticated;

-- Esta policy leía profiles dentro de su propio USING y provocaba
-- "infinite recursion detected in policy for relation profiles".
-- Las escrituras de administración siguen por service_role.
DROP POLICY IF EXISTS profiles_update_admin_only ON public.profiles;

COMMENT ON COLUMN public.profiles.achievement_xp IS
  'XP de logros. Métrica independiente: no entra en reputation_score.';

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

  v_score := (v_approved_offers * 10)
           - (v_rejected_offers * 15)
           + (v_approved_comments * 2)
           - (v_rejected_comments * 5)
           + COALESCE(v_likes_received, 0);

  IF v_score < 0 THEN
    v_score := 0;
  END IF;

  v_level := public.reputation_level_from_score(v_score);

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

DROP FUNCTION IF EXISTS public.get_profile_by_slug(text);

CREATE FUNCTION public.get_profile_by_slug(p_slug text)
RETURNS TABLE (
  id uuid,
  display_name text,
  avatar_url text,
  slug text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw text := lower(btrim(coalesce(p_slug, '')));
  normalized text := regexp_replace(
    regexp_replace(raw, '\s+', '-', 'g'),
    '[^a-z0-9-]',
    '',
    'g'
  );
BEGIN
  IF raw = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.display_name, p.avatar_url, p.slug
  FROM public.profiles p
  WHERE p.slug IS NOT NULL
    AND btrim(p.slug) <> ''
    AND lower(btrim(p.slug)) = raw
  LIMIT 1;
  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.display_name, p.avatar_url, p.slug
  FROM public.profiles p
  WHERE p.username IS NOT NULL
    AND lower(btrim(p.username)) = raw
  LIMIT 1;
  IF FOUND THEN
    RETURN;
  END IF;

  IF normalized = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.display_name, p.avatar_url, p.slug
  FROM public.profiles p
  WHERE (p.slug IS NULL OR btrim(coalesce(p.slug, '')) = '')
    AND regexp_replace(
      regexp_replace(lower(btrim(coalesce(p.display_name, ''))), '\s+', '-', 'g'),
      '[^a-z0-9-]',
      '',
      'g'
    ) = normalized
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.get_profile_by_slug(text) IS
  'Perfil público por slug, username o slug derivado del nombre. Solo columnas públicas.';

REVOKE ALL ON FUNCTION public.get_profile_by_slug(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_by_slug(text) TO service_role;
