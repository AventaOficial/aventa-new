-- Migración: respuestas a comentarios, likes, fotos en comentarios y baneos
-- Ejecutar en Supabase SQL Editor (Dashboard → SQL Editor). Ajustar RLS según tu proyecto.
-- Requerida para: respuestas (parent_id), likes (comment_likes), fotos (image_url), baneos (user_bans).

-- 1) Respuestas: columna parent_id en comments (respuestas a un comentario)
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON public.comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_offer_parent ON public.comments(offer_id, parent_id);

-- 2) Likes en comentarios
CREATE TABLE IF NOT EXISTS public.comment_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON public.comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_user ON public.comment_likes(user_id);

-- RLS comment_likes: lectura pública (conteo), inserción/borrado solo autenticado
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comment_likes_select" ON public.comment_likes;
CREATE POLICY "comment_likes_select" ON public.comment_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "comment_likes_insert_own" ON public.comment_likes;
CREATE POLICY "comment_likes_insert_own" ON public.comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "comment_likes_delete_own" ON public.comment_likes;
CREATE POLICY "comment_likes_delete_own" ON public.comment_likes FOR DELETE USING (auth.uid() = user_id);

-- 3) Fotos en comentarios (moderación estricta: imagen = revisión manual)
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS image_url text;

-- 4) Baneos de usuarios (moderación)
CREATE TABLE IF NOT EXISTS public.user_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  banned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_bans_user ON public.user_bans(user_id);

ALTER TABLE public.user_bans ENABLE ROW LEVEL SECURITY;

-- Solo roles con permisos de moderación pueden ver/gestionar baneos (vía service_role o función SECURITY DEFINER en API)
DROP POLICY IF EXISTS "user_bans_select_admin" ON public.user_bans;
CREATE POLICY "user_bans_select_admin" ON public.user_bans FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('owner','admin','moderator'))
);

DROP POLICY IF EXISTS "user_bans_insert_admin" ON public.user_bans;
CREATE POLICY "user_bans_insert_admin" ON public.user_bans FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('owner','admin','moderator'))
);

DROP POLICY IF EXISTS "user_bans_update_admin" ON public.user_bans;
CREATE POLICY "user_bans_update_admin" ON public.user_bans FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('owner','admin','moderator'))
);

DROP POLICY IF EXISTS "user_bans_delete_admin" ON public.user_bans;
CREATE POLICY "user_bans_delete_admin" ON public.user_bans FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('owner','admin','moderator'))
);

-- Comentario: las APIs de comentarios y ofertas deben comprobar que el user_id no esté en user_bans (y no expirado) antes de insertar.
