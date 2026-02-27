-- Asegurar que offer_votes tenga columna "value" (1 o -1).
-- Si la tabla fue creada con "vote" en lugar de "value", la renombramos.
DO $$
BEGIN
  -- Si existe "vote" pero no "value": renombrar vote -> value
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'offer_votes' AND column_name = 'vote')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'offer_votes' AND column_name = 'value') THEN
    ALTER TABLE public.offer_votes RENAME COLUMN vote TO value;
  END IF;
  -- Si no existe "value" ni "vote": añadir value (caso tabla vacía o mal configurada)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'offer_votes' AND column_name = 'value')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'offer_votes' AND column_name = 'vote') THEN
    ALTER TABLE public.offer_votes ADD COLUMN value smallint NOT NULL DEFAULT 1;
  END IF;
END $$;
