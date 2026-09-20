/**
 * CazaOfertasss — FASE 1. Nombres de tablas / RPCs de persistencia.
 * Server-only. No exponer al cliente.
 */

export const CAZA_DEAL_CANDIDATES_TABLE = 'caza_deal_candidates' as const;
export const CAZA_PUBLICATIONS_TABLE = 'caza_publications' as const;
export const CAZA_REVENUE_EVENTS_TABLE = 'caza_revenue_events' as const;
export const CAZA_REVENUE_ATTRIBUTIONS_TABLE = 'caza_revenue_attributions' as const;
export const CAZA_REVENUE_IMPORT_BATCHES_TABLE = 'caza_revenue_import_batches' as const;
export const CAZA_REVENUE_RAW_RECORDS_TABLE = 'caza_revenue_raw_records' as const;
/** FASE 4.1 — mappings de afiliado operados (unique por identity_key). */
export const CAZA_AFFILIATE_MAPPINGS_TABLE = 'caza_affiliate_mappings' as const;

export const CAZA_UPSERT_DEAL_CANDIDATE_RPC = 'caza_upsert_deal_candidate' as const;
export const CAZA_INSERT_PUBLICATION_IDEMPOTENT_RPC =
  'caza_insert_publication_idempotent' as const;
export const CAZA_CLAIM_PUBLICATION_RPC = 'caza_claim_publication' as const;
export const CAZA_SAVE_CLAIMED_PUBLICATION_RPC = 'caza_save_claimed_publication' as const;
export const CAZA_RECOVER_PUBLICATION_LEASES_RPC = 'caza_recover_publication_leases' as const;
export const CAZA_APPEND_REVENUE_EVENT_RPC = 'caza_append_revenue_event' as const;
export const CAZA_APPEND_REVENUE_ATTRIBUTION_RPC = 'caza_append_revenue_attribution' as const;
export const CAZA_UPSERT_THEN_FAIL_RPC = 'caza_upsert_deal_candidate_then_fail' as const;

/** Tablas económicas de Aventa que CazaOfertasss NUNCA debe tocar. */
export const CAZA_FORBIDDEN_AVENTA_MONEY_TABLES = [
  'creator_rewards',
  'payout_intents',
  'reward_payouts',
  'affiliate_ledger_entries',
  'commissions',
  'commission_settlements',
  'economic_events',
  'settlement_runs',
] as const;
