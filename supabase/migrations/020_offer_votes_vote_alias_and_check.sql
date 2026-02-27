-- 1) Añadir columna "vote" como alias de "value" (por si RLS/Realtime esperan "vote")
-- 2) CHECK constraint para que value solo sea 1 o -1
DO $$
BEGIN
  -- Solo si existe "value" y no existe "vote": añadir vote como alias
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'offer_votes' AND column_name = 'value')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'offer_votes' AND column_name = 'vote') THEN
    ALTER TABLE public.offer_votes ADD COLUMN vote smallint GENERATED ALWAYS AS (value) STORED;
  END IF;
END $$;

-- CHECK constraint: value solo puede ser 1 o -1 (solo si existe la columna value)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'offer_votes' AND column_name = 'value') THEN
    ALTER TABLE public.offer_votes DROP CONSTRAINT IF EXISTS offer_votes_value_check;
    ALTER TABLE public.offer_votes ADD CONSTRAINT offer_votes_value_check CHECK (value IN (1, -1));
  END IF;
END $$;
