-- Lock distribuido para ciclos de ingest.
--
-- Por qué hace falta una tabla: los ciclos corren en isolates de Vercel que no
-- comparten memoria, así que ningún guard en proceso sirve como exclusión mutua.
-- El worker externo puede además disparar dos lotes seguidos si GitHub libera de
-- golpe ejecuciones retrasadas.
--
-- Qué NO es: no es un control de seguridad. La integridad frente a carreras ya
-- la garantiza el UNIQUE de product_fingerprint en offers. Esto solo evita
-- trabajo duplicado y que dos ciclos se pasen del tope diario a la vez.
--
-- Append-light: una fila por clave de lock, reutilizada. Nunca se borra nada;
-- liberar es adelantar expires_at.

CREATE TABLE IF NOT EXISTS public.ingest_cycle_locks (
  lock_key text PRIMARY KEY,
  -- Identidad de quien lo tiene. Solo el titular puede liberarlo.
  holder text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  -- TTL obligatorio: un lock sin caducidad convierte cualquier caída en una
  -- parada indefinida de la supply.
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ingest_cycle_locks_ttl_forward CHECK (expires_at >= acquired_at)
);

CREATE INDEX IF NOT EXISTS idx_ingest_cycle_locks_expires_at
  ON public.ingest_cycle_locks (expires_at);

COMMENT ON TABLE public.ingest_cycle_locks IS
  'Lock distribuido con TTL para ciclos de ingest. Evita trabajo duplicado entre isolates; no es un control de seguridad.';

COMMENT ON COLUMN public.ingest_cycle_locks.expires_at IS
  'Caducidad del lock. Un lock vencido puede ser tomado por otro ciclo para que una caída no detenga la ingesta.';

ALTER TABLE public.ingest_cycle_locks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ingest_cycle_locks FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.ingest_cycle_locks TO service_role;
