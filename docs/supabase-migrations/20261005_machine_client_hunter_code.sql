-- Vínculo durable: el cliente técnico apunta a un code de Hunter.
-- Rotar el token o el cliente no cambia la identidad; el code sigue siendo el mismo.
-- NO aplicada por este cambio.

ALTER TABLE public.machine_clients
  ADD COLUMN IF NOT EXISTS hunter_code text;

ALTER TABLE public.machine_clients
  DROP CONSTRAINT IF EXISTS machine_clients_hunter_code_format;

ALTER TABLE public.machine_clients
  ADD CONSTRAINT machine_clients_hunter_code_format
  CHECK (hunter_code IS NULL OR hunter_code ~ '^[a-z][a-z0-9-]{1,32}$');

COMMENT ON COLUMN public.machine_clients.hunter_code IS
  'Code estable del Hunter de Aventa que presenta este cliente. No es un nombre de infraestructura.';

-- El carril de suministro activo se presenta como Ximena. No se usa el UUID del cliente.
UPDATE public.machine_clients
SET hunter_code = 'ximena'
WHERE hunter_code IS NULL
  AND status = 'active'
  AND name ILIKE 'aventa-mcp-%';
