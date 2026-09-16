/**
 * Conversion + Commission Foundation — tipos y fronteras.
 * NO liquida dinero. NO escribe ledger/rewards/payouts.
 */

export const AFFILIATE_NETWORKS = [
  'amazon',
  'mercadolibre',
  'aliexpress',
  'temu',
  'walmart',
  'shein',
  'other',
] as const;

export type AffiliateNetwork = (typeof AFFILIATE_NETWORKS)[number];

export const ECONOMIC_INGEST_SOURCES = ['manual', 'csv_import', 'webhook', 'api'] as const;
export type EconomicIngestSource = (typeof ECONOMIC_INGEST_SOURCES)[number];

export const CONVERSION_STATUSES = [
  'received',
  'pending',
  'confirmed',
  'rejected',
  'reversed',
] as const;
export type ConversionStatus = (typeof CONVERSION_STATUSES)[number];

export const COMMISSION_STATUSES = [
  'reported',
  'pending',
  'approved',
  'rejected',
  'reversed',
] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

export const ATTRIBUTION_LINK_STATUSES = [
  'attributed',
  'unattributed',
  'unresolved',
] as const;
export type AttributionLinkStatus = (typeof ATTRIBUTION_LINK_STATUSES)[number];

/** Transiciones válidas — solo las que una fuente real puede distinguir. */
export const CONVERSION_TRANSITIONS: Record<ConversionStatus, readonly ConversionStatus[]> = {
  received: ['pending', 'confirmed', 'rejected'],
  pending: ['confirmed', 'rejected'],
  confirmed: ['reversed'],
  rejected: [],
  reversed: [],
};

export const COMMISSION_TRANSITIONS: Record<CommissionStatus, readonly CommissionStatus[]> = {
  reported: ['pending', 'approved', 'rejected'],
  pending: ['approved', 'rejected'],
  approved: ['reversed'],
  rejected: [],
  reversed: [],
};

export function canTransitionConversion(
  from: ConversionStatus,
  to: ConversionStatus,
): boolean {
  if (from === to) return false;
  return CONVERSION_TRANSITIONS[from].includes(to);
}

export function canTransitionCommission(
  from: CommissionStatus,
  to: CommissionStatus,
): boolean {
  if (from === to) return false;
  return COMMISSION_TRANSITIONS[from].includes(to);
}

export function isAffiliateNetwork(raw: string | null | undefined): raw is AffiliateNetwork {
  return Boolean(raw && (AFFILIATE_NETWORKS as readonly string[]).includes(raw));
}

export function isEconomicIngestSource(
  raw: string | null | undefined,
): raw is EconomicIngestSource {
  return Boolean(raw && (ECONOMIC_INGEST_SOURCES as readonly string[]).includes(raw));
}

/**
 * Ledger / payout boundary explícita.
 * Foundation puede registrar commission approved sin hacerla "available" al usuario.
 */
export const ECONOMIC_LEDGER_BOUNDARY = {
  foundationWritesLedger: false,
  foundationWritesRewards: false,
  foundationWritesPayouts: false,
  settlementEnabled: false,
  note: 'commission confirmed ≠ user balance available',
} as const;
