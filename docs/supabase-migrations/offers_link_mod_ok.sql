-- Moderación: el moderador confirma que el enlace coincide con el producto (el sistema ya aplica tags de afiliado).
alter table public.offers
  add column if not exists link_mod_ok boolean;

comment on column public.offers.link_mod_ok is
  'true si un moderador confirmó que offer_url es correcto; null si no aplica o aprobación sin confirmación explícita.';
