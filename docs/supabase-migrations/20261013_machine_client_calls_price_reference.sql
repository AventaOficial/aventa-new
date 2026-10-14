-- Auditoría MCP: admite la herramienta get_price_reference.
-- Sólo amplía la lista permitida; no toca filas existentes ni permisos.

BEGIN;

ALTER TABLE public.machine_client_calls
  DROP CONSTRAINT IF EXISTS machine_client_calls_tool_check;

ALTER TABLE public.machine_client_calls
  ADD CONSTRAINT machine_client_calls_tool_check CHECK (tool IN (
    'submit_deal_candidates', 'get_submission_status', 'check_offer_exists', 'get_submission_rules',
    'get_price_reference'
  ));

COMMIT;
