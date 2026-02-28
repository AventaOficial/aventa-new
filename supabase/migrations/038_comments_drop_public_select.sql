-- Eliminar política que permite ver TODOS los comentarios (sin filtrar por status).
-- Así solo se aplican: comments_select_approved_on_visible_offer (solo approved) y comments_select_moderators.
-- Si en tu proyecto la política se llama distinto, bórrala manualmente en el SQL Editor.

DROP POLICY IF EXISTS "comments_select_public" ON public.comments;
DROP POLICY IF EXISTS "Cualquiera puede leer comentarios" ON public.comments;
DROP POLICY IF EXISTS "comments_select_on_offer_visibility" ON public.comments;
