-- Evidence protection (retention policy v2). Requires offers_lifecycle_v2.sql and the
-- application change that removes physical deletion from
-- POST /api/admin/moderation-delete-bot-pending to be deployed first.
--
-- 1. Foreign keys from evidence/history tables to offers (and from attribution tables to
--    reward_outbound_clicks) become ON DELETE RESTRICT. Deleting an offer or a click that
--    has evidence fails instead of cascading or nulling attribution.
--    Operational children keep CASCADE: offer_health_state, offer_favorites,
--    community_offers, offer_quality_checks; profiles.welcome_offer_id keeps SET NULL.
-- 2. Append-only evidence tables: statement-level BEFORE DELETE / BEFORE TRUNCATE triggers
--    raise for every role (including service_role and the table owner). Break-glass is an
--    explicit, reviewed migration that disables the trigger for a single operation.
--    Not covered (application deletes exist; money-domain review pending):
--    affiliate_commissions, ledger_settlements, payout_batches.
-- 3. DELETE/TRUNCATE revoked from PUBLIC/anon/authenticated on those tables.
-- Tables missing in an environment are skipped. Idempotent.

SET lock_timeout = '5s';

DO $$
DECLARE
  spec record;
  con record;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('reward_outbound_clicks',   'offer_id', 'offers'),
      ('affiliate_conversions',    'offer_id', 'offers'),
      ('creator_rewards',          'offer_id', 'offers'),
      ('affiliate_conversions',    'click_id', 'reward_outbound_clicks'),
      ('affiliate_ledger_entries', 'click_id', 'reward_outbound_clicks'),
      ('offer_events',             'offer_id', 'offers'),
      ('moderation_outcomes',      'offer_id', 'offers'),
      ('moderation_logs',          'offer_id', 'offers'),
      ('offer_reports',            'offer_id', 'offers'),
      ('offer_votes',              'offer_id', 'offers'),
      ('comments',                 'offer_id', 'offers'),
      ('offer_price_snapshots',    'offer_id', 'offers'),
      ('offer_batch_items',        'offer_id', 'offers'),
      ('offer_observations',       'offer_id', 'offers'),
      ('distribution_publications','offer_id', 'offers')
    ) AS t(child, col, parent)
  LOOP
    IF to_regclass('public.' || spec.child) IS NULL OR to_regclass('public.' || spec.parent) IS NULL THEN
      CONTINUE;
    END IF;

    FOR con IN
      SELECT c.conname, c.confdeltype
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f'
        AND c.conrelid = ('public.' || spec.child)::regclass
        AND c.confrelid = ('public.' || spec.parent)::regclass
        AND array_length(c.conkey, 1) = 1
        AND a.attname = spec.col
    LOOP
      IF con.confdeltype <> 'r' THEN
        EXECUTE format(
          'ALTER TABLE public.%I DROP CONSTRAINT %I, ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(id) ON DELETE RESTRICT NOT VALID',
          spec.child, con.conname, con.conname, spec.col, spec.parent
        );
        EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', spec.child, con.conname);
      END IF;
    END LOOP;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.forbid_evidence_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'append-only evidence table public.%: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '42501',
          HINT = 'Retention policy v2. Requires a reviewed break-glass migration.';
END;
$$;

REVOKE ALL ON FUNCTION public.forbid_evidence_delete() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'reward_outbound_clicks',
    'affiliate_conversions',
    'affiliate_ledger_entries',
    'creator_rewards',
    'reward_payouts',
    'payout_intents',
    'reward_clawback_adjustments',
    'affiliate_commission_revisions',
    'reward_audit_log',
    'affiliate_economic_events',
    'moderation_logs',
    'moderation_outcomes',
    'offer_events'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_evidence_no_delete ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_evidence_no_delete BEFORE DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.forbid_evidence_delete()',
      t
    );
    EXECUTE format('DROP TRIGGER IF EXISTS trg_evidence_no_truncate ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_evidence_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.forbid_evidence_delete()',
      t
    );
    EXECUTE format('REVOKE DELETE, TRUNCATE ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format(
      'COMMENT ON TRIGGER trg_evidence_no_delete ON public.%I IS %L',
      t, 'Append-only evidence (retention policy v2).'
    );
  END LOOP;
END $$;
