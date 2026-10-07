-- Peso nuevo del voto:
-- Nivel 1: +2 / −2, 2: +4 / −2, 3: +6 / −2, 4: +8 / −2.
-- El voto en contra nuevo es siempre −2.
-- Se conserva 12, −1, −4 y −6 para filas ya guardadas.

ALTER TABLE public.offer_votes DROP CONSTRAINT IF EXISTS offer_votes_value_check;

ALTER TABLE public.offer_votes
  ADD CONSTRAINT offer_votes_value_check
  CHECK (value = ANY (ARRAY[2, 4, 6, 8, 12, -1, -2, -4, -6]));
