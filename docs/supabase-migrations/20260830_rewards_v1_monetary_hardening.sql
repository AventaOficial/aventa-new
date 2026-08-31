-- Rewards V1 — hardening monetario pre-staging (NO ejecutar en prod sin revisión).
-- Payout atómico + clawback adjustments.

-- ── Ajustes / clawback post-PAID ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reward_clawback_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id uuid NOT NULL REFERENCES public.creator_rewards(id) ON DELETE RESTRICT,
  ledger_entry_id uuid NULL REFERENCES public.affiliate_ledger_entries(id) ON DELETE SET NULL,
  payout_id uuid NULL REFERENCES public.reward_payouts(id) ON DELETE SET NULL,
  original_amount_cents bigint NOT NULL CHECK (original_amount_cents >= 0),
  adjustment_amount_cents bigint NOT NULL CHECK (adjustment_amount_cents > 0),
  currency text NOT NULL DEFAULT 'MXN',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  reason text NOT NULL,
  created_by uuid NOT NULL,
  spei_clawback_reference text NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reward_clawback_reward
  ON public.reward_clawback_adjustments (reward_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reward_clawback_status
  ON public.reward_clawback_adjustments (status, created_at DESC);

ALTER TABLE public.reward_clawback_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reward_clawback_adjustments FROM PUBLIC;
REVOKE ALL ON TABLE public.reward_clawback_adjustments FROM anon;
REVOKE ALL ON TABLE public.reward_clawback_adjustments FROM authenticated;
GRANT ALL ON TABLE public.reward_clawback_adjustments TO service_role;

COMMENT ON TABLE public.reward_clawback_adjustments IS
  'Ajuste/clawback pendiente sobre recompensa PAID. El reward permanece PAID; no se revierte silenciosamente.';

-- ── Payout atómico (payout + marcar PAID + auditoría) ────────────────────────
CREATE OR REPLACE FUNCTION public.execute_reward_payout(
  p_user_id uuid,
  p_amount_cents bigint,
  p_spei_reference text,
  p_created_by uuid,
  p_reward_ids uuid[],
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min_payout bigint := 20000;
  v_available_total bigint := 0;
  v_selected_total bigint := 0;
  v_reward record;
  v_payout_id uuid;
  v_paid_at timestamptz := now();
  v_rid uuid;
BEGIN
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;
  IF p_spei_reference IS NULL OR length(trim(p_spei_reference)) < 4 THEN
    RAISE EXCEPTION 'invalid_spei_reference';
  END IF;
  IF p_reward_ids IS NULL OR array_length(p_reward_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'reward_ids_required';
  END IF;
  IF p_amount_cents < v_min_payout THEN
    RAISE EXCEPTION 'below_minimum_payout';
  END IF;

  SELECT COALESCE(SUM(creator_share_cents), 0)
    INTO v_available_total
  FROM public.creator_rewards
  WHERE creator_id = p_user_id
    AND status = 'AVAILABLE';

  IF v_available_total < v_min_payout THEN
    RAISE EXCEPTION 'available_below_minimum';
  END IF;
  IF p_amount_cents > v_available_total THEN
    RAISE EXCEPTION 'amount_exceeds_available';
  END IF;

  -- Bloquear filas seleccionadas
  PERFORM 1
  FROM public.creator_rewards
  WHERE id = ANY (p_reward_ids)
  FOR UPDATE;

  SELECT COALESCE(SUM(creator_share_cents), 0)
    INTO v_selected_total
  FROM public.creator_rewards
  WHERE id = ANY (p_reward_ids)
    AND creator_id = p_user_id
    AND status = 'AVAILABLE';

  IF v_selected_total <> p_amount_cents THEN
    RAISE EXCEPTION 'amount_mismatch';
  END IF;

  IF (SELECT COUNT(*) FROM public.creator_rewards
      WHERE id = ANY (p_reward_ids)
        AND creator_id = p_user_id
        AND status = 'AVAILABLE') <> array_length(p_reward_ids, 1) THEN
    RAISE EXCEPTION 'invalid_reward_selection';
  END IF;

  INSERT INTO public.reward_payouts (
    user_id, amount_cents, currency, status, spei_reference, paid_at, created_by, notes, meta
  ) VALUES (
    p_user_id,
    p_amount_cents,
    'MXN',
    'completed',
    trim(p_spei_reference),
    v_paid_at,
    p_created_by,
    NULLIF(trim(p_notes), ''),
    jsonb_build_object('reward_ids', to_jsonb(p_reward_ids))
  )
  RETURNING id INTO v_payout_id;

  UPDATE public.creator_rewards
  SET status = 'PAID',
      paid_at = v_paid_at,
      payout_id = v_payout_id,
      updated_at = v_paid_at
  WHERE id = ANY (p_reward_ids)
    AND creator_id = p_user_id
    AND status = 'AVAILABLE';

  IF (
    SELECT COUNT(*)
    FROM public.creator_rewards
    WHERE id = ANY (p_reward_ids)
      AND creator_id = p_user_id
      AND status = 'PAID'
      AND payout_id = v_payout_id
  ) <> array_length(p_reward_ids, 1) THEN
    RAISE EXCEPTION 'mark_paid_failed';
  END IF;

  FOREACH v_rid IN ARRAY p_reward_ids LOOP
    INSERT INTO public.reward_audit_log (
      event_type, actor_id, entity_type, entity_id, previous_state, new_state, metadata
    ) VALUES (
      'reward_paid',
      p_created_by,
      'creator_reward',
      v_rid,
      'AVAILABLE',
      'PAID',
      jsonb_build_object(
        'payout_id', v_payout_id,
        'spei_reference', trim(p_spei_reference),
        'atomic_rpc', true
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'payout_id', v_payout_id,
    'paid_reward_ids', to_jsonb(p_reward_ids)
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_reward_payout(uuid, bigint, text, uuid, uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_reward_payout(uuid, bigint, text, uuid, uuid[], text) TO service_role;
