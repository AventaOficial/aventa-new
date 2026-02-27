-- FK offers.created_by -> profiles.id necesaria para que PostgREST resuelva
-- el embed: profiles!created_by(display_name, avatar_url)
-- Sin esta FK, el SELECT con ese embed devuelve 400.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
      AND kcu.table_schema = tc.table_schema
      AND kcu.table_name = tc.table_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'offers'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'created_by'
  ) THEN
    ALTER TABLE public.offers
      ADD CONSTRAINT offers_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;
