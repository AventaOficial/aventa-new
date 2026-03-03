-- Comentario opcional del creador para moderadores/admin (no visible en el feed).
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS moderator_comment text;

COMMENT ON COLUMN public.offers.moderator_comment IS 'Comentario del creador para moderadores/admin; opcional, máx. 500 caracteres';
