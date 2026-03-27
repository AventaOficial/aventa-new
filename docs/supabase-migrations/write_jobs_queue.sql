-- Cola de escrituras para absorber picos de eventos (view/outbound/share).
-- Ejecutar en Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.write_jobs_queue (
  id BIGSERIAL PRIMARY KEY,
  job_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT NULL,
  locked_at TIMESTAMPTZ NULL,
  processed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.write_jobs_queue
  DROP CONSTRAINT IF EXISTS write_jobs_queue_status_check;

ALTER TABLE public.write_jobs_queue
  ADD CONSTRAINT write_jobs_queue_status_check
  CHECK (status = ANY (ARRAY['pending','processing','done','failed']));

CREATE INDEX IF NOT EXISTS idx_write_jobs_queue_status_created
  ON public.write_jobs_queue (status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_write_jobs_queue_job_type_status
  ON public.write_jobs_queue (job_type, status);

