-- Añadir onboarding_completed a profiles (usuario verificado que ya completó el onboarding)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;
