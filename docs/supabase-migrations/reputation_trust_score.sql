-- Reputation / Trust Score (sin romper lo existente)
-- Ejecutar en Supabase SQL Editor.

-- 1) Columnas en profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS reputation_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reputation_level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_trusted boolean NOT NULL DEFAULT false;

-- 2) Función para calcular nivel desde score (solo lectura, sin efectos)
-- Nivel 1: 0-49, Nivel 2: 50-199, Nivel 3: 200-499, Nivel 4: 500+
CREATE OR REPLACE FUNCTION public.reputation_level_from_score(score integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN score >= 500 THEN 4
    WHEN score >= 200 THEN 3
    WHEN score >= 50 THEN 2
    ELSE 1
  END;
$$;

-- 3) Recalcular reputación de un usuario (llamada desde API o desde triggers)
-- Reglas: +10 oferta aprobada, -15 rechazada, +2 comentario aprobado, -5 rechazado, +1 like recibido
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
           + (COALESCE(v_likes_received, 0));

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

-- Si comment_likes no existe aún, la función fallará al llamarse; crear comment_likes antes o usar bloque EXCEPTION.
-- Comentario: la API puede llamar a recalculate_user_reputation(v_user_id) vía RPC desde Next.js.
