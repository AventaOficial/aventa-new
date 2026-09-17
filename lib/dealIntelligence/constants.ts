/**
 * Deal Intelligence — schema versions + fail-closed flags.
 * Persistence ingest stays OFF until explicitly enabled.
 */

export const DEAL_INTELLIGENCE_SCHEMA_VERSION = 'deal_intelligence.v1' as const;

export const DEAL_SCORE_VERSION = 'deal_signals.v1' as const;

export const DEAL_DETECTED_EVENT_TYPE = 'deal.detected' as const;

/** Default OFF — no persistence path may ignore this. */
export function isDealIntelligencePersistenceEnabled(): boolean {
  const v = (process.env.DEAL_INTELLIGENCE_ENABLED ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export const DEAL_INTELLIGENCE_ECONOMY_BOUNDARY = {
  writesConversions: false,
  writesCommissions: false,
  writesLedger: false,
  writesRewards: false,
  writesPayouts: false,
  settlementEnabled: false,
  note: 'Deal Intelligence detects opportunities; it never settles money.',
} as const;

export const DEAL_INTELLIGENCE_PUBLICATION_BOUNDARY = {
  autoPublish: false,
  bypassesDqe: false,
  bypassesVerifier: false,
  bypassesModeration: false,
  note: 'deal.detected ≠ published offer',
} as const;
