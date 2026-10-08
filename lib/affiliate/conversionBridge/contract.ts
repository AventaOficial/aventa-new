/**
 * Contrato único de un proveedor de afiliados.
 * Un clic, una estimación o un pendiente de red no son una venta confirmada.
 */

export const AFFILIATE_PROVIDERS = ['MERCADOLIBRE'] as const;
export type AffiliateProvider = (typeof AFFILIATE_PROVIDERS)[number];

export const SOURCE_MODES = ['OFFICIAL_REPORT_IMPORT', 'API'] as const;
export type SourceMode = (typeof SOURCE_MODES)[number];

/** Estados canónicos persistidos. OBSERVED entra como PENDING. */
export const CANONICAL_CONVERSION_STATES = [
  'PENDING',
  'APPROVED',
  'CONFIRMED',
  'REVERSED',
  'INVALID',
] as const;
export type CanonicalConversionState = (typeof CANONICAL_CONVERSION_STATES)[number];

export const CANONICAL_COMMISSION_STATES = ['PENDING', 'CONFIRMED', 'REVERSED'] as const;
export type CanonicalCommissionState = (typeof CANONICAL_COMMISSION_STATES)[number];

export const ACTOR_KINDS = ['HUMAN', 'MACHINE_HUNTER', 'SYSTEM', 'UNKNOWN'] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

export type ProviderEvidence = {
  provider: AffiliateProvider;
  source_mode: SourceMode;
  source_batch_id: string;
  source_row_reference: string;
  external_conversion_id: string;
  external_order_id: string | null;
  imported_at: string;
  provider_event_version: string;
};

export type CampaignAttribution = {
  status: 'ATTRIBUTED' | 'UNKNOWN';
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
};

export type NormalizedProviderEvent = {
  provider: AffiliateProvider;
  sourceMode: SourceMode;
  testData: boolean;
  externalConversionId: string;
  externalOrderId: string | null;
  clickReference: string | null;
  offerReference: string | null;
  occurredAt: string;
  providerStatus: string;
  canonicalStatus: CanonicalConversionState | 'UNKNOWN';
  grossCommissionCents: number | null;
  currency: string | null;
  reversal: boolean;
  rowReference: string;
  providerEventVersion: string;
  importedAt: string;
};

export type ProviderParseResult =
  | { ok: true; events: NormalizedProviderEvent[]; schemaVersion: string }
  | { ok: false; code: string };

export type AffiliateProviderAdapter = {
  provider: AffiliateProvider;
  sourceMode: SourceMode;
  providerEventVersion: string;
  /** Los reportes de prueba nunca alimentan la economía de producción. */
  testData: boolean;
  parseReport(report: string, importedAt: string): ProviderParseResult;
};
