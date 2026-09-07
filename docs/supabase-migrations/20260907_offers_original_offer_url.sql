-- Persistencia del URL original de la oferta (antes de normalización/monetización).
-- NO backfill: ofertas históricas quedan NULL (unknown > falso original).
alter table public.offers
  add column if not exists original_offer_url text;

comment on column public.offers.original_offer_url is
  'URL original recibido de usuario/bot antes de normalizar/monetizar. NULL = desconocido (histórico). offer_url sigue siendo el URL operativo.';
